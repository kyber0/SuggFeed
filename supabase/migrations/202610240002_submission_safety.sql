BEGIN;
GRANT CREATE ON SCHEMA public TO tenant_executor;
ALTER TABLE public.submissions
 ADD COLUMN safety_state text NOT NULL DEFAULT 'clear' CHECK(safety_state IN('clear','flagged','hidden','deleted')),
 ADD COLUMN is_urgent boolean NOT NULL DEFAULT false,
 ADD COLUMN safety_version integer NOT NULL DEFAULT 1,
 ADD COLUMN review_started_at timestamptz,
 ADD COLUMN safety_reviewed_at timestamptz;
ALTER TABLE public.submissions ALTER COLUMN safety_state SET DEFAULT 'flagged';
CREATE INDEX submissions_safety_queue ON public.submissions(school_id,is_urgent DESC,created_at,id) WHERE safety_state<>'clear';

GRANT SELECT ON public.submission_answers TO tenant_executor;
CREATE POLICY safety_answer_scope ON public.submission_answers FOR SELECT TO tenant_executor USING(school_id=public.tenant_school_id());

CREATE TABLE public.submission_safety_budgets(
 school_id uuid NOT NULL REFERENCES public.schools(id), operation text NOT NULL,
 actor_key text NOT NULL, bucket bigint NOT NULL, used integer NOT NULL DEFAULT 0,
 last_at timestamptz NOT NULL DEFAULT '-infinity',PRIMARY KEY(school_id,operation,actor_key,bucket));
ALTER TABLE public.submission_safety_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY safety_budget_scope ON public.submission_safety_budgets TO tenant_executor USING(school_id=public.tenant_school_id()) WITH CHECK(school_id=public.tenant_school_id());
REVOKE ALL ON public.submission_safety_budgets FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.submission_safety_budgets TO tenant_executor;
CREATE FUNCTION public.consume_safety_budget(p_operation text,p_key text,p_limit integer,p_seconds integer,p_cooldown integer) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE slot bigint; previous_at timestamptz;
BEGIN
 IF p_limit IS NULL OR p_seconds IS NULL OR p_cooldown IS NULL OR p_key IS NULL OR p_limit NOT BETWEEN 1 AND 1000 OR p_seconds NOT BETWEEN 10 AND 86400 OR p_cooldown NOT BETWEEN 0 AND 3600 OR length(p_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid budget' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(public.tenant_school_id()::text||p_operation),hashtext(p_key));
 SELECT max(last_at) INTO previous_at FROM public.submission_safety_budgets WHERE operation=p_operation AND actor_key=p_key;
 IF previous_at>clock_timestamp()-make_interval(secs=>p_cooldown) THEN RAISE EXCEPTION 'Please wait before trying again' USING ERRCODE='PT429';END IF;
 slot:=floor(extract(epoch FROM clock_timestamp())/p_seconds);
 INSERT INTO public.submission_safety_budgets(school_id,operation,actor_key,bucket) VALUES(public.tenant_school_id(),p_operation,p_key,slot) ON CONFLICT DO NOTHING;
 UPDATE public.submission_safety_budgets SET used=used+1,last_at=clock_timestamp() WHERE operation=p_operation AND actor_key=p_key AND bucket=slot AND used<p_limit;
 IF NOT FOUND THEN RAISE EXCEPTION 'Limit reached; please try later' USING ERRCODE='PT429'; END IF;
 DELETE FROM public.submission_safety_budgets WHERE last_at<clock_timestamp()-interval '2 days';
END $$;
ALTER FUNCTION public.consume_safety_budget(text,text,integer,integer,integer) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.consume_safety_budget(text,text,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_submission_safety() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE checked text:=coalesce(current_setting('suggfeed.safety_write',true),''); verdict jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  verdict:=coalesce(nullif(current_setting('suggfeed.safety_verdict',true),''),'{}')::jsonb;
  NEW.safety_state:=CASE WHEN checked='create' AND verdict->>'state'='clear' THEN 'clear' ELSE 'flagged' END;
  NEW.is_urgent:=coalesce((verdict->>'urgent')::boolean,false);
 ELSIF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description THEN
  IF checked NOT IN('edit','review') THEN NEW.safety_state:='flagged'; END IF;
  NEW.safety_version:=OLD.safety_version+1;NEW.safety_reviewed_at:=NULL;
 END IF;
 IF NEW.is_urgent AND (TG_OP='INSERT' OR checked='edit' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description)) THEN NEW.safety_state:='flagged'; END IF;
 IF TG_OP='UPDATE' AND checked NOT IN('edit','review','report') AND (NEW.safety_state IS DISTINCT FROM OLD.safety_state OR NEW.is_urgent IS DISTINCT FROM OLD.is_urgent) AND NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.description IS NOT DISTINCT FROM OLD.description THEN RAISE EXCEPTION 'Use safety review' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.description IS NOT DISTINCT FROM OLD.description AND (NEW.safety_state IS DISTINCT FROM OLD.safety_state OR NEW.is_urgent IS DISTINCT FROM OLD.is_urgent OR NEW.category_id IS DISTINCT FROM OLD.category_id OR NEW.status IS DISTINCT FROM OLD.status) THEN NEW.safety_version:=OLD.safety_version+1; END IF;
 IF NEW.status IN('approved','in_progress','resolved') AND NEW.safety_state<>'clear' AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'Safety review required' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.staff_note IS DISTINCT FROM OLD.staff_note OR NEW.category_id IS DISTINCT FROM OLD.category_id) AND public.is_staff() AND checked<>'edit' THEN NEW.review_started_at:=coalesce(OLD.review_started_at,clock_timestamp()); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_submission_safety() FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE TRIGGER submission_safety_guard BEFORE INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.guard_submission_safety();

