BEGIN;
CREATE TABLE public.assistant_school_versions(
 school_id uuid NOT NULL REFERENCES public.schools(id),version integer NOT NULL CHECK(version>0),entries jsonb NOT NULL CHECK(jsonb_typeof(entries)='array' AND octet_length(entries::text)<=200000),
 published_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(school_id,version));
CREATE TABLE public.assistant_school_state(
 school_id uuid PRIMARY KEY REFERENCES public.schools(id),revision integer NOT NULL DEFAULT 0,draft jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(draft)='array' AND octet_length(draft::text)<=200000),
 published_version integer,saved_by uuid REFERENCES public.profiles(id),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(school_id,published_version) REFERENCES public.assistant_school_versions(school_id,version));
ALTER TABLE public.assistant_school_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_school_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_school_versions,public.assistant_school_state FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE TRIGGER assistant_versions_immutable BEFORE UPDATE OR DELETE ON public.assistant_school_versions FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_audit();
CREATE FUNCTION public.validate_school_faqs(p_entries jsonb,p_publishing boolean) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE entry jsonb; language text; key text; value text; ids text[]:='{}'; item jsonb;
BEGIN
 IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries)>30 OR octet_length(p_entries::text)>200000 THEN RAISE EXCEPTION 'Invalid FAQ collection' USING ERRCODE='22023';END IF;
 FOR entry IN SELECT jsonb_array_elements(p_entries) LOOP
  IF jsonb_typeof(entry)<>'object' THEN RAISE EXCEPTION 'Invalid FAQ' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN('id','category','questions','answers','keywords','aliases')) OR entry->>'id' IS NULL OR entry->>'id'!~'^school-[a-z0-9-]{1,48}$' OR entry->>'id'=ANY(ids) OR entry->>'category' IS NULL OR entry->>'category' NOT IN('school_profile','admissions','academics','services','policies','schedules','contacts','student_life') THEN RAISE EXCEPTION 'Invalid FAQ identity or category' USING ERRCODE='22023';END IF;
  ids:=array_append(ids,entry->>'id');
  FOREACH key IN ARRAY ARRAY['questions','answers','aliases'] LOOP
   IF jsonb_typeof(entry->key)<>'object' OR entry->key IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry->key) k WHERE k NOT IN('en','fil','taglish')) THEN RAISE EXCEPTION 'Invalid FAQ translations' USING ERRCODE='22023';END IF;
  END LOOP;
  FOREACH language IN ARRAY ARRAY['en','fil','taglish'] LOOP
   FOREACH key IN ARRAY ARRAY['questions','answers'] LOOP
    value:=entry->key->>language;
    IF value IS NULL OR jsonb_typeof(entry->key->language)<>'string' OR length(value)>(CASE WHEN key='questions' THEN 300 ELSE 1600 END) OR p_publishing AND (length(trim(value))=0 OR value~*'\[placeholder|\[todo') THEN RAISE EXCEPTION 'Complete all reviewed translations' USING ERRCODE='22023';END IF;
   END LOOP;
   IF entry->'aliases'->language IS NULL OR jsonb_typeof(entry->'aliases'->language)<>'array' OR jsonb_array_length(entry->'aliases'->language)>12 THEN RAISE EXCEPTION 'Invalid FAQ aliases' USING ERRCODE='22023';END IF;
   FOR item IN SELECT jsonb_array_elements(entry->'aliases'->language) LOOP
    IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>300 THEN RAISE EXCEPTION 'Invalid FAQ alias' USING ERRCODE='22023';END IF;
   END LOOP;
  END LOOP;
  IF entry->'keywords' IS NULL OR jsonb_typeof(entry->'keywords')<>'array' OR jsonb_array_length(entry->'keywords')>24 OR p_publishing AND jsonb_array_length(entry->'keywords')<1 THEN RAISE EXCEPTION 'Add FAQ topic keywords' USING ERRCODE='22023';END IF;
  FOR item IN SELECT jsonb_array_elements(entry->'keywords') LOOP
   IF jsonb_typeof(item)<>'string' OR item#>>'{}'!~'^[a-z0-9-]{1,40}$' THEN RAISE EXCEPTION 'Invalid topic keyword' USING ERRCODE='22023';END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_school_faqs(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.assistant_knowledge_action(p_school uuid,p_actor uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE state public.assistant_school_state;next_version integer;result jsonb;
BEGIN
 IF p_school IS NULL OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status='active') OR p_actor IS NULL AND NOT public.school_publication_allowed(p_school) OR p_actor IS NOT NULL AND NOT public.school_actor_has_role(p_school,p_actor,ARRAY['student','moderator','admin']) THEN RAISE EXCEPTION 'School access required' USING ERRCODE='42501';END IF;
 IF p_action='published' THEN
  SELECT jsonb_build_object('version',v.version,'entries',v.entries) INTO result FROM public.assistant_school_state s JOIN public.assistant_school_versions v ON v.school_id=s.school_id AND v.version=s.published_version WHERE s.school_id=p_school;
  RETURN coalesce(result,jsonb_build_object('version',0,'entries',NULL));
 END IF;
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501';END IF;
 IF p_action='state' THEN
  SELECT * INTO state FROM public.assistant_school_state WHERE school_id=p_school;
  RETURN jsonb_build_object('exists',state.school_id IS NOT NULL,'revision',coalesce(state.revision,0),'draft',state.draft,'publishedVersion',state.published_version,'updatedAt',state.updated_at,'history',(SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') FROM(SELECT version,created_at FROM public.assistant_school_versions WHERE school_id=p_school ORDER BY version DESC LIMIT 10)v));
 END IF;
 IF p_action NOT IN('save','publish') THEN RAISE EXCEPTION 'Unknown knowledge action' USING ERRCODE='22023';END IF;
 PERFORM public.validate_school_faqs(p_data->'entries',p_action='publish');
 INSERT INTO public.assistant_school_state(school_id) VALUES(p_school) ON CONFLICT DO NOTHING;
 SELECT * INTO state FROM public.assistant_school_state WHERE school_id=p_school FOR UPDATE;
 IF state.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'FAQ draft changed; preserve your text and refresh' USING ERRCODE='40001';END IF;
 IF p_action='save' THEN
  UPDATE public.assistant_school_state SET draft=p_data->'entries',revision=revision+1,saved_by=p_actor,updated_at=now() WHERE school_id=p_school RETURNING revision INTO next_version;
  RETURN jsonb_build_object('revision',next_version,'publishedVersion',state.published_version);
 END IF;
 IF p_data->>'reviewed' IS DISTINCT FROM 'true' OR state.draft IS DISTINCT FROM p_data->'entries' THEN RAISE EXCEPTION 'Save and review this exact FAQ draft before publishing' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.assistant_school_versions WHERE school_id=p_school AND published_by=p_actor AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'Please wait before publishing again' USING ERRCODE='PT429';END IF;
 next_version:=coalesce(state.published_version,0)+1;
 INSERT INTO public.assistant_school_versions(school_id,version,entries,published_by) VALUES(p_school,next_version,state.draft,p_actor);
 UPDATE public.assistant_school_state SET published_version=next_version,revision=revision+1,updated_at=now() WHERE school_id=p_school;
 RETURN jsonb_build_object('version',next_version,'revision',state.revision+1);
END $$;
REVOKE ALL ON FUNCTION public.assistant_knowledge_action(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT EXECUTE ON FUNCTION public.assistant_knowledge_action(uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
