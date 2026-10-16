-- Privileged, staged migration; keep onboarding locked until full cutover acceptance.
BEGIN;
CREATE ROLE tenant_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT tenant_executor TO CURRENT_USER;
-- PostgreSQL requires the new owner to create objects in the schema during transfer.
GRANT CREATE,USAGE ON SCHEMA public TO tenant_executor;
GRANT USAGE ON SCHEMA auth TO tenant_executor;
CREATE FUNCTION public.tenant_school_id() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT nullif(current_setting('suggfeed.school_id',true),'')::uuid
$$;
CREATE FUNCTION public.tenant_actor_id() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT nullif(current_setting('suggfeed.actor_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION public.tenant_school_id(),public.tenant_actor_id() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_school_id(),public.tenant_actor_id() TO tenant_executor,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO tenant_executor;
GRANT EXECUTE ON FUNCTION public.school_actor_has_role(uuid,uuid,text[]) TO tenant_executor;
INSERT INTO public.schools(id,slug,name,status)
 VALUES('00000000-0000-4000-8000-000000000001','demo','SuggFeed demo school','pending');
-- Legacy roles retain authority only inside the demo membership, never the platform.
INSERT INTO public.school_memberships(school_id,user_id,role)
 SELECT '00000000-0000-4000-8000-000000000001',id,role::text FROM public.profiles;
CREATE TEMP TABLE tenant_tables(name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO tenant_tables VALUES
 ('categories'),('submissions'),('status_history'),('attachments'),('votes'),('comments'),
 ('bookmarks'),('shared_posts'),('reports'),('audit_log'),('retention_settings'),
 ('submission_workflow'),('staff_internal_notes'),('staff_workflow_history'),('staff_saved_views'),
 ('idea_updates'),('idea_update_drafts'),('idea_update_uploads'),('idea_follows'),('idea_notifications'),
 ('idea_notification_outbox'),('idea_clarifications'),('idea_merges'),('notification_preferences'),
 ('weekly_digest_jobs'),('workflow_rollout'),('workflow_requests'),('work_date_repairs'),
 ('student_saved_searches'),('submission_receipts');
DO $$ DECLARE t record; p record; BEGIN
 FOR t IN SELECT name FROM tenant_tables LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT',t.name);
  EXECUTE format('UPDATE public.%I SET school_id=%L',t.name,'00000000-0000-4000-8000-000000000001');
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN school_id SET NOT NULL, ALTER COLUMN school_id SET DEFAULT public.tenant_school_id()',t.name);
  EXECUTE format('CREATE INDEX %I ON public.%I(school_id)',t.name||'_school_idx',t.name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.name);
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid=('public.'||t.name)::regclass LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.polname,t.name);
  END LOOP;
  EXECUTE format('CREATE POLICY tenant_executor_scope ON public.%I TO tenant_executor USING(school_id=public.tenant_school_id()) WITH CHECK(school_id=public.tenant_school_id())',t.name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t.name);
  -- Historical column privileges survive REVOKE on the whole table.
  FOR p IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||t.name)::regclass AND attnum>0 AND NOT attisdropped LOOP
   EXECUTE format('REVOKE ALL(%I) ON public.%I FROM PUBLIC,anon,authenticated',p.attname,t.name);
  END LOOP;
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO tenant_executor',t.name);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tenant_executor;
ALTER TABLE public.bookmarks DROP CONSTRAINT bookmarks_user_submission_unique;
ALTER TABLE public.shared_posts DROP CONSTRAINT shared_posts_user_submission_unique;
CREATE UNIQUE INDEX bookmarks_school_user_submission_idx ON public.bookmarks(school_id,user_id,submission_id);
CREATE UNIQUE INDEX shared_posts_school_user_submission_idx ON public.shared_posts(school_id,user_id,submission_id);
CREATE INDEX submissions_school_status_page_idx ON public.submissions(school_id,status,created_at DESC,id DESC);
CREATE INDEX idea_notifications_school_user_page_idx ON public.idea_notifications(school_id,user_id,created_at DESC,id DESC);
CREATE INDEX comments_school_parent_page_idx ON public.comments(school_id,submission_id,created_at,id);
-- Replace all school-owned ancestry, preserving the original deletion behavior.
DO $$ DECLARE f record; child_cols text; parent_cols text; delete_action text; BEGIN
 FOR f IN SELECT c.*,a.relname child,b.relname parent FROM pg_constraint c
  JOIN pg_class a ON a.oid=c.conrelid JOIN pg_class b ON b.oid=c.confrelid
  WHERE c.contype='f' AND a.relnamespace='public'::regnamespace AND b.relnamespace='public'::regnamespace
  AND a.relname IN(SELECT name FROM tenant_tables) AND b.relname IN(SELECT name FROM tenant_tables)
 LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY n) INTO child_cols FROM unnest(f.conkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.attnum;
  SELECT string_agg(quote_ident(attname),',' ORDER BY n) INTO parent_cols FROM unnest(f.confkey) WITH ORDINALITY k(attnum,n) JOIN pg_attribute a ON a.attrelid=f.confrelid AND a.attnum=k.attnum;
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(school_id,%s)',f.parent||'_school_'||replace(parent_cols,',','_')||'_ref',f.parent,parent_cols);
  delete_action:=CASE f.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL ('||child_cols||')' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END;
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I,ADD CONSTRAINT %I FOREIGN KEY(school_id,%s) REFERENCES public.%I(school_id,%s) ON DELETE %s',f.child,f.conname,f.conname,child_cols,f.parent,parent_cols,delete_action);
 END LOOP;
 FOR f IN SELECT c.*,a.relname child FROM pg_constraint c JOIN pg_class a ON a.oid=c.conrelid
  WHERE c.contype='f' AND c.confrelid='public.profiles'::regclass AND a.relname IN(SELECT name FROM tenant_tables)
 LOOP
  SELECT quote_ident(attname) INTO child_cols FROM pg_attribute WHERE attrelid=f.conrelid AND attnum=f.conkey[1];
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(school_id,%s) REFERENCES public.school_memberships(school_id,user_id) ON DELETE RESTRICT',f.child,f.conname||'_member',child_cols);
 END LOOP;
END $$;
-- Resource UUIDs remain globally unique. Names, flags and operation keys are local.
DO $$ DECLARE k record; col_list text; BEGIN
 FOR k IN SELECT c.*,t.relname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  WHERE c.contype IN('p','u') AND t.relname IN(SELECT name FROM tenant_tables) AND (
   (t.relname='categories' AND c.contype='u') OR
   (t.relname IN('staff_saved_views','student_saved_searches','weekly_digest_jobs','idea_updates','work_date_repairs') AND c.contype='u') OR
   t.relname IN('notification_preferences','retention_settings','workflow_rollout','workflow_requests','idea_update_drafts','submission_receipts'))
 LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY n) INTO col_list FROM unnest(k.conkey) WITH ORDINALITY x(attnum,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.attnum;
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I,ADD CONSTRAINT %I %s(school_id,%s)',k.relname,k.conname,k.conname,CASE k.contype WHEN 'p' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END,col_list);
 END LOOP;
END $$;
CREATE FUNCTION public.guard_tenant_ownership() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
  RAISE EXCEPTION 'School ownership is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT name FROM tenant_tables LOOP
  EXECUTE format('CREATE TRIGGER tenant_ownership_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_ownership()',t.name);
 END LOOP;
END $$;
-- Global account data is self-only; staff directory authority is school membership.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT polname FROM pg_policy WHERE polrelid='public.profiles'::regclass LOOP EXECUTE format('DROP POLICY %I ON public.profiles',p.polname);END LOOP;
END $$;
REVOKE ALL ON public.profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.profiles TO authenticated,tenant_executor;
GRANT UPDATE(display_name,email_notifications_enabled) ON public.profiles TO authenticated;
CREATE POLICY profile_self_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
CREATE POLICY profile_self_update ON public.profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY profile_executor_read ON public.profiles FOR SELECT TO tenant_executor USING(EXISTS(
 SELECT 1 FROM public.school_memberships m WHERE m.school_id=public.tenant_school_id() AND m.user_id=profiles.id AND m.status='active'));
GRANT SELECT ON public.school_memberships,public.schools TO tenant_executor;
CREATE POLICY executor_memberships ON public.school_memberships FOR SELECT TO tenant_executor USING(school_id=public.tenant_school_id());
CREATE POLICY executor_school ON public.schools FOR SELECT TO tenant_executor USING(id=public.tenant_school_id() AND status='active');
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(CASE attname WHEN 'role' THEN 'm.role::public.user_role AS role' ELSE 'p.'||quote_ident(attname) END,',' ORDER BY attnum) INTO cols
 FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE 'CREATE VIEW public.school_profiles WITH(security_invoker=true) AS SELECT m.school_id,'||cols||' FROM public.profiles p JOIN public.school_memberships m ON m.user_id=p.id WHERE m.status=''active''';
 EXECUTE 'CREATE VIEW public.tenant_profiles WITH(security_invoker=true) AS SELECT '||cols||' FROM public.profiles p JOIN public.school_memberships m ON m.user_id=p.id WHERE m.school_id=public.tenant_school_id() AND m.status=''active''';
END $$;
REVOKE ALL ON public.school_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_profiles TO service_role,tenant_executor;
REVOKE ALL ON public.tenant_profiles FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.tenant_profiles TO tenant_executor;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.school_actor_has_role(public.tenant_school_id(),coalesce(public.tenant_actor_id(),auth.uid()),ARRAY['admin','moderator'])
$$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.school_actor_has_role(public.tenant_school_id(),coalesce(public.tenant_actor_id(),auth.uid()),ARRAY['admin'])
$$;
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_role_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role AND current_user IN('anon','authenticated','service_role','tenant_executor') THEN
  RAISE EXCEPTION 'Global roles cannot be changed by school clients' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.school_publication_allowed(p_school uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND status='active') OR to_regclass('public.school_settings') IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT publication_policy=''public'' AND approved_at IS NOT NULL FROM public.school_settings WHERE school_id=$1' INTO allowed USING p_school;
 RETURN coalesce(allowed,false);
END $$;
REVOKE ALL ON FUNCTION public.school_publication_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.school_publication_allowed(uuid) TO tenant_executor,service_role;
CREATE TABLE public.tenant_rpc_catalog(function_signature text PRIMARY KEY,function_name text NOT NULL UNIQUE,allow_anonymous boolean NOT NULL DEFAULT false,job_only boolean NOT NULL DEFAULT false);
REVOKE ALL ON public.tenant_rpc_catalog FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous,job_only)
 SELECT oid::regprocedure::text,proname,proname=ANY(ARRAY[
 'read_public_idea_updates','read_public_idea_update_files','read_public_submission_history','read_roadmap_activity','roadmap_category_counts',
 'read_authorized_progress_file','create_submission_once','read_submission_receipt','community_action','set_idea_vote','cast_idea_vote']),
 proname=ANY(ARRAY['claim_weekly_digests','claim_progress_upload_cleanup','finish_progress_upload_cleanup','list_progress_sources_to_clean','finish_progress_source_cleanup'])
 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY[
 'moderate_submission','review_submission_transition','save_staff_review','save_staff_view','admin_search_students',
 'reserve_progress_upload','finalize_progress_upload','cancel_progress_upload','read_staff_idea_update_files','read_authorized_progress_file',
 'read_public_idea_updates','read_public_idea_update_files','read_public_submission_history','read_roadmap_activity','roadmap_category_counts',
 'claim_progress_upload_cleanup','finish_progress_upload_cleanup','list_progress_sources_to_clean','finish_progress_source_cleanup',
 'claim_weekly_digests','set_idea_follow','mark_idea_notification_read','set_idea_vote','cast_idea_vote','community_action',
 'staff_workflow_context','staff_workflow_snapshot','repair_work_dates','bind_progress_draft','perform_workflow_action','post_idea_update',
 'save_student_search','create_submission_once','read_submission_receipt']);
