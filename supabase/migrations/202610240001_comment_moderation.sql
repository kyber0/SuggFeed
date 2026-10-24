BEGIN;
GRANT CREATE ON SCHEMA public TO tenant_executor;
ALTER TABLE public.comments ADD COLUMN moderation_status text NOT NULL DEFAULT 'published'
 CHECK(moderation_status IN('published','flagged','hidden','deleted')),
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN edited_at timestamptz,
 ADD COLUMN reviewed_at timestamptz;
UPDATE public.comments SET moderation_status='hidden' WHERE is_hidden;
ALTER TABLE public.comments ALTER COLUMN moderation_status SET DEFAULT 'flagged';
CREATE INDEX comments_school_moderation_queue ON public.comments(school_id,moderation_status,created_at,id);
-- Reuse the existing reports table and its target constraints; UUIDs remain globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS reports_school_comment_reporter_unique
 ON public.reports(school_id,comment_id,user_id) WHERE comment_id IS NOT NULL;

CREATE FUNCTION public.guard_comment_moderation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- During rolling deployment, legacy inserts are held privately rather than published unchecked.
 IF TG_OP='INSERT' AND coalesce(current_setting('suggfeed.comment_checked',true),'')<>'checked' THEN NEW.moderation_status:='flagged'; END IF;
 IF TG_OP='UPDATE' AND NEW.body IS DISTINCT FROM OLD.body AND
 coalesce(current_setting('suggfeed.comment_checked',true),'') NOT IN('checked','review') THEN
  RAISE EXCEPTION 'Use the moderated comment service' USING ERRCODE='42501';
 END IF;
 IF NEW.is_hidden AND NEW.moderation_status='published' THEN NEW.moderation_status:='hidden'; END IF;
 NEW.is_hidden:=NEW.moderation_status<>'published';
 RETURN NEW;
END $$;
CREATE TRIGGER comment_moderation_guard BEFORE INSERT OR UPDATE ON public.comments
 FOR EACH ROW EXECUTE FUNCTION public.guard_comment_moderation();
REVOKE ALL ON FUNCTION public.guard_comment_moderation() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.update_submission_comment_count() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_count integer:=0; after_count integer:=0;
BEGIN
 IF TG_OP<>'INSERT' THEN before_count:=CASE WHEN NOT OLD.is_hidden THEN 1 ELSE 0 END; END IF;
 IF TG_OP<>'DELETE' THEN after_count:=CASE WHEN NOT NEW.is_hidden THEN 1 ELSE 0 END; END IF;
 UPDATE public.submissions SET comment_count=greatest(0,comment_count+after_count-before_count)
 WHERE school_id=coalesce(NEW.school_id,OLD.school_id) AND id=coalesce(NEW.submission_id,OLD.submission_id);
 RETURN NULL;
END $$;
ALTER FUNCTION public.update_submission_comment_count() OWNER TO tenant_executor;
DROP TRIGGER trigger_update_comment_count ON public.comments;
CREATE TRIGGER trigger_update_comment_count AFTER INSERT OR DELETE OR UPDATE OF is_hidden ON public.comments
 FOR EACH ROW EXECUTE FUNCTION public.update_submission_comment_count();
UPDATE public.submissions s SET comment_count=(SELECT count(*) FROM public.comments c
 WHERE c.school_id=s.school_id AND c.submission_id=s.id AND NOT c.is_hidden);