-- Public RPCs never get private safety rows, even when their caller owns the item.
CREATE FUNCTION public.safety_row_readable(p_id uuid,p_owner uuid,p_state text) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT p_state='clear' OR (
 coalesce(current_setting('suggfeed.rpc_name',true),'') NOT LIKE 'read_public_%'
 AND coalesce(current_setting('suggfeed.rpc_name',true),'') NOT IN('read_roadmap_activity','roadmap_category_counts','set_idea_vote','cast_idea_vote')
 AND ((current_setting('suggfeed.rpc_name',true)='submission_safety_action' AND EXISTS(SELECT 1 FROM public.submission_receipts r WHERE r.submission_id=p_id AND r.owner_hash=current_setting('suggfeed.safety_owner',true))) OR current_setting('suggfeed.rpc_name',true) IN('safe_submission_create','create_customized_submission','create_submission_once','read_submission_receipt') OR public.is_admin() OR p_owner=public.tenant_actor_id() OR (public.tenant_actor_id() IS NULL AND current_setting('suggfeed.rpc_name',true) IN('read_submission_receipt','safe_submission_create','create_customized_submission','create_submission_once','community_action','submission_safety_action'))))
$$;
GRANT EXECUTE ON FUNCTION public.safety_row_readable(uuid,uuid,text) TO tenant_executor;
REVOKE ALL ON FUNCTION public.safety_row_readable(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY submission_safety_read ON public.submissions AS RESTRICTIVE FOR SELECT TO tenant_executor USING(public.safety_row_readable(id,user_id,safety_state));
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.tenant_rpc(uuid,uuid,text,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'previous_school text:=','previous_rpc text:=coalesce(current_setting(''suggfeed.rpc_name'',true),''''); previous_school text:=');
 definition:=replace(definition,'RETURN result;','PERFORM set_config(''suggfeed.rpc_name'',previous_rpc,true); RETURN result;');
 definition:=replace(definition,'PERFORM set_config(''suggfeed.school_id'',p_school_id::text,true);','PERFORM set_config(''suggfeed.rpc_name'',p_function,true); PERFORM set_config(''suggfeed.school_id'',p_school_id::text,true);');
 EXECUTE definition;
END $$;
DO $$ DECLARE v record; definition text; BEGIN
 FOR v IN SELECT oid,relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('staff_submission_queue','staff_stale_work') LOOP
  definition:=rtrim(pg_get_viewdef(v.oid,true),E' ;\n');
  EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH(security_invoker=true) AS SELECT q.* FROM (%s) q JOIN public.submissions safe ON safe.school_id=q.school_id AND safe.id=q.id WHERE safe.safety_state=''clear''',v.relname,definition);
 END LOOP;
END $$;

CREATE FUNCTION public.safe_submission_create(p_args jsonb,p_verdict jsonb,p_policy jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE receipt public.submission_receipts; result jsonb; key text;
BEGIN
 IF p_verdict->>'state' NOT IN('clear','flagged') OR p_verdict->>'state' IS NULL THEN RAISE EXCEPTION 'Invalid verdict' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(public.tenant_school_id()::text||':'||(p_args->>'p_owner_hash')),hashtext(p_args->>'p_request_id'));
 SELECT * INTO receipt FROM public.submission_receipts WHERE owner_hash=p_args->>'p_owner_hash' AND request_id=(p_args->>'p_request_id')::uuid;
 IF NOT FOUND THEN
  key:=coalesce(public.tenant_actor_id()::text,p_args->>'p_owner_hash');
  PERFORM public.consume_safety_budget('submit',key,(p_policy->>'limit')::integer,(p_policy->>'windowSeconds')::integer,(p_policy->>'cooldownSeconds')::integer);
  IF public.tenant_actor_id() IS NULL THEN PERFORM public.consume_safety_budget('submit-ip',p_policy->>'ipKey',(p_policy->>'limit')::integer,(p_policy->>'windowSeconds')::integer,(p_policy->>'cooldownSeconds')::integer); END IF;
 END IF;
 PERFORM set_config('suggfeed.safety_write','create',true);PERFORM set_config('suggfeed.safety_verdict',p_verdict::text,true);
 result:=public.create_customized_submission(p_args->>'p_owner_hash',(p_args->>'p_request_id')::uuid,p_args->>'p_payload_hash',p_args->>'p_title',p_args->>'p_description',(p_args->>'p_category_id')::uuid,(p_args->>'p_anonymous')::boolean,p_args->>'p_tracking_hash',(p_args->>'p_form_version')::uuid,p_args->'p_answers',ARRAY(SELECT jsonb_array_elements_text(p_args->'p_files'))::uuid[]);
 PERFORM set_config('suggfeed.safety_write','',true);PERFORM set_config('suggfeed.safety_verdict','',true);
 RETURN result;
END $$;
ALTER FUNCTION public.safe_submission_create(jsonb,jsonb,jsonb) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.safe_submission_create(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous) VALUES('public.safe_submission_create(jsonb,jsonb,jsonb)','safe_submission_create',true);
CREATE FUNCTION public.submission_safety_action(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=public.tenant_actor_id(); s public.submissions%rowtype; total integer; limit_count integer; result jsonb; page_number integer;
BEGIN
 IF p_action IN('owner-read','owner-edit') THEN
  PERFORM set_config('suggfeed.safety_owner',coalesce(p_data->>'ownerHash',''),true);
  SELECT * INTO s FROM public.submissions WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF s.id IS NULL OR NOT ((actor IS NOT NULL AND s.user_id=actor) OR (s.user_id IS NULL AND EXISTS(SELECT 1 FROM public.submission_receipts WHERE submission_id=s.id AND owner_hash=p_data->>'ownerHash'))) IS TRUE THEN RAISE EXCEPTION 'Item unavailable' USING ERRCODE='42501';END IF;
  IF p_action='owner-read' THEN RETURN jsonb_build_object('id',s.id,'title',s.title,'description',s.description,'category_id',s.category_id,'status',s.status,'safety_state',s.safety_state,'version',s.safety_version,'editable',s.status='pending' AND s.review_started_at IS NULL AND s.safety_state NOT IN('hidden','deleted'),'answers',coalesce((SELECT answers FROM public.submission_answers WHERE submission_id=s.id),'{}'::jsonb));END IF;
  IF s.status<>'pending' OR s.review_started_at IS NOT NULL OR s.safety_state IN('hidden','deleted') THEN RAISE EXCEPTION 'Staff review already started' USING ERRCODE='40001';END IF;
  IF s.safety_version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Item changed' USING ERRCODE='40001';END IF;
  IF length(trim(p_data->>'title')) NOT BETWEEN 10 AND 120 OR length(trim(p_data->>'description')) NOT BETWEEN 20 AND 2000 OR p_data->'verdict'->>'state' NOT IN('clear','flagged') OR p_data->'verdict'->>'state' IS NULL OR NOT EXISTS(SELECT 1 FROM public.categories WHERE id=(p_data->>'category')::uuid AND is_active) THEN RAISE EXCEPTION 'Invalid edit' USING ERRCODE='22023';END IF;
  PERFORM public.consume_safety_budget('edit',coalesce(actor::text,p_data->>'ownerHash'),(p_data->'policy'->>'limit')::integer,(p_data->'policy'->>'windowSeconds')::integer,(p_data->'policy'->>'cooldownSeconds')::integer);
  PERFORM set_config('suggfeed.safety_write','edit',true);
  UPDATE public.submissions SET title=trim(p_data->>'title'),description=trim(p_data->>'description'),category_id=(p_data->>'category')::uuid,
   is_urgent=s.is_urgent OR coalesce((p_data->'verdict'->>'urgent')::boolean,false),
   safety_state=CASE WHEN s.is_urgent OR EXISTS(SELECT 1 FROM public.reports WHERE submission_id=s.id AND resolved_at IS NULL) THEN 'flagged' ELSE p_data->'verdict'->>'state' END,
   updated_at=clock_timestamp() WHERE id=s.id RETURNING safety_version INTO total;
  PERFORM set_config('suggfeed.safety_write','',true);PERFORM set_config('suggfeed.safety_owner','',true);
  RETURN jsonb_build_object('id',s.id,'version',total);
 END IF;
 IF p_action='report' THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';END IF;
  SELECT * INTO s FROM public.submissions WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF s.id IS NULL OR s.safety_state<>'clear' OR s.status NOT IN('approved','in_progress','resolved') THEN RAISE EXCEPTION 'Item unavailable' USING ERRCODE='P0002';END IF;
  IF EXISTS(SELECT 1 FROM public.reports WHERE submission_id=s.id AND user_id=actor AND comment_id IS NULL) THEN RETURN jsonb_build_object('already_reported',true);END IF;
  limit_count:=(p_data->'policy'->>'reportThreshold')::integer;
  IF limit_count NOT BETWEEN 1 AND 100 OR limit_count IS NULL OR length(p_data->>'reason') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023';END IF;
  PERFORM public.consume_safety_budget('report',actor::text,(p_data->'policy'->>'limit')::integer,(p_data->'policy'->>'windowSeconds')::integer,0);
  INSERT INTO public.reports(user_id,submission_id,reason) VALUES(actor,s.id,p_data->>'reason') ON CONFLICT DO NOTHING;
  SELECT count(*) INTO total FROM public.reports WHERE submission_id=s.id AND resolved_at IS NULL;
  IF total>=limit_count THEN PERFORM set_config('suggfeed.safety_write','report',true);UPDATE public.submissions SET safety_state='flagged' WHERE id=s.id;PERFORM set_config('suggfeed.safety_write','',true);END IF;
  RETURN jsonb_build_object('hidden',total>=limit_count);
 END IF;
 IF p_action='notices' THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';END IF;
  RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM(SELECT id,kind,workflow_status,submission_id,created_at,read_at FROM public.submission_safety_notices WHERE user_id=actor AND (kind<>'urgent' OR public.is_admin()) ORDER BY created_at DESC,id LIMIT 50)n));
 ELSIF p_action='notice-read' THEN
  UPDATE public.submission_safety_notices SET read_at=coalesce(read_at,now()) WHERE id=(p_data->>'id')::uuid AND user_id=actor AND (kind<>'urgent' OR public.is_admin());RETURN '{}'::jsonb;
 END IF;
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'School administrator required' USING ERRCODE='42501';END IF;
 IF p_action='analytics' THEN
  RETURN jsonb_build_object(
   'status',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT status,count(*) AS count FROM public.submissions WHERE safety_state<>'deleted' GROUP BY status ORDER BY status)q),
   'category',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT c.name,count(idea.id) AS count FROM public.categories c LEFT JOIN public.submissions idea ON idea.category_id=c.id AND idea.safety_state<>'deleted' GROUP BY c.id,c.name ORDER BY count(idea.id) DESC,c.name)q),
   'unresolved',(SELECT count(*) FROM public.submissions WHERE status NOT IN('resolved','rejected') AND safety_state<>'deleted'),
   'urgent',(SELECT count(*) FROM public.submissions WHERE is_urgent AND safety_state IN('flagged','hidden')),
   'daily',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT d::date AS day,count(idea.id) AS count FROM generate_series(current_date-29,current_date,interval '1 day') d LEFT JOIN public.submissions idea ON idea.created_at>=d AND idea.created_at<d+interval '1 day' GROUP BY d ORDER BY d)q),
   'top',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT id,title,vote_count FROM public.submissions WHERE safety_state='clear' AND status IN('approved','in_progress','resolved') ORDER BY vote_count DESC,id LIMIT 10)q));
 ELSIF p_action='audit' THEN
  page_number:=greatest(1,least(100000,coalesce((p_data->>'page')::integer,1)));
  RETURN jsonb_build_object('page',page_number,'total',(SELECT count(*) FROM public.audit_log),'items',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT id,actor_id,action,target_table,target_id,created_at,metadata FROM public.audit_log ORDER BY created_at DESC,id LIMIT 25 OFFSET (page_number-1)*25)q));
 ELSIF p_action='recipients' THEN
  RETURN jsonb_build_object('user_ids',coalesce((SELECT to_jsonb(user_ids) FROM public.school_safety_contacts),'[]'::jsonb));
 ELSIF p_action='save-recipients' THEN
  IF jsonb_typeof(p_data->'ids')<>'array' OR jsonb_array_length(p_data->'ids')>100 THEN RAISE EXCEPTION 'Invalid recipients' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_data->'ids') r(id) WHERE NOT public.school_actor_has_role(public.tenant_school_id(),r.id::uuid,ARRAY['admin'])) THEN RAISE EXCEPTION 'Active school administrators required' USING ERRCODE='42501';END IF;
  SELECT to_jsonb(user_ids) INTO result FROM public.school_safety_contacts;
  INSERT INTO public.school_safety_contacts(school_id,user_ids) VALUES(public.tenant_school_id(),ARRAY(SELECT jsonb_array_elements_text(p_data->'ids'))::uuid[]) ON CONFLICT(school_id) DO UPDATE SET user_ids=excluded.user_ids;
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(actor,'safety_recipients','schools',public.tenant_school_id(),jsonb_build_object('previous',coalesce(result,'[]'::jsonb),'recipients',p_data->'ids'));
  RETURN '{}'::jsonb;
 ELSIF p_action='queue' THEN
  page_number:=greatest(1,least(100000,coalesce((p_data->>'page')::integer,1)));
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'page',page_number,'all',coalesce((p_data->>'all')::boolean,false),'total',(SELECT count(*) FROM public.submissions WHERE ((p_data->>'all'='true' AND safety_state<>'deleted') OR safety_state IN('flagged','hidden') OR safety_state='clear' AND EXISTS(SELECT 1 FROM public.reports open_report WHERE open_report.submission_id=submissions.id AND open_report.resolved_at IS NULL)))) INTO result FROM(
   SELECT id,title,description,status,safety_state,is_urgent,safety_version,category_id,created_at,review_started_at,
    (SELECT count(*) FROM public.reports r WHERE r.submission_id=submissions.id AND r.resolved_at IS NULL) AS report_count
   FROM public.submissions WHERE ((p_data->>'all'='true' AND safety_state<>'deleted') OR safety_state IN('flagged','hidden') OR safety_state='clear' AND EXISTS(SELECT 1 FROM public.reports open_report WHERE open_report.submission_id=submissions.id AND open_report.resolved_at IS NULL)) ORDER BY is_urgent DESC,created_at,id LIMIT 25 OFFSET (page_number-1)*25) q;
  RETURN result;
 ELSIF p_action IN('approve','hide','delete','category','urgent') THEN
  SELECT * INTO s FROM public.submissions WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF s.id IS NULL OR s.safety_state='deleted' THEN RAISE EXCEPTION 'Item unavailable' USING ERRCODE='P0002';END IF;
  IF s.safety_version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Item changed' USING ERRCODE='40001';END IF;
  IF length(trim(p_data->>'reason')) NOT BETWEEN 10 AND 500 OR p_data->>'reason' IS NULL THEN RAISE EXCEPTION 'Review reason required' USING ERRCODE='22023';END IF;
  PERFORM set_config('suggfeed.safety_write','review',true);
  IF p_action='category' THEN
   IF NOT EXISTS(SELECT 1 FROM public.categories WHERE id=(p_data->>'category')::uuid AND is_active) THEN RAISE EXCEPTION 'Category unavailable' USING ERRCODE='22023';END IF;
   UPDATE public.submissions SET category_id=(p_data->>'category')::uuid,review_started_at=coalesce(review_started_at,now()) WHERE id=s.id;
  ELSIF p_action='urgent' THEN
   IF jsonb_typeof(p_data->'urgent')<>'boolean' THEN RAISE EXCEPTION 'Invalid flag' USING ERRCODE='22023';END IF;
   UPDATE public.submissions SET is_urgent=(p_data->>'urgent')::boolean,safety_state=CASE WHEN (p_data->>'urgent')::boolean THEN 'flagged' ELSE safety_state END,review_started_at=coalesce(review_started_at,now()) WHERE id=s.id;
  ELSE
   UPDATE public.submissions SET safety_state=CASE p_action WHEN 'approve' THEN 'clear' WHEN 'hide' THEN 'hidden' ELSE 'deleted' END,
    title=CASE WHEN p_action='delete' THEN '[Deleted submission]' ELSE title END,
    description=CASE WHEN p_action='delete' THEN 'This submission was removed by a school administrator.' ELSE description END,
    safety_reviewed_at=now(),review_started_at=coalesce(review_started_at,now()) WHERE id=s.id;
   UPDATE public.reports SET resolution=CASE WHEN p_action='approve' THEN 'dismissed' ELSE 'removed' END,resolution_reason=trim(p_data->>'reason'),resolved_at=now(),resolved_by=actor WHERE submission_id=s.id AND resolved_at IS NULL;
  END IF;
  PERFORM set_config('suggfeed.safety_write','',true);
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(actor,'safety_'||p_action,'submissions',s.id,jsonb_build_object('previous',jsonb_build_object('status',s.status,'category_id',s.category_id,'safety_state',s.safety_state,'urgent',s.is_urgent),'reason',trim(p_data->>'reason')));
  RETURN jsonb_build_object('id',s.id);
 END IF;
 RAISE EXCEPTION 'Unknown safety action' USING ERRCODE='22023';
