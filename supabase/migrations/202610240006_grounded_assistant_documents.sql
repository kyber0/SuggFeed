BEGIN;
CREATE TABLE public.assistant_document_versions(
 school_id uuid NOT NULL REFERENCES public.schools(id),version integer NOT NULL CHECK(version>0),entries jsonb NOT NULL CHECK(jsonb_typeof(entries)='array' AND octet_length(entries::text)<=260000),
 published_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(school_id,version));
CREATE TABLE public.assistant_document_state(
 school_id uuid PRIMARY KEY REFERENCES public.schools(id),revision integer NOT NULL DEFAULT 0,draft jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(draft)='array' AND octet_length(draft::text)<=260000),
 published_version integer,saved_by uuid REFERENCES public.profiles(id),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(school_id,published_version) REFERENCES public.assistant_document_versions(school_id,version));
ALTER TABLE public.assistant_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_document_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_document_versions,public.assistant_document_state FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE TRIGGER assistant_documents_immutable BEFORE UPDATE OR DELETE ON public.assistant_document_versions FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_audit();
CREATE FUNCTION public.validate_assistant_documents(p_entries jsonb,p_publishing boolean) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE item jsonb;ids text[]:='{}';
BEGIN
 IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries)>12 OR octet_length(p_entries::text)>260000 THEN RAISE EXCEPTION 'Invalid document collection' USING ERRCODE='22023';END IF;
 FOR item IN SELECT jsonb_array_elements(p_entries) LOOP
  IF jsonb_typeof(item)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('id','title','text')) OR item->>'id' IS NULL OR item->>'id'!~'^school-doc-[a-z0-9-]{1,48}$' OR item->>'id'=ANY(ids) OR jsonb_typeof(item->'title') IS DISTINCT FROM 'string' OR length(trim(item->>'title')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(item->'text') IS DISTINCT FROM 'string' OR length(item->>'text')>60000 OR p_publishing AND length(trim(item->>'text'))=0 THEN RAISE EXCEPTION 'Invalid document fields' USING ERRCODE='22023';END IF;
  ids:=array_append(ids,item->>'id');
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_assistant_documents(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE FUNCTION public.assistant_documents_action(p_school uuid,p_actor uuid,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE state public.assistant_document_state;next_version integer;result jsonb;settings jsonb;school_name text;configuration jsonb;
BEGIN
 IF p_school IS NULL OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status='active') OR p_actor IS NULL AND NOT public.school_publication_allowed(p_school) OR p_actor IS NOT NULL AND NOT public.school_actor_has_role(p_school,p_actor,ARRAY['student','moderator','admin']) THEN RAISE EXCEPTION 'School access required' USING ERRCODE='42501';END IF;
 IF p_action='published' THEN
  SELECT jsonb_build_object('version',v.version,'entries',v.entries) INTO result FROM public.assistant_document_state s JOIN public.assistant_document_versions v ON v.school_id=s.school_id AND v.version=s.published_version WHERE s.school_id=p_school;
  SELECT jsonb_build_object('version',version,'privacyNotice',privacy_notice,'participationNotice',terms_notice,'privacyContact',privacy_contact,'schoolContact',school_contact,'agePolicy',age_policy,'visibility',publication_policy,'retentionDays',retention_days) INTO settings FROM public.school_settings WHERE school_id=p_school AND approved_at IS NOT NULL;
  configuration:=public.school_published_configuration(p_school);
  configuration:=jsonb_build_object('welcome',configuration->'welcome','features',configuration->'features','categories',configuration->'categories','form',configuration->'form','labels',configuration->'labels','stageDescriptions',configuration->'stageDescriptions');
  SELECT name INTO school_name FROM public.schools WHERE id=p_school;
  RETURN coalesce(result,jsonb_build_object('version',0,'entries','[]'::jsonb))||jsonb_build_object('settings',settings,'schoolName',school_name,'configuration',configuration);
 END IF;
 IF NOT public.school_actor_has_role(p_school,p_actor,ARRAY['admin']) THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501';END IF;
 IF p_action='extract' THEN
  IF NOT public.assistant_consume(encode(sha256(convert_to('document-extract:'||p_school::text||':'||p_actor::text,'UTF8')),'hex'),10,3600) THEN RAISE EXCEPTION 'Document upload limit reached' USING ERRCODE='PT429';END IF;
  RETURN '{}';
 END IF;
 IF p_action='state' THEN
  SELECT * INTO state FROM public.assistant_document_state WHERE school_id=p_school;
  RETURN jsonb_build_object('exists',state.school_id IS NOT NULL,'revision',coalesce(state.revision,0),'draft',state.draft,'publishedVersion',state.published_version,'updatedAt',state.updated_at,'history',(SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') FROM(SELECT version,created_at FROM public.assistant_document_versions WHERE school_id=p_school ORDER BY version DESC LIMIT 10)v));
 END IF;
 IF p_action NOT IN('save','publish') THEN RAISE EXCEPTION 'Unknown knowledge action' USING ERRCODE='22023';END IF;
 PERFORM public.validate_assistant_documents(p_data->'entries',p_action='publish');
 INSERT INTO public.assistant_document_state(school_id) VALUES(p_school) ON CONFLICT DO NOTHING;
 SELECT * INTO state FROM public.assistant_document_state WHERE school_id=p_school FOR UPDATE;
 IF state.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'Document draft changed; preserve your text and refresh' USING ERRCODE='40001';END IF;
 IF p_action='save' THEN
  UPDATE public.assistant_document_state SET draft=p_data->'entries',revision=revision+1,saved_by=p_actor,updated_at=now() WHERE school_id=p_school RETURNING revision INTO next_version;
  RETURN jsonb_build_object('revision',next_version,'publishedVersion',state.published_version);
 END IF;
 IF p_data->>'reviewed' IS DISTINCT FROM 'true' OR state.draft IS DISTINCT FROM p_data->'entries' THEN RAISE EXCEPTION 'Save and review this exact Document draft before publishing' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM public.assistant_document_versions WHERE school_id=p_school AND published_by=p_actor AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'Please wait before publishing again' USING ERRCODE='PT429';END IF;
 next_version:=coalesce(state.published_version,0)+1;
 INSERT INTO public.assistant_document_versions(school_id,version,entries,published_by) VALUES(p_school,next_version,state.draft,p_actor);
 UPDATE public.assistant_document_state SET published_version=next_version,revision=revision+1,updated_at=now() WHERE school_id=p_school;
 RETURN jsonb_build_object('version',next_version,'revision',state.revision+1);
END $$;
REVOKE ALL ON FUNCTION public.assistant_documents_action(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,tenant_executor,service_role;
GRANT EXECUTE ON FUNCTION public.assistant_documents_action(uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
