BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.comments ADD COLUMN text_revision integer NOT NULL DEFAULT 1 CHECK(text_revision>0),
 ADD COLUMN moderation_reason text NOT NULL DEFAULT 'legacy_check' CHECK(moderation_reason IN('clear','dictionary','reports','detector_unavailable','legacy_check')),
 ADD COLUMN detector_version text NOT NULL DEFAULT 'legacy',ADD COLUMN moderation_rules jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(moderation_rules)='array'),
 ADD COLUMN review_reason text;
-- Existing decisions stay resolved; legacy held comments remain reviewable.
UPDATE public.comments SET reviewed_at=NULL WHERE moderation_status='flagged';
ALTER TABLE public.reports ADD COLUMN comment_revision integer CHECK(comment_revision>0);
UPDATE public.reports SET comment_revision=1 WHERE comment_id IS NOT NULL;
ALTER TABLE public.reports ADD CONSTRAINT reports_comment_revision_required CHECK(comment_id IS NULL OR comment_revision IS NOT NULL);
DROP INDEX IF EXISTS public.reports_user_comment_unique;
DROP INDEX IF EXISTS public.reports_school_comment_reporter_unique;
CREATE UNIQUE INDEX reports_school_comment_revision_reporter ON public.reports(school_id,comment_id,comment_revision,user_id) WHERE comment_id IS NOT NULL;
CREATE TABLE public.comment_text_revisions(
 school_id uuid NOT NULL,comment_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),body text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(school_id,comment_id,revision),FOREIGN KEY(school_id,comment_id) REFERENCES public.comments(school_id,id) ON DELETE CASCADE);
CREATE TABLE public.comment_review_notices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL,user_id uuid NOT NULL,
 comment_id uuid NOT NULL,submission_id uuid NOT NULL,moderation_version integer NOT NULL,decision text NOT NULL CHECK(decision IN('approve','hide','delete')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),read_at timestamptz,
 UNIQUE(school_id,comment_id,moderation_version),FOREIGN KEY(school_id,comment_id) REFERENCES public.comments(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,submission_id) REFERENCES public.submissions(school_id,id) ON DELETE CASCADE,
 FOREIGN KEY(school_id,user_id) REFERENCES public.school_memberships(school_id,user_id));
