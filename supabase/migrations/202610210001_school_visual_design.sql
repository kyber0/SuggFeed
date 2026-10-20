BEGIN;
-- Presentation-only extension: old configuration versions remain valid and unchanged.
CREATE FUNCTION public.school_design_luminance(color text) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE bytes bytea; channel double precision; result double precision:=0; i integer;
BEGIN
 bytes:=decode(substr(color,2),'hex');
 FOR i IN 0..2 LOOP channel:=get_byte(bytes,i)/255.0; channel:=CASE WHEN channel<=0.04045 THEN channel/12.92 ELSE power((channel+0.055)/1.055,2.4) END; result:=result+channel*(ARRAY[0.2126,0.7152,0.0722])[i+1]; END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.validate_school_design(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE mode text;role text;surface text;entry record;c jsonb;v jsonb;list text;item jsonb;allowed text[];sections jsonb;definitions jsonb:=
'{"home":{"hidden":["points"],"order":["hero","hub","ideas"]},"feed":{"hidden":["promo","supported","help"],"order":["promo","supported","help"]},"roadmap":{"hidden":["summary"],"order":[]},"idea":{"hidden":["progress"],"order":[]},"profile":{"hidden":["stats"],"order":[]},"submit":{"hidden":[],"order":[]},"notifications":{"hidden":[],"order":[]},"inbox":{"hidden":[],"order":[]},"staff":{"hidden":[],"order":[]}}';a double precision;b double precision;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT p ?& ARRAY['light','dark','corners','font','pages'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k<>ALL(ARRAY['light','dark','corners','font','pages'])) THEN RAISE EXCEPTION 'Unsupported design fields' USING ERRCODE='22023'; END IF;
 FOREACH mode IN ARRAY ARRAY['light','dark'] LOOP
  c:=p->mode;allowed:=ARRAY['primary','secondary','background','surface','raised','text','muted','border','link'];
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid theme' USING ERRCODE='22023';END IF;
  IF NOT c ?& allowed OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k<>ALL(allowed)) THEN RAISE EXCEPTION 'Unsupported theme roles' USING ERRCODE='22023'; END IF;
  FOREACH role IN ARRAY allowed LOOP IF jsonb_typeof(c->role) IS DISTINCT FROM 'string' OR c->>role !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Use six-digit colors' USING ERRCODE='22023'; END IF;END LOOP;
  FOREACH role IN ARRAY ARRAY['text','muted','link'] LOOP FOREACH surface IN ARRAY ARRAY['background','surface','raised'] LOOP
   a:=public.school_design_luminance(c->>role);b:=public.school_design_luminance(c->>surface);
   IF (greatest(a,b)+0.05)/(least(a,b)+0.05)<4.5 THEN RAISE EXCEPTION 'Theme text needs 4.5:1 contrast' USING ERRCODE='22023'; END IF;
  END LOOP;END LOOP;
 END LOOP;
 IF p->>'corners' IS NULL OR p->>'corners' NOT IN('square','rounded','soft') OR p->>'font' IS NULL OR p->>'font' NOT IN('brand','inter','system') OR jsonb_typeof(p->'pages') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Unsupported presentation settings' USING ERRCODE='22023'; END IF;
 FOR entry IN SELECT * FROM jsonb_each(p->'pages') LOOP
  IF NOT definitions ? entry.key THEN RAISE EXCEPTION 'Unsupported screen' USING ERRCODE='22023'; END IF;v:=entry.value;
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid screen settings' USING ERRCODE='22023'; END IF;
  IF NOT v ?& ARRAY['layout','spacing','cards','hidden','order'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE k<>ALL(ARRAY['layout','spacing','cards','hidden','order'])) THEN RAISE EXCEPTION 'Unsupported screen fields' USING ERRCODE='22023'; END IF;
  IF v->>'layout' IS NULL OR v->>'layout' NOT IN('default','wide','focused') OR v->>'spacing' IS NULL OR v->>'spacing' NOT IN('compact','comfortable','airy') OR v->>'cards' IS NULL OR v->>'cards' NOT IN('outlined','soft','flat') THEN RAISE EXCEPTION 'Unsupported layout' USING ERRCODE='22023'; END IF;
  FOREACH list IN ARRAY ARRAY['hidden','order'] LOOP
   IF jsonb_typeof(v->list) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid section list' USING ERRCODE='22023'; END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(v->list))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(v->list) x) THEN RAISE EXCEPTION 'Duplicate section' USING ERRCODE='22023';END IF;
   FOR item IN SELECT * FROM jsonb_array_elements(v->list) LOOP IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR NOT (definitions->entry.key->list) @> jsonb_build_array(item) THEN RAISE EXCEPTION 'Unsupported section change' USING ERRCODE='22023'; END IF;END LOOP;
  END LOOP;
 END LOOP;
END $$;
-- Extend the live validator without losing subsequent security fixes.
DO $migration$ DECLARE definition text;updated text;BEGIN
 definition:=pg_get_functiondef('public.validate_school_customization(jsonb)'::regprocedure);
 updated:=replace(definition,$old$allowed:=ARRAY['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email'];$old$,$new$allowed:=ARRAY['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email','design'];$new$);
 IF updated=definition THEN RAISE EXCEPTION 'Customization validator changed; review extension';END IF;
 updated:=replace(updated,$old$BEGIN$old$,$new$BEGIN
 IF p ? 'design' THEN PERFORM public.validate_school_design(p->'design'); END IF;$new$);
 EXECUTE updated;
 definition:=pg_get_functiondef('public.publish_school_customization(uuid,uuid,integer)'::regprocedure);
 updated:=replace(definition,$old$ SELECT version INTO policy_version$old$,$new$ IF previous->'design' IS DISTINCT FROM p->'design' THEN summary:=summary || '["School theme and page layouts"]'::jsonb;END IF;
 SELECT version INTO policy_version$new$);
 IF updated=definition THEN RAISE EXCEPTION 'Publication function changed; review extension';END IF;
 EXECUTE updated;
END $migration$;
REVOKE ALL ON FUNCTION public.school_design_luminance(text),public.validate_school_design(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_design_luminance(text),public.validate_school_design(jsonb) TO service_role;
COMMIT;