END $$;
ALTER FUNCTION public.submission_safety_action(text,jsonb) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.submission_safety_action(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous) VALUES('public.submission_safety_action(text,jsonb)','submission_safety_action',true);
-- Old report and resolution routes must not bypass quotas, hiding, or admin-only review.
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.community_action(uuid,text,jsonb)'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M',$guard$BEGIN
 IF p_action='report' OR p_action='resolve' THEN RAISE EXCEPTION 'Use the safety review service' USING ERRCODE='42501';END IF;
 $guard$,'i');EXECUTE definition;
END $$;

CREATE TABLE public.school_safety_contacts(school_id uuid PRIMARY KEY REFERENCES public.schools(id),user_ids uuid[] NOT NULL DEFAULT '{}');
CREATE TABLE public.submission_safety_notices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES public.schools(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),submission_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('urgent','status')),workflow_status text NOT NULL,
 revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,
 email_state text NOT NULL DEFAULT 'pending' CHECK(email_state IN('pending','processing','sent','uncertain','cancelled')),
 UNIQUE(school_id,user_id,submission_id,kind,revision),
 FOREIGN KEY(school_id,submission_id) REFERENCES public.submissions(school_id,id) ON DELETE CASCADE);
CREATE INDEX safety_notices_inbox ON public.submission_safety_notices(school_id,user_id,created_at DESC,id);
DO $$ DECLARE name text;BEGIN FOREACH name IN ARRAY ARRAY['school_safety_contacts','submission_safety_notices'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
 EXECUTE format('CREATE POLICY safety_tenant_scope ON public.%I TO tenant_executor USING(school_id=public.tenant_school_id()) WITH CHECK(school_id=public.tenant_school_id())',name);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',name);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO tenant_executor,service_role',name);