-- Existing business bodies retain their validation and optimistic locking, while
-- their execution role obeys tenant RLS even for SECURITY DEFINER functions.
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT p.oid,p.proname,p.prorettype,pg_get_functiondef(p.oid) definition FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND (p.oid IN(SELECT function_signature::regprocedure FROM public.tenant_rpc_catalog)
  OR p.prorettype='trigger'::regtype AND p.proname NOT IN('handle_new_user','handle_user_email_updated','prevent_unauthorized_profile_role_change','guard_school_activation','guard_tenant_ownership'))
 LOOP
  definition:=regexp_replace(f.definition,'\mpublic\.profiles\M','public.tenant_profiles','g');
  definition:=regexp_replace(definition,'\mFROM profiles\M','FROM public.tenant_profiles','gi');
  definition:=replace(definition,'profiles.id','tenant_profiles.id');
  IF f.proname='save_staff_view' THEN
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n PERFORM pg_advisory_xact_lock(hashtext(''staff-view''),hashtext(p_staff_id::text));','i');
   definition:=regexp_replace(definition,'for update','', 'gi');
  END IF;
  definition:=replace(definition,'hashtext(p_owner_hash)','hashtext(public.tenant_school_id()::text || '':'' || p_owner_hash)');
  definition:=replace(definition,'hashtext(p_user::text)','hashtext(public.tenant_school_id()::text || '':'' || p_user::text)');
  definition:=replace(definition,'hashtext(p_staff_id::text)','hashtext(public.tenant_school_id()::text || '':'' || p_staff_id::text)');
  definition:=replace(definition,'hashtextextended(p_request_id::text,0)','hashtextextended(public.tenant_school_id()::text || '':'' || p_request_id::text,0)');
  definition:=replace(definition,'hashtextextended(NEW.request_id::text,0)','hashtextextended(public.tenant_school_id()::text || '':'' || NEW.request_id::text,0)');
  definition:=regexp_replace(definition,'ON CONFLICT\s*\(request_id\)','ON CONFLICT(school_id,request_id)','gi');
  definition:=regexp_replace(definition,'ON CONFLICT\s*\(user_id,\s*week_start\)','ON CONFLICT(school_id,user_id,week_start)','gi');
  IF f.proname='reserve_progress_upload' THEN
   definition:=replace(definition,$path$file_id::text || '/source'$path$,$path$public.tenant_school_id()::text || '/' || file_id::text || '/source'$path$);
   definition:=replace(definition,$path$file_id::text || '/final.'$path$,$path$public.tenant_school_id()::text || '/' || file_id::text || '/final.'$path$);
  END IF;
  IF f.proname='notify_idea_followers' THEN
   definition:=replace(definition,'WHERE f.submission_id=NEW.submission_id',
    'WHERE f.submission_id=NEW.submission_id AND public.school_actor_has_role(NEW.school_id,f.user_id,ARRAY[''student'',''moderator'',''admin''])');
  END IF;
  IF f.proname='claim_weekly_digests' THEN
   definition:=replace(definition,'WHERE p.weekly_digest',
    'WHERE public.school_actor_has_role(public.tenant_school_id(),p.user_id,ARRAY[''student'',''moderator'',''admin'']) AND p.weekly_digest');
  END IF;
  IF f.proname='finalize_progress_upload' THEN
   definition:=replace(definition,$path$(file.id::text || '/final.' || CASE WHEN file.declared_mime='application/pdf' THEN 'pdf' ELSE 'webp' END)$path$,'file.final_path');
  END IF;
  IF f.prorettype='trigger'::regtype THEN
   definition:=regexp_replace(definition,'\mBEGIN\M',E'BEGIN\n PERFORM set_config(''suggfeed.school_id'',coalesce(NEW.school_id,OLD.school_id)::text,true);','i');
  END IF;
  EXECUTE definition;
  EXECUTE format('ALTER FUNCTION %s SET search_path=pg_catalog,public',f.oid::regprocedure);
  EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',f.oid::regprocedure);
  EXECUTE format('ALTER FUNCTION %s OWNER TO tenant_executor',f.oid::regprocedure);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.oid::regprocedure,current_user);
 END LOOP;
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('report_submission','report_comment','check_user_status','is_staff','is_admin','valid_student_search') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO tenant_executor',f.oid::regprocedure);
 END LOOP;
