BEGIN;
-- Accept a six-digit accent only; existing schema, tenant and publication checks remain.
CREATE OR REPLACE FUNCTION public.validate_school_customization(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c jsonb;q jsonb;k text;allowed text[];n integer;section record;field record;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>80000 OR p->>'schemaVersion'<>'1' OR (p->>'palette' NOT IN('navy','forest','purple','burgundy','teal','indigo') AND p->>'palette' !~ '^#[0-9a-fA-F]{6}$') THEN RAISE EXCEPTION 'Invalid customization' USING ERRCODE='22023'; END IF;

 IF NOT p ?& ARRAY['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email'] OR p->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'palette') IS DISTINCT FROM 'string' OR (p->>'palette' NOT IN('navy','forest','purple','burgundy','teal','indigo') AND p->>'palette' !~ '^#[0-9a-fA-F]{6}$') THEN RAISE EXCEPTION 'Missing customization fields' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['logo','cover'] LOOP IF p->k<>'null'::jsonb AND (jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR (p->>k)::uuid IS NULL) THEN RAISE EXCEPTION 'Invalid branding reference' USING ERRCODE='22023'; END IF; END LOOP;
 FOR section IN SELECT * FROM (VALUES('welcome',ARRAY['headline','intro','message','help','links']),('features',ARRAY['comments','voting','roadmap','sharing','anonymous']),('form',ARRAY['instructions','example','questions','attachments']),('labels',ARRAY['approved','in_progress','resolved']),('stageDescriptions',ARRAY['approved','in_progress','resolved']),('email',ARRAY['invitation','introduction','digest'])) x(name,keys) LOOP
  c:=p->section.name;
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid customization section' USING ERRCODE='22023'; END IF;
  IF NOT c ?& section.keys OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE NOT key=ANY(section.keys)) THEN RAISE EXCEPTION 'Missing or unsupported section fields' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR field IN SELECT * FROM (VALUES(p->'displayName',0,60),(p->'welcome'->'headline',0,100),(p->'welcome'->'intro',0,500),(p->'welcome'->'message',0,1500),(p->'welcome'->'help',0,500),(p->'form'->'instructions',0,1000),(p->'form'->'example',0,1000),(p->'labels'->'approved',1,40),(p->'labels'->'in_progress',1,40),(p->'labels'->'resolved',1,40),(p->'stageDescriptions'->'approved',0,240),(p->'stageDescriptions'->'in_progress',0,240),(p->'stageDescriptions'->'resolved',0,240),(p->'email'->'invitation',0,1000),(p->'email'->'introduction',0,1000),(p->'form'->'attachments',1,8),(p->'email'->'digest',1,6)) x(value,minlen,maxlen) LOOP
  IF jsonb_typeof(field.value) IS DISTINCT FROM 'string' OR length(btrim(field.value#>>'{}')) NOT BETWEEN field.minlen AND field.maxlen THEN RAISE EXCEPTION 'Invalid customization text' USING ERRCODE='22023'; END IF;
 END LOOP;
 allowed:=ARRAY['schemaVersion','displayName','palette','logo','cover','welcome','categories','features','form','labels','stageDescriptions','email'];
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE NOT x=ANY(allowed)) OR length(p->>'displayName')>60 THEN RAISE EXCEPTION 'Unsupported customization fields' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'welcome')<>'object' OR jsonb_typeof(p->'features')<>'object' OR jsonb_typeof(p->'form')<>'object' OR jsonb_typeof(p->'labels')<>'object' OR jsonb_typeof(p->'email')<>'object' OR jsonb_typeof(p->'categories')<>'array' OR jsonb_array_length(p->'categories') NOT BETWEEN 1 AND 60 OR jsonb_typeof(p->'form'->'questions')<>'array' OR jsonb_array_length(p->'form'->'questions')>8 OR jsonb_typeof(p->'welcome'->'links')<>'array' OR jsonb_array_length(p->'welcome'->'links')>5 THEN RAISE EXCEPTION 'Invalid customization sections' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['comments','voting','roadmap','sharing','anonymous'] LOOP IF jsonb_typeof(p->'features'->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid feature flag' USING ERRCODE='22023'; END IF; END LOOP;
 IF p->'form'->>'attachments' NOT IN('off','optional','required') OR p->'email'->>'digest' NOT IN('weekly','off') THEN RAISE EXCEPTION 'Unsupported form or email setting' USING ERRCODE='22023'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'categories') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023'; END IF;
  IF NOT c ?& ARRAY['id','name','slug','description','icon','active'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE key<>ALL(ARRAY['id','name','slug','description','icon','active'])) THEN RAISE EXCEPTION 'Invalid category fields' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['id','name','slug','description','icon'] LOOP IF jsonb_typeof(c->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid category text' USING ERRCODE='22023'; END IF; END LOOP;
  IF (c->>'id')::uuid IS NULL OR length(btrim(c->>'name')) NOT BETWEEN 1 AND 40 OR length(c->>'description')>200 OR c->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(c->>'slug')>63 OR c->>'icon' NOT IN('board','message','care','users','shield','list','calendar','book','building','globe') OR jsonb_typeof(c->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT count(*) INTO n FROM jsonb_array_elements(p->'categories') item WHERE (item->>'active')::boolean;
 IF n NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT lower(value->>'name')) FROM jsonb_array_elements(p->'categories'))<>jsonb_array_length(p->'categories') OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p->'categories'))<>jsonb_array_length(p->'categories') OR (SELECT count(DISTINCT value->>'slug') FROM jsonb_array_elements(p->'categories'))<>jsonb_array_length(p->'categories') THEN RAISE EXCEPTION 'Use unique categories and 1-20 active categories' USING ERRCODE='22023'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p->'form'->'questions') LOOP
  IF jsonb_typeof(q) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid question' USING ERRCODE='22023'; END IF;
  IF NOT q ?& ARRAY['id','label','help','type','required','options'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(q) key WHERE key<>ALL(ARRAY['id','label','help','type','required','options'])) THEN RAISE EXCEPTION 'Invalid question fields' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['id','label','help','type'] LOOP IF jsonb_typeof(q->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid question text' USING ERRCODE='22023'; END IF; END LOOP;
  IF jsonb_typeof(q->'options') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid choices' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options') o WHERE jsonb_typeof(o) IS DISTINCT FROM 'string' OR length(btrim(o#>>'{}')) NOT BETWEEN 1 AND 80) OR (SELECT count(DISTINCT o) FROM jsonb_array_elements(q->'options') o)<>jsonb_array_length(q->'options') THEN RAISE EXCEPTION 'Invalid or duplicate choices' USING ERRCODE='22023'; END IF;
  IF (q->>'id')::uuid IS NULL OR length(btrim(q->>'label')) NOT BETWEEN 1 AND 120 OR length(q->>'help')>240 OR q->>'type' NOT IN('short','long','choice') OR jsonb_typeof(q->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(q->'options')<>'array' OR (q->>'type'='choice' AND jsonb_array_length(q->'options') NOT BETWEEN 2 AND 10) OR (q->>'type'<>'choice' AND jsonb_array_length(q->'options')<>0) THEN RAISE EXCEPTION 'Invalid question' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p->'form'->'questions'))<>jsonb_array_length(p->'form'->'questions') THEN RAISE EXCEPTION 'Duplicate question IDs' USING ERRCODE='22023'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'welcome'->'links') LOOP
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid official link' USING ERRCODE='22023'; END IF;
 IF NOT c ?& ARRAY['label','url'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) key WHERE key<>ALL(ARRAY['label','url'])) OR jsonb_typeof(c->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'label') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid official link fields' USING ERRCODE='22023'; END IF;
 IF c->>'url' !~ '^https://[^/@[:space:]?#]+([/?#]|$)' OR length(c->>'url')>500 OR length(btrim(c->>'label')) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Invalid official link' USING ERRCODE='22023'; END IF; END LOOP;
END $$;
COMMIT;