END LOOP;END $$;
CREATE POLICY safety_notice_owner ON public.submission_safety_notices AS RESTRICTIVE FOR SELECT TO tenant_executor USING(user_id=public.tenant_actor_id() OR public.is_admin());
CREATE FUNCTION public.notify_submission_safety() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE recipients uuid[];
BEGIN
 IF NEW.is_urgent AND NEW.safety_state='flagged' AND (TG_OP='INSERT' OR NOT OLD.is_urgent OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description) THEN
  SELECT user_ids INTO recipients FROM public.school_safety_contacts WHERE school_id=NEW.school_id;
  INSERT INTO public.submission_safety_notices(school_id,user_id,submission_id,kind,workflow_status,revision)
   SELECT NEW.school_id,m.user_id,NEW.id,'urgent',NEW.status,NEW.safety_version FROM public.school_memberships m
   WHERE m.school_id=NEW.school_id AND m.role='admin' AND m.status='active' AND (coalesce(cardinality(recipients),0)=0 OR m.user_id=ANY(recipients)) ON CONFLICT DO NOTHING;
 ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.safety_state='clear' AND NEW.user_id IS NOT NULL
 AND (coalesce((SELECT update_mode FROM public.notification_preferences WHERE user_id=NEW.user_id),'all')='all' OR NEW.status<>'pending') THEN
  INSERT INTO public.submission_safety_notices(school_id,user_id,submission_id,kind,workflow_status,revision,email_state)
   VALUES(NEW.school_id,NEW.user_id,NEW.id,'status',NEW.status,NEW.safety_version,'cancelled') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION public.notify_submission_safety() OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.notify_submission_safety() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER submission_safety_notify AFTER INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.notify_submission_safety();

