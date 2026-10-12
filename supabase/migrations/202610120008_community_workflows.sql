-- Account/private workflows are reachable only through verified server sessions.
BEGIN;
CREATE TABLE public.idea_clarifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
 staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 prompt text NOT NULL CHECK(char_length(trim(prompt)) BETWEEN 10 AND 2000),
 reply text CHECK(char_length(trim(reply)) BETWEEN 10 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(), replied_at timestamptz,
 closed_at timestamptz
);
CREATE INDEX idea_clarifications_open_idx ON public.idea_clarifications(submission_id,created_at DESC) WHERE closed_at IS NULL;
CREATE TABLE public.idea_merges (
 source_id uuid PRIMARY KEY REFERENCES public.submissions(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
 source_title text NOT NULL, reason text NOT NULL CHECK(char_length(trim(reason)) BETWEEN 10 AND 500),
 staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(source_id<>target_id)
);
CREATE INDEX idea_merges_target_idx ON public.idea_merges(target_id);
ALTER TABLE public.reports ADD COLUMN resolution text CHECK(resolution IN ('dismissed','removed'));
ALTER TABLE public.reports ADD COLUMN resolution_reason text CHECK(char_length(trim(resolution_reason)) BETWEEN 10 AND 500);
ALTER TABLE public.reports ADD COLUMN resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.reports ADD COLUMN resolved_at timestamptz;
CREATE INDEX reports_open_idx ON public.reports(created_at) WHERE resolved_at IS NULL;
-- Legacy browser inserts may specify a reason/target, never a staff decision.
REVOKE INSERT ON public.reports FROM authenticated;
GRANT INSERT(user_id,submission_id,comment_id,reason) ON public.reports TO authenticated;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
CREATE POLICY "hidden comments stay private" ON public.comments AS RESTRICTIVE FOR SELECT
 USING(NOT is_hidden OR public.is_staff());
CREATE TABLE public.notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 update_mode text NOT NULL DEFAULT 'all' CHECK(update_mode IN ('all','milestones')),
 weekly_digest boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.idea_clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idea_clarifications,public.idea_merges,public.notification_preferences FROM public,anon,authenticated;
GRANT ALL ON public.idea_clarifications,public.idea_merges,public.notification_preferences TO service_role;
CREATE VIEW public.staff_stale_work AS
 SELECT s.id,s.title,s.is_blocked,coalesce(u.latest,s.created_at) AS last_public_update,b.blocked_since
 FROM public.submissions s LEFT JOIN LATERAL (
  SELECT max(created_at) AS latest FROM public.idea_updates
  WHERE submission_id=s.id AND visibility='public' AND deleted_at IS NULL
 ) u ON true
 LEFT JOIN LATERAL (
  SELECT min(created_at) AS blocked_since FROM public.idea_updates
  WHERE submission_id=s.id AND visibility='public' AND deleted_at IS NULL AND kind='blocked'
   AND created_at>coalesce((SELECT max(created_at) FROM public.idea_updates
    WHERE submission_id=s.id AND visibility='public' AND deleted_at IS NULL AND kind<>'blocked'),'-infinity'::timestamptz)
 ) b ON true
 WHERE s.status IN ('approved','in_progress') AND (coalesce(u.latest,s.created_at)<now()-interval '30 days'
  OR (s.is_blocked AND b.blocked_since<now()-interval '14 days'));
REVOKE ALL ON public.staff_stale_work FROM public,anon,authenticated;
GRANT SELECT ON public.staff_stale_work TO service_role;

CREATE FUNCTION public.community_action(p_actor uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; tid uuid; cid uuid; s public.submissions%rowtype; t public.submissions%rowtype;
 r public.reports%rowtype; c public.idea_clarifications%rowtype; staff boolean; result jsonb; item jsonb;
BEGIN
 staff := EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role::text IN ('admin','moderator'));
 IF p_action IN ('request','close','merge','resolve','bulk_assign') AND NOT staff THEN
  RAISE EXCEPTION 'Staff required' USING errcode='42501';
 END IF;
 IF p_action='request' THEN
  sid := (p_data->>'submissionId')::uuid;
  SELECT * INTO s FROM public.submissions WHERE id=sid FOR UPDATE;
  IF NOT FOUND OR (s.user_id IS NULL AND s.anonymous_tracking_hash IS NULL) THEN
   RAISE EXCEPTION 'Submission unavailable for private replies' USING errcode='P0002';
  END IF;
  IF EXISTS(SELECT 1 FROM public.idea_clarifications WHERE submission_id=sid AND closed_at IS NULL AND replied_at IS NULL) THEN
   RAISE EXCEPTION 'There is already an unanswered request' USING errcode='40001';
  END IF;
  INSERT INTO public.idea_clarifications(submission_id,staff_id,prompt) VALUES(sid,p_actor,trim(p_data->>'body')) RETURNING id INTO cid;
  RETURN jsonb_build_object('id',cid);
 ELSIF p_action='close' THEN
  UPDATE public.idea_clarifications SET closed_at=coalesce(closed_at,now()) WHERE id=(p_data->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING errcode='P0002'; END IF;
 ELSIF p_action='reply' THEN
  SELECT * INTO c FROM public.idea_clarifications WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING errcode='P0002'; END IF;
  SELECT * INTO s FROM public.submissions WHERE id=c.submission_id;
  IF NOT ((p_actor IS NOT NULL AND s.user_id=p_actor) OR
    (s.user_id IS NULL AND s.anonymous_tracking_hash IS NOT NULL AND s.anonymous_tracking_hash=p_data->>'trackingHash')) IS TRUE THEN
   RAISE EXCEPTION 'Not found' USING errcode='P0002';
  END IF;
  IF c.closed_at IS NOT NULL OR c.replied_at IS NOT NULL THEN RAISE EXCEPTION 'Request is no longer open' USING errcode='40001'; END IF;
  UPDATE public.idea_clarifications SET reply=trim(p_data->>'body'),replied_at=now() WHERE id=c.id;
 ELSIF p_action='report' THEN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor) THEN RAISE EXCEPTION 'Sign in required' USING errcode='42501'; END IF;
  sid := nullif(p_data->>'submissionId','')::uuid; cid := nullif(p_data->>'commentId','')::uuid;
  IF (sid IS NULL)=(cid IS NULL) THEN RAISE EXCEPTION 'Invalid target' USING errcode='22023'; END IF;
  IF cid IS NOT NULL THEN
   SELECT submission_id INTO sid FROM public.comments WHERE id=cid AND NOT is_hidden;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=sid AND status IN ('approved','in_progress','resolved')) THEN
   RAISE EXCEPTION 'Not found' USING errcode='P0002';
  END IF;
  INSERT INTO public.reports(user_id,submission_id,comment_id,reason)
   VALUES(p_actor,CASE WHEN cid IS NULL THEN sid END,cid,trim(p_data->>'body')) ON CONFLICT DO NOTHING;
 ELSIF p_action='resolve' THEN
  SELECT * INTO r FROM public.reports WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING errcode='P0002'; END IF;
  IF r.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Already reviewed' USING errcode='40001'; END IF;
  IF p_data->>'resolution' NOT IN ('dismissed','removed') THEN RAISE EXCEPTION 'Invalid resolution' USING errcode='22023'; END IF;
  IF p_data->>'resolution'='removed' THEN
   IF r.comment_id IS NOT NULL THEN UPDATE public.comments SET is_hidden=true WHERE id=r.comment_id;
   ELSE UPDATE public.submissions SET status='rejected',updated_at=clock_timestamp() WHERE id=r.submission_id; END IF;
  END IF;
  UPDATE public.reports SET resolution=p_data->>'resolution',resolution_reason=trim(p_data->>'body'),resolved_by=p_actor,resolved_at=now()
   WHERE id=r.id;
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata)
   VALUES(p_actor,'moderation_report_resolved','reports',r.id,jsonb_build_object('resolution',p_data->>'resolution'));
 ELSIF p_action='merge' THEN
  sid := (p_data->>'submissionId')::uuid; tid := (p_data->>'targetId')::uuid;
  -- Deterministic locking prevents cross-merge deadlocks. Keep original identities,
  -- tracking codes and votes in place: counts must not be blindly added together.
  PERFORM id FROM public.submissions WHERE id IN(sid,tid) ORDER BY id FOR UPDATE;
  SELECT * INTO s FROM public.submissions WHERE id=sid;
  SELECT * INTO t FROM public.submissions WHERE id=tid;
  IF sid=tid OR s.id IS NULL OR t.id IS NULL OR s.status NOT IN ('approved','in_progress','resolved')
   OR t.status NOT IN ('approved','in_progress','resolved') OR EXISTS(SELECT 1 FROM public.idea_merges WHERE source_id IN(sid,tid) OR target_id=sid) THEN
   RAISE EXCEPTION 'Choose two independent public ideas' USING errcode='22023';
  END IF;
  IF p_data->>'updatedAt' IS NULL OR p_data->>'targetUpdatedAt' IS NULL OR s.updated_at<>(p_data->>'updatedAt')::timestamptz OR t.updated_at<>(p_data->>'targetUpdatedAt')::timestamptz THEN
   RAISE EXCEPTION 'Ideas have changed; review again' USING errcode='40001';
  END IF;
  INSERT INTO public.idea_merges(source_id,target_id,source_title,reason,staff_id) VALUES(sid,tid,s.title,trim(p_data->>'body'),p_actor);
  INSERT INTO public.idea_follows(user_id,submission_id) SELECT user_id,tid FROM public.idea_follows WHERE submission_id=sid ON CONFLICT DO NOTHING;
  DELETE FROM public.idea_follows WHERE submission_id=sid;
  UPDATE public.submissions SET status='rejected',updated_at=clock_timestamp() WHERE id=sid;
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(p_actor,'duplicate_merged','submissions',sid,jsonb_build_object('target_id',tid));
 ELSIF p_action='bulk_assign' THEN
  tid := nullif(p_data->>'assigneeId','')::uuid;
  IF tid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=tid AND role::text IN ('admin','moderator')) THEN
   RAISE EXCEPTION 'Choose a staff member' USING errcode='22023';
  END IF;
  IF jsonb_typeof(p_data->'items')<>'array' OR jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Select 1 to 25 ideas' USING errcode='22023'; END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_data->'items'))<>jsonb_array_length(p_data->'items') THEN RAISE EXCEPTION 'Duplicate selection' USING errcode='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'items') ORDER BY value->>'id' LOOP
   SELECT * INTO s FROM public.submissions WHERE id=(item->>'id')::uuid FOR UPDATE;
   IF s.id IS NULL THEN RAISE EXCEPTION 'Not found' USING errcode='P0002'; END IF;
   IF (item->>'updatedAt') IS NULL OR s.updated_at<>(item->>'updatedAt')::timestamptz THEN RAISE EXCEPTION 'Selection changed' USING errcode='40001'; END IF;
   INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(p_actor,'bulk_assignment','submissions',s.id,jsonb_build_object('assignee_id',tid));
   INSERT INTO public.submission_workflow(submission_id,assignee_id) VALUES(s.id,tid) ON CONFLICT(submission_id) DO UPDATE SET assignee_id=excluded.assignee_id;
   UPDATE public.submissions SET updated_at=clock_timestamp() WHERE id=s.id;
  END LOOP;
 ELSE RAISE EXCEPTION 'Unknown action' USING errcode='22023'; END IF;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.community_action(uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.community_action(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_idea_followers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.visibility<>'public' OR NOT NEW.notify OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 INSERT INTO public.idea_notifications(user_id,submission_id,update_id,kind,title,office_label)
 SELECT f.user_id,NEW.submission_id,NEW.id,NEW.kind,s.title,NEW.office_label
 FROM public.idea_follows f JOIN public.submissions s ON s.id=f.submission_id
 LEFT JOIN public.notification_preferences p ON p.user_id=f.user_id
 WHERE f.submission_id=NEW.submission_id AND s.status IN ('approved','in_progress','resolved')
 AND (coalesce(p.update_mode,'all')='all' OR NEW.kind IN ('started','milestone','blocked','completed','correction'))
 ON CONFLICT(user_id,update_id) DO NOTHING;
 -- Preserve legacy external channel intents as held. Weekly delivery is separate;
 -- no immediate email or push is enabled by this migration.
 INSERT INTO public.idea_notification_outbox(notification_id,channel,state)
 SELECT n.id,channel.name,'held' FROM public.idea_notifications n
 JOIN public.idea_follows f ON f.user_id=n.user_id AND f.submission_id=n.submission_id
 CROSS JOIN (VALUES ('email'),('push')) channel(name)
 WHERE n.update_id=NEW.id AND ((channel.name='email' AND f.email_enabled) OR (channel.name='push' AND f.push_enabled))
 ON CONFLICT(notification_id,channel) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_idea_followers() FROM public,anon,authenticated;
COMMIT;