CREATE FUNCTION public.comment_action(p_action text,p_data jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=public.tenant_actor_id(); c public.comments%rowtype; sid uuid; cid uuid;
 decision text; total integer; threshold integer; inserted integer; result jsonb;
BEGIN
 IF p_action IN('create','edit') THEN
  IF length(trim(p_data->>'body')) NOT BETWEEN 10 AND 500 OR p_data->>'status' NOT IN('published','flagged')
   OR p_data->>'body' IS NULL OR p_data->>'status' IS NULL THEN RAISE EXCEPTION 'Invalid comment' USING ERRCODE='22023'; END IF;
  IF p_action='create' THEN
   sid:=(p_data->>'submissionId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=sid AND status IN('approved','in_progress','resolved')) THEN RAISE EXCEPTION 'Idea unavailable' USING ERRCODE='P0002'; END IF;
   cid:=nullif(p_data->>'parentId','')::uuid;
   IF cid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.comments WHERE id=cid AND submission_id=sid AND NOT is_hidden) THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='P0002'; END IF;
   IF actor IS NULL AND coalesce(length(p_data->>'anonToken'),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid author' USING ERRCODE='42501'; END IF;
   PERFORM set_config('suggfeed.comment_checked','checked',true);
   INSERT INTO public.comments(submission_id,body,user_id,anon_token,display_name,parent_id,moderation_status)
    VALUES(sid,trim(p_data->>'body'),actor,CASE WHEN actor IS NULL THEN p_data->>'anonToken' END,
     CASE WHEN actor IS NULL THEN 'Anonymous Student' ELSE coalesce(nullif(left(p_data->>'displayName',200),''),(SELECT display_name FROM public.tenant_profiles WHERE id=actor),'Student') END,cid,p_data->>'status') RETURNING * INTO c;
  ELSE
   SELECT * INTO c FROM public.comments WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF actor IS NULL OR c.id IS NULL OR c.user_id IS DISTINCT FROM actor OR c.moderation_status IN('hidden','deleted') THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='42501'; END IF;
   IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=c.submission_id AND status IN('approved','in_progress','resolved')) THEN RAISE EXCEPTION 'Idea unavailable' USING ERRCODE='P0002'; END IF;
   PERFORM set_config('suggfeed.comment_checked','checked',true);
   UPDATE public.comments SET body=trim(p_data->>'body'),version=version+1,edited_at=clock_timestamp(),reviewed_at=NULL,
    moderation_status=CASE WHEN EXISTS(SELECT 1 FROM public.reports WHERE comment_id=c.id AND resolved_at IS NULL) THEN 'flagged' ELSE p_data->>'status' END,
    is_hidden=p_data->>'status'<>'published' WHERE id=c.id RETURNING * INTO c;
  END IF;
  PERFORM set_config('suggfeed.comment_checked','',true);
  RETURN jsonb_build_object('id',c.id,'submission_id',c.submission_id,'body',CASE WHEN NOT c.is_hidden THEN c.body END,
   'display_name',c.display_name,'created_at',c.created_at,'parent_id',c.parent_id,'user_id',c.user_id,'version',c.version,'status',c.moderation_status);
 ELSIF p_action='report' THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  threshold:=(p_data->>'threshold')::integer;
  IF threshold IS NULL OR threshold NOT BETWEEN 1 AND 100 OR length(trim(p_data->>'body')) NOT BETWEEN 10 AND 500 OR p_data->>'body' IS NULL THEN RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=(p_data->>'commentId')::uuid FOR UPDATE;
  IF c.id IS NULL OR c.is_hidden OR NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=c.submission_id AND status IN('approved','in_progress','resolved')) THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.reports(user_id,comment_id,reason) VALUES(actor,c.id,trim(p_data->>'body')) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT count(*) INTO total FROM public.reports WHERE comment_id=c.id AND resolved_at IS NULL;
  IF total>=threshold THEN UPDATE public.comments SET moderation_status='flagged',is_hidden=true WHERE id=c.id; END IF;
  RETURN jsonb_build_object('already_reported',inserted=0,'hidden',total>=threshold);
 ELSIF p_action IN('approve','hide','delete') THEN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF c.id IS NULL OR c.moderation_status='deleted' THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='P0002'; END IF;
  IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001'; END IF;
  IF length(trim(p_data->>'body')) NOT BETWEEN 10 AND 500 OR p_data->>'body' IS NULL THEN RAISE EXCEPTION 'Review reason required' USING ERRCODE='22023'; END IF;
  PERFORM set_config('suggfeed.comment_checked','review',true);
  UPDATE public.comments SET moderation_status=CASE p_action WHEN 'approve' THEN 'published' WHEN 'hide' THEN 'hidden' ELSE 'deleted' END,
   is_hidden=p_action<>'approve',body=CASE WHEN p_action='delete' THEN '[Comment deleted by administrator]' ELSE body END,
   version=version+1,reviewed_at=clock_timestamp() WHERE id=c.id;
  PERFORM set_config('suggfeed.comment_checked','',true);
  UPDATE public.reports SET resolution=CASE WHEN p_action='approve' THEN 'dismissed' ELSE 'removed' END,
   resolution_reason=trim(p_data->>'body'),resolved_at=now(),resolved_by=actor WHERE comment_id=c.id AND resolved_at IS NULL;
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata)
   VALUES(actor,'comment_'||p_action,'comments',c.id,jsonb_build_object('version',c.version,'reason',trim(p_data->>'body')));
  RETURN jsonb_build_object('id',c.id);
 END IF;
 RAISE EXCEPTION 'Invalid comment action' USING ERRCODE='22023';
END $$;
ALTER FUNCTION public.comment_action(text,jsonb) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.comment_action(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.tenant_rpc_catalog(function_signature,function_name,allow_anonymous)
 VALUES('public.comment_action(text,jsonb)','comment_action',true);
-- Block older report/resolve paths from bypassing the dedicated atomic workflow.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.community_action(uuid,text,jsonb)'::regprocedure) INTO definition;
 definition:=regexp_replace(definition,'\mBEGIN\M',$guard$BEGIN
 IF p_action IN('report','resolve') AND (
  p_action='report' AND nullif(p_data->>'commentId','') IS NOT NULL OR
  p_action='resolve' AND EXISTS(SELECT 1 FROM public.reports WHERE id=(p_data->>'id')::uuid AND comment_id IS NOT NULL)
 ) THEN RAISE EXCEPTION 'Use comment review' USING ERRCODE='42501'; END IF;
 $guard$,'i');
 EXECUTE definition;
END $$;
CREATE VIEW public.comment_moderation_queue WITH(security_invoker=true) AS
 SELECT c.*,(SELECT count(*) FROM public.reports r WHERE r.school_id=c.school_id AND r.comment_id=c.id AND r.resolved_at IS NULL) AS open_report_count
 FROM public.comments c WHERE c.moderation_status IN('flagged','hidden') OR c.moderation_status='published' AND
 EXISTS(SELECT 1 FROM public.reports r WHERE r.school_id=c.school_id AND r.comment_id=c.id AND r.resolved_at IS NULL);
REVOKE ALL ON public.comment_moderation_queue FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.comment_moderation_queue TO tenant_executor,service_role;
CREATE INDEX reports_school_open_comment ON public.reports(school_id,comment_id) WHERE resolved_at IS NULL AND comment_id IS NOT NULL;

REVOKE CREATE ON SCHEMA public FROM tenant_executor;
NOTIFY pgrst, 'reload schema';
COMMIT;