CREATE FUNCTION public.safety_similar(p_text text,p_threshold real,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF length(p_text)>2120 OR p_threshold NOT BETWEEN 0.05 AND 1 OR p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid similarity query' USING ERRCODE='22023';END IF;
 IF length(trim(p_text))<4 THEN RETURN '[]'::jsonb;END IF;
 PERFORM set_config('pg_trgm.word_similarity_threshold',p_threshold::text,true);
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO result FROM(
 SELECT s.id,s.title,s.status,s.vote_count FROM public.submissions s
 WHERE s.safety_state='clear' AND s.status IN('approved','in_progress','resolved') AND (p_text <% s.title OR p_text <% s.description)
 ORDER BY greatest(public.word_similarity(p_text,s.title),public.word_similarity(p_text,s.description)) DESC,s.vote_count DESC,s.id LIMIT p_limit)q;
 RETURN result;
END $$;
ALTER FUNCTION public.safety_similar(text,real,integer) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.safety_similar(text,real,integer) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous) VALUES('public.safety_similar(text,real,integer)','safety_similar',true);

DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.read_authorized_progress_file(uuid,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'WHERE f.id=p_file_id AND (','WHERE f.id=p_file_id AND (public.is_admin() OR NOT EXISTS(SELECT 1 FROM public.idea_updates parent_update WHERE parent_update.id=f.update_id) OR s.id IS NOT NULL) AND (');
 EXECUTE definition;
