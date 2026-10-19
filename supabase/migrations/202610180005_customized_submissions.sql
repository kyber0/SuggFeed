BEGIN;
CREATE TABLE public.school_upload_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
 owner_hash text NOT NULL CHECK(owner_hash ~ '^[a-f0-9]{64}$'),actor_id uuid REFERENCES public.profiles(id),
 completed_at timestamptz,purpose text NOT NULL CHECK(purpose IN('logo','cover','submission')),declared_size integer NOT NULL CHECK(declared_size BETWEEN 1 AND 5242880),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours',UNIQUE(school_id,id)
);
CREATE INDEX school_upload_intent_budget ON public.school_upload_intents(school_id,owner_hash,created_at);
CREATE TABLE public.submission_uploads (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,owner_hash text NOT NULL CHECK(owner_hash ~ '^[a-f0-9]{64}$'),
 storage_path text NOT NULL UNIQUE,size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 submission_id uuid,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day',UNIQUE(school_id,id),
 FOREIGN KEY(school_id,submission_id) REFERENCES public.submissions(school_id,id) ON DELETE CASCADE,
 CHECK(storage_path=school_id::text||'/'||id::text||'.webp')
);
ALTER TABLE public.submissions ADD COLUMN form_version_id uuid;
ALTER TABLE public.submissions ADD FOREIGN KEY(school_id,form_version_id) REFERENCES public.school_form_versions(school_id,id) ON DELETE RESTRICT;
CREATE TABLE public.submission_answers (
 school_id uuid NOT NULL,submission_id uuid NOT NULL,form_version_id uuid NOT NULL,answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object' AND octet_length(answers::text)<=16000),
 PRIMARY KEY(school_id,submission_id),FOREIGN KEY(school_id,submission_id) REFERENCES public.submissions(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,form_version_id) REFERENCES public.school_form_versions(school_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.school_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_upload_intents,public.submission_uploads,public.submission_answers FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
GRANT SELECT ON public.school_upload_intents,public.submission_uploads,public.submission_answers TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('school-upload-sources','school-upload-sources',false,5242880,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.reserve_school_upload(p_school uuid,p_actor uuid,p_owner_hash text,p_purpose text,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result uuid;
BEGIN
 IF p_owner_hash IS NULL OR p_owner_hash !~ '^[a-f0-9]{64}$' OR p_purpose IS NULL OR p_purpose NOT IN('logo','cover','submission') OR p_size IS NULL OR p_size<1 OR p_size>(CASE WHEN p_purpose='logo' THEN 2097152 ELSE 5242880 END) THEN RAISE EXCEPTION 'Invalid image upload' USING ERRCODE='22023'; END IF;
 IF p_purpose IN('logo','cover') THEN
  IF NOT public.school_customization_admin(p_school,p_actor) OR NOT coalesce((SELECT editing_enabled FROM public.school_customization_state WHERE school_id=p_school),p_school='00000000-0000-4000-8000-000000000001'::uuid) THEN RAISE EXCEPTION 'School editor required' USING ERRCODE='42501'; END IF;
 ELSE
  IF public.school_published_configuration(p_school)->'form'->>'attachments'='off' OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status='active') OR (p_actor IS NOT NULL AND NOT public.school_actor_has_role(p_school,p_actor,ARRAY['student','admin','moderator'])) OR (p_actor IS NULL AND (NOT public.school_publication_allowed(p_school) OR NOT public.school_feature_enabled(p_school,'anonymous'))) THEN RAISE EXCEPTION 'School image uploads unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('school-image'),hashtext(p_school::text));
 IF (SELECT count(*) FROM public.school_upload_intents WHERE school_id=p_school AND created_at>now()-interval '1 hour')>=200 OR (SELECT count(*) FROM public.school_upload_intents WHERE school_id=p_school AND owner_hash=p_owner_hash AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'Image upload limit reached' USING ERRCODE='54000'; END IF;
 INSERT INTO public.school_upload_intents(school_id,actor_id,owner_hash,purpose,declared_size) VALUES(p_school,p_actor,p_owner_hash,p_purpose,p_size) RETURNING id INTO result;
 RETURN jsonb_build_object('id',result,'path',p_school::text||'/'||result::text);
END $$;
CREATE FUNCTION public.register_processed_school_upload(p_school uuid,p_actor uuid,p_owner_hash text,p_id uuid,p_size integer,p_width integer,p_height integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intent public.school_upload_intents;
BEGIN
 SELECT * INTO intent FROM public.school_upload_intents WHERE school_id=p_school AND id=p_id AND owner_hash=p_owner_hash AND actor_id IS NOT DISTINCT FROM p_actor AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Image upload expired or changed owner' USING ERRCODE='42501'; END IF;
 IF intent.purpose IN('logo','cover') THEN
  PERFORM public.register_school_brand_asset(p_school,p_actor,p_id,intent.purpose,p_size,p_width,p_height);
 ELSE
  IF (p_actor IS NOT NULL AND NOT public.school_actor_has_role(p_school,p_actor,ARRAY['student','admin','moderator'])) OR (p_actor IS NULL AND NOT public.school_publication_allowed(p_school)) THEN RAISE EXCEPTION 'School access changed' USING ERRCODE='42501'; END IF;
  INSERT INTO public.submission_uploads(id,school_id,owner_hash,storage_path,size_bytes) VALUES(p_id,p_school,p_owner_hash,p_school::text||'/'||p_id::text||'.webp',p_size);
 END IF;
 UPDATE public.school_upload_intents SET completed_at=now() WHERE id=p_id;
END $$;
CREATE FUNCTION public.validate_custom_submission_answers(p_schema jsonb,p_answers jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE q jsonb;answer text;
BEGIN
 IF p_answers IS NULL OR jsonb_typeof(p_answers)<>'object' OR octet_length(p_answers::text)>16000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_answers) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_schema->'questions') AS question_item(value) WHERE question_item.value->>'id'=k)) THEN RAISE EXCEPTION 'Invalid school question answers' USING ERRCODE='22023'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p_schema->'questions') LOOP
  answer:=coalesce(p_answers->> (q->>'id'),'');
  IF p_answers ? (q->>'id') AND jsonb_typeof(p_answers->(q->>'id'))<>'string' OR ((q->>'required')::boolean AND length(btrim(answer))=0) OR length(answer)>(CASE WHEN q->>'type'='long' THEN 1000 WHEN q->>'type'='choice' THEN 80 ELSE 200 END) OR (answer<>'' AND q->>'type'='choice' AND NOT (q->'options' ? answer)) THEN RAISE EXCEPTION 'Answer the current school questions' USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.create_customized_submission(p_owner_hash text,p_request_id uuid,p_payload_hash text,p_title text,p_description text,p_category_id uuid,p_anonymous boolean,p_tracking_hash text,p_form_version uuid,p_answers jsonb,p_files uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE school uuid:=public.tenant_school_id();actor uuid:=public.tenant_actor_id();configuration jsonb;receipt public.submission_receipts;result uuid;f public.submission_uploads;file_count integer;
BEGIN
 IF school IS NULL OR p_owner_hash IS NULL OR p_owner_hash !~ '^[a-f0-9]{64}$' OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid receipt' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(school::text||':'||p_owner_hash),hashtext(p_request_id::text));
 SELECT * INTO receipt FROM public.submission_receipts WHERE school_id=school AND owner_hash=p_owner_hash AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.payload_hash<>p_payload_hash THEN RAISE EXCEPTION 'Receipt content changed' USING ERRCODE='23505'; END IF;
  IF receipt.submission_id IS NULL OR receipt.created_at<now()-interval '30 days' THEN RAISE EXCEPTION 'Receipt expired' USING ERRCODE='P0004'; END IF;
  RETURN jsonb_build_object('id',receipt.submission_id,'replayed',true);
 END IF;
 configuration:=public.school_published_configuration(school);
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 10 AND 120 OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 20 AND 2000 OR p_anonymous IS NULL OR (NOT p_anonymous AND actor IS NULL) OR (p_anonymous AND (p_tracking_hash IS NULL OR p_tracking_hash !~ '^[a-f0-9]{64}$')) OR (NOT p_anonymous AND p_tracking_hash IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.categories WHERE school_id=school AND id=p_category_id AND is_active) THEN RAISE EXCEPTION 'Invalid idea fields or category' USING ERRCODE='22023'; END IF;
 IF (configuration->>'formVersion')::uuid IS DISTINCT FROM p_form_version AND (jsonb_array_length(configuration->'form'->'questions')>0 OR configuration->'form'->>'attachments'<>'off' OR p_form_version IS NOT NULL) THEN RAISE EXCEPTION 'School form changed' USING ERRCODE='P0202'; END IF;
 PERFORM public.validate_custom_submission_answers(configuration->'form',p_answers);
 IF p_files IS NULL OR cardinality(p_files)>3 OR array_ndims(p_files)>1 OR (SELECT count(DISTINCT x) FROM unnest(p_files) x)<>cardinality(p_files) THEN RAISE EXCEPTION 'Invalid image list' USING ERRCODE='22023'; END IF;
 file_count:=cardinality(p_files);
 IF configuration->'form'->>'attachments'='required' AND file_count=0 OR configuration->'form'->>'attachments'='off' AND file_count>0 THEN RAISE EXCEPTION 'Check school image requirements' USING ERRCODE='22023'; END IF;
 FOR f IN SELECT * FROM public.submission_uploads WHERE school_id=school AND id=ANY(p_files) ORDER BY id FOR UPDATE LOOP
  IF f.owner_hash<>p_owner_hash OR f.submission_id IS NOT NULL OR f.expires_at<=now() THEN RAISE EXCEPTION 'Images expired or belong to another submission' USING ERRCODE='42501'; END IF;
  file_count:=file_count-1;
 END LOOP;
 IF file_count<>0 THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.submission_receipts(school_id,owner_hash,request_id,payload_hash,is_anonymous) VALUES(school,p_owner_hash,p_request_id,p_payload_hash,p_anonymous);
 INSERT INTO public.submissions(school_id,title,description,category_id,user_id,anonymous_tracking_hash,status,form_version_id) VALUES(school,btrim(p_title),btrim(p_description),p_category_id,CASE WHEN p_anonymous THEN NULL ELSE actor END,p_tracking_hash,'pending',p_form_version) RETURNING id INTO result;
 IF p_form_version IS NOT NULL THEN INSERT INTO public.submission_answers(school_id,submission_id,form_version_id,answers) VALUES(school,result,p_form_version,p_answers);END IF;
 INSERT INTO public.attachments(school_id,id,submission_id,storage_path,mime_type,size_bytes) SELECT school,id,result,storage_path,'image/webp',size_bytes FROM public.submission_uploads WHERE school_id=school AND id=ANY(p_files);
 UPDATE public.submission_uploads SET submission_id=result WHERE school_id=school AND id=ANY(p_files);
 UPDATE public.submission_receipts SET submission_id=result WHERE school_id=school AND owner_hash=p_owner_hash AND request_id=p_request_id;
 RETURN jsonb_build_object('id',result,'replayed',false);
END $$;
-- Deferred validation closes the legacy creation path when a school has a custom form.
CREATE FUNCTION public.guard_required_school_form() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE configuration jsonb;schema jsonb;answers jsonb;
BEGIN
 configuration:=public.school_published_configuration(NEW.school_id);schema:=configuration->'form';
 IF jsonb_array_length(schema->'questions')>0 OR schema->>'attachments'<>'off' THEN
  IF NEW.form_version_id IS DISTINCT FROM (configuration->>'formVersion')::uuid THEN RAISE EXCEPTION 'School form changed' USING ERRCODE='P0202'; END IF;
  SELECT a.answers INTO answers FROM public.submission_answers a WHERE a.school_id=NEW.school_id AND a.submission_id=NEW.id;
  PERFORM public.validate_custom_submission_answers(schema,answers);
  IF schema->>'attachments'='required' AND NOT EXISTS(SELECT 1 FROM public.attachments WHERE school_id=NEW.school_id AND submission_id=NEW.id) THEN RAISE EXCEPTION 'School requires an image' USING ERRCODE='22023'; END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER school_required_form AFTER INSERT ON public.submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_required_school_form();
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous,job_only) VALUES('public.create_customized_submission(text,uuid,text,text,text,uuid,boolean,text,uuid,jsonb,uuid[])','create_customized_submission',true,false);
CREATE OR REPLACE FUNCTION public.valid_student_search(filters jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_typeof(filters)='object' AND filters-ARRAY['sort','category','search','scope']='{}'::jsonb
 AND jsonb_typeof(filters->'sort')='string' AND filters->>'sort' IN('all','latest','top','popular','oldest')
 AND jsonb_typeof(filters->'category')='string' AND length(filters->>'category') BETWEEN 1 AND 80
 AND jsonb_typeof(filters->'search')='string' AND length(filters->>'search')<=120
 AND jsonb_typeof(filters->'scope')='string' AND filters->>'scope' IN('all','following')
$$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('reserve_school_upload','register_processed_school_upload','validate_custom_submission_answers','create_customized_submission','guard_required_school_form') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,tenant_executor',f.oid::regprocedure);IF f.oid IN('public.reserve_school_upload(uuid,uuid,text,text,integer)'::regprocedure,'public.register_processed_school_upload(uuid,uuid,text,uuid,integer,integer,integer)'::regprocedure) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure);END IF; END LOOP;END $$;
-- tenant_rpc is the only application entry point; it establishes the school and actor.
GRANT EXECUTE ON FUNCTION public.create_customized_submission(text,uuid,text,text,text,uuid,boolean,text,uuid,jsonb,uuid[]) TO tenant_executor;
COMMIT;