CREATE INDEX comments_resolved_review_page ON public.comments(school_id,reviewed_at DESC,id) WHERE reviewed_at IS NOT NULL;
CREATE INDEX comment_review_notices_owner ON public.comment_review_notices(school_id,user_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['comment_text_revisions','comment_review_notices'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO tenant_executor',t);
  EXECUTE format('CREATE POLICY school_scope ON public.%I TO tenant_executor USING(school_id=public.tenant_school_id()) WITH CHECK(school_id=public.tenant_school_id())',t);
  EXECUTE format('CREATE TRIGGER school_immutable BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_ownership()',t);
 END LOOP;
END $$;
INSERT INTO public.comment_text_revisions(school_id,comment_id,revision,body) SELECT school_id,id,text_revision,CASE WHEN moderation_status<>'deleted' THEN body END FROM public.comments;
CREATE OR REPLACE FUNCTION public.comment_action(p_action text,p_data jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=public.tenant_actor_id(); c public.comments%rowtype; sid uuid; cid uuid;
 decision text; total integer; threshold integer; inserted integer; result jsonb; requested integer; last_page integer; queue_view text;
BEGIN

 IF p_action IN('mine','notices','read-notice','owner-current') THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_action='owner-current' THEN
   SELECT * INTO c FROM public.comments WHERE id=(p_data->>'id')::uuid AND user_id=actor;
   IF c.id IS NULL THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='P0002'; END IF;
   RETURN jsonb_build_object('id',c.id,'body',CASE WHEN c.moderation_status<>'deleted' THEN c.body END,'version',c.version,'status',c.moderation_status);
  ELSIF p_action='read-notice' THEN
   UPDATE public.comment_review_notices SET read_at=coalesce(read_at,clock_timestamp()) WHERE user_id=actor AND id=(p_data->>'id')::uuid;
   RETURN '{}'::jsonb;
  ELSIF p_action='notices' THEN
   RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (
    SELECT n.id,n.comment_id,n.submission_id,n.decision,n.reason,n.created_at,n.read_at FROM public.comment_review_notices n
    WHERE n.user_id=actor ORDER BY n.created_at DESC,n.id LIMIT 50)q));
  END IF;
  RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (
   SELECT mc.id,mc.submission_id,mc.body,mc.version,mc.text_revision,mc.moderation_status,mc.review_reason,mc.created_at,mc.edited_at
   FROM public.comments mc JOIN public.submissions s ON s.id=mc.submission_id AND s.school_id=mc.school_id
   WHERE mc.user_id=actor AND mc.moderation_status='flagged' AND s.status IN('approved','in_progress','resolved') AND s.safety_state='clear'
   AND mc.submission_id=(p_data->>'submissionId')::uuid ORDER BY mc.created_at DESC,mc.id LIMIT 50)q));
 ELSIF p_action='queue' THEN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  requested:=greatest(1,least(100000,coalesce((p_data->>'page')::integer,1)));
  queue_view:=coalesce(p_data->>'view','needs-review');
  IF queue_view NOT IN('needs-review','reported','resolved') THEN RAISE EXCEPTION 'Invalid view' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO total FROM public.comments mc WHERE
   CASE queue_view WHEN 'resolved' THEN mc.reviewed_at IS NOT NULL AND mc.moderation_status<>'flagged'
   WHEN 'reported' THEN mc.reviewed_at IS NULL AND EXISTS(SELECT 1 FROM public.reports r WHERE r.comment_id=mc.id AND r.resolved_at IS NULL)
   ELSE mc.moderation_status IN('flagged','hidden') AND mc.reviewed_at IS NULL END;
  last_page:=greatest(1,(total+24)/25);requested:=least(requested,last_page);
  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (
   SELECT mc.id,mc.submission_id,mc.parent_id,mc.body,mc.display_name,mc.created_at,mc.moderation_status,mc.moderation_reason,mc.detector_version,
    mc.moderation_rules,mc.version,mc.text_revision,mc.reviewed_at,mc.review_reason,s.title AS idea_title,
    (SELECT left(p.body,500) FROM public.comments p WHERE p.id=mc.parent_id AND p.school_id=mc.school_id AND p.moderation_status<>'deleted') AS parent_body,
    (SELECT count(*) FROM public.reports r WHERE r.comment_id=mc.id AND r.resolved_at IS NULL) AS open_report_count,
    (SELECT coalesce(jsonb_agg(to_jsonb(rq)),'[]') FROM (SELECT r.reason,r.created_at,r.comment_revision,r.resolution,r.resolution_reason
      FROM public.reports r WHERE r.comment_id=mc.id ORDER BY r.created_at DESC,r.id LIMIT 30)rq) AS reports,
    (SELECT coalesce(jsonb_agg(to_jsonb(hq)),'[]') FROM (SELECT h.revision,h.body,h.created_at FROM public.comment_text_revisions h
      WHERE h.comment_id=mc.id ORDER BY h.revision DESC LIMIT 10)hq) AS revisions,
    (SELECT coalesce(jsonb_agg(to_jsonb(aq)),'[]') FROM (SELECT a.action,a.created_at,a.metadata->>'reason' AS reason,a.metadata->>'text_revision' AS text_revision
      FROM public.audit_log a WHERE a.target_table='comments' AND a.target_id=mc.id AND a.action IN('comment_approve','comment_hide','comment_delete')
      ORDER BY a.created_at DESC,a.id LIMIT 10)aq) AS decisions
   FROM public.comments mc JOIN public.submissions s ON s.id=mc.submission_id AND s.school_id=mc.school_id
   WHERE CASE queue_view WHEN 'resolved' THEN mc.reviewed_at IS NOT NULL AND mc.moderation_status<>'flagged'
    WHEN 'reported' THEN mc.reviewed_at IS NULL AND EXISTS(SELECT 1 FROM public.reports r WHERE r.comment_id=mc.id AND r.resolved_at IS NULL)
    ELSE mc.moderation_status IN('flagged','hidden') AND mc.reviewed_at IS NULL END
   ORDER BY CASE WHEN queue_view='resolved' THEN mc.reviewed_at END DESC,mc.created_at,mc.id OFFSET (requested-1)*25 LIMIT 25)q;
  RETURN jsonb_build_object('items',result,'page',requested,'count',total,'view',queue_view,'activeCount',(SELECT count(*) FROM public.comments cm WHERE (cm.moderation_status IN('flagged','hidden') AND cm.reviewed_at IS NULL) OR EXISTS(SELECT 1 FROM public.reports rp WHERE rp.comment_id=cm.id AND rp.resolved_at IS NULL)),'counts',jsonb_build_object(
   'needs-review',(SELECT count(*) FROM public.comments WHERE moderation_status IN('flagged','hidden') AND reviewed_at IS NULL),
   'reported',(SELECT count(*) FROM public.comments mc WHERE reviewed_at IS NULL AND EXISTS(SELECT 1 FROM public.reports r WHERE r.comment_id=mc.id AND r.resolved_at IS NULL)),
   'resolved',(SELECT count(*) FROM public.comments WHERE reviewed_at IS NOT NULL AND moderation_status<>'flagged')));
 END IF;
 IF p_action IN('create','edit') THEN
  IF length(trim(p_data->>'body')) NOT BETWEEN 10 AND 500 OR p_data->>'status' NOT IN('published','flagged')
   OR p_data->>'body' IS NULL OR p_data->>'status' IS NULL THEN RAISE EXCEPTION 'Invalid comment' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_data->'assessment') IS DISTINCT FROM 'object' THEN
   p_data:=p_data||jsonb_build_object('status','flagged','assessment',jsonb_build_object('reason','legacy_check','rules','[]'::jsonb,'detectorVersion','legacy'));
  END IF;
  IF p_data->'assessment'->>'reason' NOT IN('clear','dictionary','detector_unavailable','legacy_check') OR
   p_data->'assessment'->>'reason' IS NULL OR jsonb_typeof(p_data->'assessment'->'rules') IS DISTINCT FROM 'array' OR
   octet_length((p_data->'assessment')::text)>1000 OR length(coalesce(p_data->'assessment'->>'detectorVersion','')) NOT BETWEEN 1 AND 100 OR
   (p_data->>'status'='published' AND p_data->'assessment'->>'reason'<>'clear') THEN
   RAISE EXCEPTION 'Invalid assessment' USING ERRCODE='22023';
  END IF;
  IF p_action='create' THEN
   sid:=(p_data->>'submissionId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=sid AND safety_state='clear' AND status IN('approved','in_progress','resolved')) THEN RAISE EXCEPTION 'Idea unavailable' USING ERRCODE='P0002'; END IF;
   cid:=nullif(p_data->>'parentId','')::uuid;
   IF cid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.comments WHERE id=cid AND submission_id=sid AND NOT is_hidden) THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='P0002'; END IF;
   IF actor IS NULL AND coalesce(length(p_data->>'anonToken'),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid author' USING ERRCODE='42501'; END IF;
   PERFORM set_config('suggfeed.comment_checked','checked',true);
   INSERT INTO public.comments(submission_id,body,user_id,anon_token,display_name,parent_id,moderation_status,moderation_reason,detector_version,moderation_rules)
    VALUES(sid,trim(p_data->>'body'),actor,CASE WHEN actor IS NULL THEN p_data->>'anonToken' END,
     CASE WHEN actor IS NULL THEN 'Anonymous Student' ELSE coalesce(nullif(left(p_data->>'displayName',200),''),(SELECT display_name FROM public.tenant_profiles WHERE id=actor),'Student') END,cid,p_data->>'status',p_data->'assessment'->>'reason',p_data->'assessment'->>'detectorVersion',p_data->'assessment'->'rules') RETURNING * INTO c;
  ELSE
   SELECT * INTO c FROM public.comments WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF actor IS NULL OR c.id IS NULL OR c.user_id IS DISTINCT FROM actor OR c.moderation_status IN('hidden','deleted') THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='42501'; END IF;
   IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=c.submission_id AND safety_state='clear' AND status IN('approved','in_progress','resolved')) THEN RAISE EXCEPTION 'Idea unavailable' USING ERRCODE='P0002'; END IF;
   PERFORM set_config('suggfeed.comment_checked','checked',true);
   IF c.body IS DISTINCT FROM trim(p_data->>'body') THEN
   UPDATE public.comments SET body=trim(p_data->>'body'),version=version+1,text_revision=text_revision+1,edited_at=clock_timestamp(),reviewed_at=NULL,review_reason=NULL,
    moderation_reason=CASE WHEN EXISTS(SELECT 1 FROM public.reports WHERE comment_id=c.id AND resolved_at IS NULL) THEN 'reports' ELSE p_data->'assessment'->>'reason' END,detector_version=p_data->'assessment'->>'detectorVersion',moderation_rules=p_data->'assessment'->'rules',
    moderation_status=CASE WHEN EXISTS(SELECT 1 FROM public.reports WHERE comment_id=c.id AND resolved_at IS NULL) THEN 'flagged' ELSE p_data->>'status' END,
    is_hidden=p_data->>'status'<>'published' WHERE id=c.id RETURNING * INTO c;
   END IF;
  END IF;
  INSERT INTO public.comment_text_revisions(school_id,comment_id,revision,body) VALUES(c.school_id,c.id,c.text_revision,c.body) ON CONFLICT DO NOTHING;
  PERFORM set_config('suggfeed.comment_checked','',true);
  RETURN jsonb_build_object('id',c.id,'submission_id',c.submission_id,'body',CASE WHEN NOT c.is_hidden THEN c.body END,
   'display_name',c.display_name,'created_at',c.created_at,'parent_id',c.parent_id,'user_id',c.user_id,'version',c.version,'text_revision',c.text_revision,'status',c.moderation_status);
 ELSIF p_action='report' THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  threshold:=(p_data->>'threshold')::integer;
  IF threshold IS NULL OR threshold NOT BETWEEN 1 AND 100 OR length(trim(p_data->>'body')) NOT BETWEEN 10 AND 500 OR p_data->>'body' IS NULL THEN RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=(p_data->>'commentId')::uuid FOR UPDATE;
  IF c.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=c.submission_id AND safety_state='clear' AND status IN('approved','in_progress','resolved')) THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='P0002'; END IF;
  IF c.text_revision IS DISTINCT FROM (p_data->>'textRevision')::integer THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.reports WHERE comment_id=c.id AND user_id=actor AND comment_revision=c.text_revision) THEN
   RETURN jsonb_build_object('already_reported',true,'hidden',c.is_hidden);
  END IF;
  IF c.is_hidden OR c.user_id=actor THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.reports(user_id,comment_id,reason,comment_revision) VALUES(actor,c.id,trim(p_data->>'body'),c.text_revision) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT count(*) INTO total FROM public.reports WHERE comment_id=c.id AND resolved_at IS NULL;
  IF inserted>0 THEN UPDATE public.comments SET version=version+1,reviewed_at=NULL,review_reason=NULL,moderation_reason='reports',
   moderation_status=CASE WHEN total>=threshold THEN 'flagged' ELSE moderation_status END,is_hidden=total>=threshold WHERE id=c.id; END IF;
  RETURN jsonb_build_object('already_reported',inserted=0,'hidden',total>=threshold);
 ELSIF p_action IN('approve','hide','delete') THEN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.comments WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF c.id IS NULL OR c.moderation_status='deleted' THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='P0002'; END IF;
  IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001'; END IF;
  IF c.text_revision IS DISTINCT FROM (p_data->>'textRevision')::integer THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001'; END IF;
  IF length(trim(p_data->>'body')) NOT BETWEEN 10 AND 500 OR p_data->>'body' IS NULL THEN RAISE EXCEPTION 'Review reason required' USING ERRCODE='22023'; END IF;
  PERFORM set_config('suggfeed.comment_checked','review',true);
  UPDATE public.comments SET moderation_status=CASE p_action WHEN 'approve' THEN 'published' WHEN 'hide' THEN 'hidden' ELSE 'deleted' END,
   is_hidden=p_action<>'approve',body=CASE WHEN p_action='delete' THEN '[Comment deleted by administrator]' ELSE body END,
   version=version+1,review_reason=trim(p_data->>'body'),reviewed_at=clock_timestamp() WHERE id=c.id;
  IF p_action='delete' THEN UPDATE public.comment_text_revisions SET body=NULL WHERE comment_id=c.id; END IF;
  IF c.user_id IS NOT NULL THEN INSERT INTO public.comment_review_notices(school_id,user_id,comment_id,submission_id,moderation_version,decision,reason)
   VALUES(c.school_id,c.user_id,c.id,c.submission_id,c.version+1,p_action,trim(p_data->>'body')); END IF;
  PERFORM set_config('suggfeed.comment_checked','',true);
  UPDATE public.reports SET resolution=CASE WHEN p_action='approve' THEN 'dismissed' ELSE 'removed' END,
   resolution_reason=trim(p_data->>'body'),resolved_at=now(),resolved_by=actor WHERE comment_id=c.id AND resolved_at IS NULL;
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata)
   VALUES(actor,'comment_'||p_action,'comments',c.id,jsonb_build_object('version',c.version,'text_revision',c.text_revision,'reason',trim(p_data->>'body')));
  RETURN jsonb_build_object('id',c.id);
 END IF;
 RAISE EXCEPTION 'Invalid comment action' USING ERRCODE='22023';
END $$;
ALTER FUNCTION public.comment_action(text,jsonb) OWNER TO tenant_executor;
REVOKE ALL ON FUNCTION public.comment_action(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Legacy queue readers must not put completed hidden decisions back into active work.
DROP VIEW public.comment_moderation_queue;
CREATE VIEW public.comment_moderation_queue WITH(security_invoker=true) AS
 SELECT c.*,(SELECT count(*) FROM public.reports r WHERE r.school_id=c.school_id AND r.comment_id=c.id AND r.resolved_at IS NULL) AS open_report_count
 FROM public.comments c WHERE c.moderation_status IN('flagged','hidden') AND c.reviewed_at IS NULL OR c.moderation_status='published' AND
 EXISTS(SELECT 1 FROM public.reports r WHERE r.school_id=c.school_id AND r.comment_id=c.id AND r.resolved_at IS NULL);
REVOKE ALL ON public.comment_moderation_queue FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.comment_moderation_queue TO tenant_executor,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