END $$;

-- Opening a staff review is the editing cutoff, not merely changing its status.
DO $$ DECLARE f regprocedure; definition text;BEGIN
 FOREACH f IN ARRAY ARRAY['public.staff_workflow_context(uuid,uuid)'::regprocedure,'public.staff_workflow_snapshot(uuid,uuid)'::regprocedure] LOOP
  SELECT pg_get_functiondef(f) INTO definition;
  definition:=regexp_replace(definition,'\mBEGIN\M',$guard$BEGIN
   IF public.is_staff() THEN UPDATE public.submissions SET review_started_at=coalesce(review_started_at,clock_timestamp()) WHERE id=p_submission_id;END IF;
  $guard$,'i');EXECUTE definition;
 END LOOP;
END $$;


CREATE FUNCTION public.audit_submission_safety() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_value jsonb; after_value jsonb;
BEGIN
 IF NOT public.is_admin() THEN RETURN NULL; END IF;
 before_value:=jsonb_build_object('status',OLD.status,'category_id',OLD.category_id,'safety_state',OLD.safety_state,'urgent',OLD.is_urgent,'review_started_at',OLD.review_started_at);
 after_value:=jsonb_build_object('status',NEW.status,'category_id',NEW.category_id,'safety_state',NEW.safety_state,'urgent',NEW.is_urgent,'review_started_at',NEW.review_started_at);
 IF before_value IS DISTINCT FROM after_value OR NEW.staff_note IS DISTINCT FROM OLD.staff_note THEN
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(public.tenant_actor_id(),'submission_change','submissions',NEW.id,jsonb_build_object('previous',before_value,'current',after_value,'staff_note_changed',NEW.staff_note IS DISTINCT FROM OLD.staff_note));
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION public.audit_submission_safety() OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.audit_submission_safety() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER submission_safety_audit AFTER UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.audit_submission_safety();
CREATE FUNCTION public.guard_append_only_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE='42501';END $$;
REVOKE ALL ON FUNCTION public.guard_append_only_audit() FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_audit();
CREATE POLICY safety_audit_admin ON public.audit_log AS RESTRICTIVE FOR SELECT TO tenant_executor USING(public.is_admin());

REVOKE CREATE ON SCHEMA public FROM tenant_executor;
NOTIFY pgrst,'reload schema';
COMMIT;