END $$;
DO $$ DECLARE v record; definition text; BEGIN
 FOR v IN SELECT c.oid,c.relname,pg_get_viewdef(c.oid,true) definition FROM pg_class c
 WHERE c.relnamespace='public'::regnamespace AND c.relkind='v' AND c.relname IN('staff_submission_queue','staff_stale_work') LOOP
  definition:=rtrim(v.definition,E' ;\n');
  EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH(security_invoker=true) AS SELECT existing.*,s.school_id FROM (%s) existing JOIN public.submissions s ON s.id=existing.id',v.relname,definition);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',v.relname);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role,tenant_executor',v.relname);
 END LOOP;
END $$;
CREATE FUNCTION public.initialize_school_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.categories(school_id,name,slug) VALUES
  (NEW.id,'Facilities','facilities'),(NEW.id,'Learning','learning'),(NEW.id,'Safety','safety'),
  (NEW.id,'Student life','student-life'),(NEW.id,'Other','other') ON CONFLICT(school_id,slug) DO NOTHING;
 INSERT INTO public.workflow_rollout(school_id,singleton) VALUES(NEW.id,true);
 INSERT INTO public.retention_settings(school_id,id) VALUES(NEW.id,true);
 RETURN NEW;
END $$;
CREATE TRIGGER school_defaults AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION public.initialize_school_defaults();
REVOKE ALL ON FUNCTION public.initialize_school_defaults(),public.guard_tenant_ownership() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.tenant_rpc(p_school_id uuid,p_actor_id uuid,p_function text,p_args jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE f record; arg record; key text; call_args text:=''; expression text; result jsonb;
 previous_school text:=coalesce(current_setting('suggfeed.school_id',true),'');
 previous_actor text:=coalesce(current_setting('suggfeed.actor_id',true),'');
BEGIN
 IF p_school_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school_id AND status='active') THEN
  RAISE EXCEPTION 'School unavailable' USING ERRCODE='42501';END IF;
 IF p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RAISE EXCEPTION 'Invalid RPC arguments' USING ERRCODE='22023';END IF;
 SELECT c.*,p.proargnames,p.proargtypes,p.pronargs,p.pronargdefaults,p.proretset,p.prorettype INTO f
 FROM public.tenant_rpc_catalog c JOIN pg_proc p ON p.oid=to_regprocedure(c.function_signature) WHERE c.function_name=p_function;
 IF NOT FOUND THEN RAISE EXCEPTION 'RPC unavailable' USING ERRCODE='42501';END IF;
 IF p_actor_id IS NOT NULL AND NOT public.school_actor_has_role(p_school_id,p_actor_id,ARRAY['student','moderator','admin']) THEN
  RAISE EXCEPTION 'Active school membership required' USING ERRCODE='42501';END IF;
 IF f.job_only THEN
  IF p_actor_id IS NOT NULL THEN RAISE EXCEPTION 'Server job required' USING ERRCODE='42501';END IF;
 ELSIF p_actor_id IS NULL AND (NOT f.allow_anonymous OR NOT public.school_publication_allowed(p_school_id)) THEN
  RAISE EXCEPTION 'School membership required' USING ERRCODE='42501';END IF;
 FOR key IN SELECT jsonb_object_keys(p_args) LOOP
  IF NOT coalesce(key=ANY(f.proargnames[1:f.pronargs]),false) THEN RAISE EXCEPTION 'Unknown RPC argument' USING ERRCODE='22023';END IF;
 END LOOP;
 FOR arg IN SELECT n,f.proargnames[n] name,format_type(f.proargtypes[n-1],NULL) typename FROM generate_series(1,f.pronargs) n LOOP
  IF arg.name IN('p_actor','p_actor_id','p_staff_id','p_user','p_user_id') THEN
   IF arg.name='p_user_id' AND p_function IN('create_submission_once','set_idea_vote','cast_idea_vote')
    AND p_args ? arg.name AND p_args->>arg.name IS NULL THEN
    NULL; -- An authenticated member can deliberately submit/vote anonymously.
   ELSE
    IF p_args ? arg.name AND (p_args->>arg.name) IS DISTINCT FROM p_actor_id::text THEN RAISE EXCEPTION 'RPC actor mismatch' USING ERRCODE='42501';END IF;
    p_args:=p_args||jsonb_build_object(arg.name,p_actor_id);
   END IF;
  END IF;
  IF NOT p_args ? arg.name THEN
   IF arg.n<=f.pronargs-f.pronargdefaults THEN RAISE EXCEPTION 'Missing RPC argument' USING ERRCODE='22023';END IF;
   CONTINUE;
  END IF;
  IF arg.typename='jsonb' THEN expression:=format('($1->%L)',arg.name);
  ELSIF arg.typename='uuid[]' THEN expression:=format('(CASE WHEN $1->%L=''null''::jsonb THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text($1->%L))::uuid[] END)',arg.name,arg.name);
  ELSE expression:=format('($1->>%L)::%s',arg.name,arg.typename);END IF;
  call_args:=call_args||CASE WHEN call_args='' THEN '' ELSE ',' END||format('%I=>%s',arg.name,expression);
 END LOOP;
 PERFORM set_config('suggfeed.school_id',p_school_id::text,true);
 PERFORM set_config('suggfeed.actor_id',coalesce(p_actor_id::text,''),true);
 IF f.proretset THEN
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM public.%I(%s) t',p_function,call_args) INTO result USING p_args;
 ELSIF f.prorettype='void'::regtype THEN
  EXECUTE format('SELECT public.%I(%s)',p_function,call_args) USING p_args;
  result:='null'::jsonb;
 ELSE EXECUTE format('SELECT to_jsonb(public.%I(%s))',p_function,call_args) INTO result USING p_args;END IF;
 PERFORM set_config('suggfeed.school_id',previous_school,true);
 PERFORM set_config('suggfeed.actor_id',previous_actor,true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.valid_student_search(jsonb) TO service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
UPDATE public.school_release_gate SET isolation_verified=false WHERE singleton;
COMMIT;
