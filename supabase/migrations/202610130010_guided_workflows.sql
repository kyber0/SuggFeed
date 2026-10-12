BEGIN;
-- Operators enable this only after staging acceptance. No application role can
-- change the rollout switch. Paused blocks lifecycle writes, not private notes.
CREATE TABLE public.workflow_rollout(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false, paused boolean NOT NULL DEFAULT false);
INSERT INTO public.workflow_rollout(singleton) VALUES(true);
ALTER TABLE public.workflow_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_rollout FROM public,anon,authenticated,service_role;
CREATE TABLE public.workflow_requests(request_id uuid PRIMARY KEY,submission_id uuid NOT NULL REFERENCES public.submissions(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id),payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.work_date_repairs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id),actor_id uuid NOT NULL REFERENCES public.profiles(id),
  previous_dates jsonb NOT NULL,verified_dates jsonb NOT NULL,source text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.workflow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_date_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workflow_requests,public.work_date_repairs FROM public,anon,authenticated;
GRANT SELECT ON public.workflow_requests,public.work_date_repairs TO service_role;

ALTER TABLE public.idea_updates DROP CONSTRAINT idea_updates_kind_check;
ALTER TABLE public.idea_updates ADD CONSTRAINT idea_updates_kind_check CHECK(kind IN ('started','update','milestone','blocked','completed','correction','resumed','reopened','withdrawn'));
ALTER TABLE public.idea_notifications DROP CONSTRAINT IF EXISTS idea_notifications_kind_check;
ALTER TABLE public.idea_notifications ADD CONSTRAINT idea_notifications_kind_check CHECK(kind IN ('started','update','milestone','blocked','completed','correction','resumed','reopened','withdrawn'));

CREATE FUNCTION public.staff_workflow_context(p_submission_id uuid,p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions%rowtype; role_name text; flags public.workflow_rollout%rowtype; issues text[]:=ARRAY[]::text[]; actions text[]:=ARRAY[]::text[];
BEGIN
  SELECT role::text INTO role_name FROM public.profiles WHERE id=p_actor_id;
  IF role_name IS NULL OR role_name NOT IN ('admin','moderator','staff') THEN RAISE EXCEPTION 'Staff access required' USING errcode='42501'; END IF;
  SELECT * INTO s FROM public.submissions WHERE id=p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode='P0002'; END IF;
  SELECT * INTO flags FROM public.workflow_rollout WHERE singleton;
  IF s.status::text IN ('in_progress','resolved') AND s.started_at IS NULL THEN issues:=array_append(issues,'missing_start'); END IF;
  IF s.status::text='resolved' AND s.resolved_at IS NULL THEN issues:=array_append(issues,'missing_completion'); END IF;
  IF NOT flags.paused THEN
    IF s.status::text='pending' THEN actions:=ARRAY['approve','decline']; END IF;
    IF cardinality(issues)=0 THEN
      IF s.status::text='approved' THEN actions:=ARRAY['start'];
      ELSIF s.status::text='in_progress' THEN
        actions:=ARRAY['update','milestone','pause','complete','correction'];
        IF s.is_blocked THEN actions:=ARRAY['update','milestone','resume','complete','correction']; END IF;
      ELSIF s.status::text='resolved' THEN actions:=ARRAY['correction'];IF role_name='admin' THEN actions:=array_append(actions,'reopen');END IF;
      END IF;
    END IF;
    IF role_name='admin' AND s.status::text IN ('approved','in_progress','resolved') THEN actions:=array_append(actions,'withdraw');END IF;
  END IF;
  RETURN jsonb_build_object('mode',CASE WHEN flags.enabled THEN 'guided' ELSE 'preview' END,'paused',flags.paused,
    'allowedActions',actions,'issues',issues,'canRepair',NOT flags.paused AND role_name='admin' AND cardinality(issues)>0);
END; $$;
REVOKE ALL ON FUNCTION public.staff_workflow_context(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_workflow_context(uuid,uuid) TO service_role;

-- Protect older RPCs and direct table writers after rollout, including report
-- removal/merging. Validated functions grant transaction-local write context.
CREATE FUNCTION public.guard_guided_projection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE flags public.workflow_rollout%rowtype;
BEGIN
  SELECT * INTO flags FROM public.workflow_rollout WHERE singleton;
  IF (NEW.status,NEW.started_at,NEW.resolved_at,NEW.progress_percent,NEW.is_blocked)
    IS DISTINCT FROM (OLD.status,OLD.started_at,OLD.resolved_at,OLD.progress_percent,OLD.is_blocked)
    OR (flags.enabled AND NEW.staff_note IS DISTINCT FROM OLD.staff_note) THEN
    IF flags.paused THEN RAISE EXCEPTION 'Lifecycle writes are paused' USING errcode='P0103'; END IF;
    IF flags.enabled AND coalesce(current_setting('suggfeed.workflow_write',true),'')<>'on' THEN
      RAISE EXCEPTION 'Use a guided workflow action' USING errcode='P0101';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER zz_submissions_guided_projection BEFORE UPDATE OF status,started_at,resolved_at,progress_percent,is_blocked,staff_note
  ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.guard_guided_projection();
CREATE FUNCTION public.guard_guided_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (SELECT enabled OR paused FROM workflow_rollout WHERE singleton) AND
   (NEW.status::text<>'pending' OR NEW.started_at IS NOT NULL OR NEW.resolved_at IS NOT NULL OR NEW.progress_percent IS NOT NULL OR NEW.is_blocked) THEN
   RAISE EXCEPTION 'New submissions must start in review' USING errcode='P0101';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER zz_submissions_guided_insert BEFORE INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.guard_guided_insert();

CREATE FUNCTION public.staff_workflow_snapshot(p_submission_id uuid,p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE context jsonb; snapshot jsonb;
BEGIN
 context:=staff_workflow_context(p_submission_id,p_actor_id);
 SELECT jsonb_build_object('id',id,'status',status,'updated_at',updated_at,'staff_note',staff_note,'assignee_id',assignee_id,
  'priority',priority,'target_date',target_date,'progress_percent',progress_percent,'started_at',started_at,'resolved_at',resolved_at,'is_blocked',is_blocked)
 INTO snapshot FROM staff_submission_queue WHERE id=p_submission_id;
 RETURN jsonb_build_object('submission',snapshot,'workflow',context);
END; $$;
REVOKE ALL ON FUNCTION public.staff_workflow_snapshot(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_workflow_snapshot(uuid,uuid) TO service_role;
CREATE FUNCTION public.repair_work_dates(p_submission_id uuid,p_actor_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,
  p_started_on date,p_completed_on date,p_source text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions%rowtype; payload jsonb; previous public.workflow_requests%rowtype; result jsonb; prior_context text;
  today date:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text='admin') THEN RAISE EXCEPTION 'Administrator access required' USING errcode='42501';END IF;
  IF p_request_id IS NULL OR char_length(coalesce(trim(p_source),'')) NOT BETWEEN 1 AND 2000 OR char_length(coalesce(trim(p_reason),'')) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Provide verification source and reason' USING errcode='22023';END IF;
  SELECT * INTO s FROM public.submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode='P0002';END IF;
  payload:=jsonb_build_object('action','repair','actor',p_actor_id,'id',p_submission_id,'version',p_expected_updated_at,'start',p_started_on,'end',p_completed_on,'source',trim(p_source),'reason',trim(p_reason));
  SELECT * INTO previous FROM public.workflow_requests WHERE request_id=p_request_id;
  IF FOUND THEN IF previous.payload<>payload THEN RAISE EXCEPTION 'Request already used' USING errcode='23505';END IF;RETURN previous.result || jsonb_build_object('replayed',true) || staff_workflow_snapshot(p_submission_id,p_actor_id);END IF;
  IF p_expected_updated_at IS NULL OR s.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Submission changed' USING errcode='40001';END IF;
  IF s.status::text NOT IN ('in_progress','resolved') OR p_started_on IS NULL OR p_started_on<(s.created_at AT TIME ZONE 'Asia/Manila')::date OR p_started_on>today
    OR (s.status::text='resolved' AND (p_completed_on IS NULL OR p_completed_on<p_started_on OR p_completed_on>today))
    OR (s.status::text='in_progress' AND p_completed_on IS NOT NULL) THEN RAISE EXCEPTION 'Invalid verified dates' USING errcode='22023';END IF;
  prior_context:=coalesce(current_setting('suggfeed.workflow_write',true),'');PERFORM set_config('suggfeed.workflow_write','on',true);
  UPDATE public.submissions SET started_at=p_started_on::timestamp AT TIME ZONE 'Asia/Manila',
    resolved_at=CASE WHEN status::text='resolved' THEN p_completed_on::timestamp AT TIME ZONE 'Asia/Manila' ELSE NULL END,
    resolved_at_estimated=false,updated_at=clock_timestamp() WHERE id=p_submission_id;
  PERFORM set_config('suggfeed.workflow_write',prior_context,true);
  INSERT INTO public.work_date_repairs(request_id,submission_id,actor_id,previous_dates,verified_dates,source,reason)
    VALUES(p_request_id,p_submission_id,p_actor_id,jsonb_build_object('start',s.started_at,'completion',s.resolved_at),jsonb_build_object('start',p_started_on,'completion',p_completed_on),trim(p_source),trim(p_reason));
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(p_actor_id,'repair_work_dates','submissions',p_submission_id,jsonb_build_object('request_id',p_request_id));
  result:=jsonb_build_object('success',true,'replayed',false) || staff_workflow_snapshot(p_submission_id,p_actor_id);
  INSERT INTO public.workflow_requests VALUES(p_request_id,p_submission_id,p_actor_id,payload,result,clock_timestamp());
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.repair_work_dates(uuid,uuid,uuid,timestamptz,date,date,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.repair_work_dates(uuid,uuid,uuid,timestamptz,date,date,text,text) TO service_role;

ALTER TABLE public.idea_update_drafts ADD COLUMN submission_id uuid REFERENCES public.submissions(id);
CREATE FUNCTION public.bind_progress_draft(p_actor_id uuid,p_request_id uuid,p_submission_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE draft public.idea_update_drafts%rowtype;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text IN ('admin','moderator','staff')) THEN RAISE EXCEPTION 'Staff access required' USING errcode='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=p_submission_id) THEN RAISE EXCEPTION 'Submission not found' USING errcode='P0002';END IF;
  INSERT INTO public.idea_update_drafts(request_id,actor_id,submission_id) VALUES(p_request_id,p_actor_id,p_submission_id) ON CONFLICT(request_id) DO NOTHING;
  SELECT * INTO draft FROM public.idea_update_drafts WHERE request_id=p_request_id FOR UPDATE;
  IF draft.actor_id IS DISTINCT FROM p_actor_id OR (draft.submission_id IS NOT NULL AND draft.submission_id<>p_submission_id)
    OR EXISTS(SELECT 1 FROM public.idea_updates WHERE request_id=p_request_id) THEN RAISE EXCEPTION 'Draft belongs to another update' USING errcode='42501';END IF;
  UPDATE public.idea_update_drafts SET submission_id=p_submission_id WHERE request_id=p_request_id;
END; $$;
REVOKE ALL ON FUNCTION public.bind_progress_draft(uuid,uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_progress_draft(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.perform_workflow_action(p_submission_id uuid,p_actor_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,
  p_action text,p_body text,p_occurred_on date,p_percent smallint DEFAULT NULL,p_blocked_reason text DEFAULT NULL,p_next_step text DEFAULT NULL,
  p_office_label text DEFAULT 'School administration',p_notify boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions%rowtype; payload jsonb; previous public.workflow_requests%rowtype; result jsonb; context jsonb;
  kind text; prior_context text; write_context text; event_id uuid; new_status public.submission_status;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode='P0002';END IF;
  context:=public.staff_workflow_context(p_submission_id,p_actor_id);
  payload:=jsonb_build_object('id',p_submission_id,'actor',p_actor_id,'version',p_expected_updated_at,'action',p_action,'body',trim(p_body),'date',p_occurred_on,'percent',p_percent,'blocked',p_blocked_reason,'next',p_next_step,'office',p_office_label,'notify',p_notify);
  SELECT * INTO previous FROM public.workflow_requests WHERE request_id=p_request_id;
  IF FOUND THEN IF previous.payload<>payload THEN RAISE EXCEPTION 'Request already used' USING errcode='23505';END IF;RETURN previous.result || jsonb_build_object('replayed',true) || staff_workflow_snapshot(p_submission_id,p_actor_id);END IF;
  IF p_request_id IS NULL OR char_length(coalesce(trim(p_body),'')) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Explain the action' USING errcode='22023';END IF;
  IF (context->>'paused')::boolean THEN RAISE EXCEPTION 'Lifecycle writes are paused' USING errcode='P0103';END IF;
  IF NOT (context->'allowedActions' ? p_action) THEN
    IF jsonb_array_length(context->'issues')>0 THEN RAISE EXCEPTION 'Verified work dates required' USING errcode='P0102';END IF;
    IF p_action IN ('reopen','withdraw') AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor_id AND role::text='admin') THEN RAISE EXCEPTION 'Administrator access required' USING errcode='42501';END IF;
    RAISE EXCEPTION 'Action is not available in this state' USING errcode='P0101';
  END IF;
  IF p_expected_updated_at IS NULL OR s.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Submission changed' USING errcode='40001';END IF;
  IF p_action IN ('approve','decline') THEN
    new_status:=CASE WHEN p_action='approve' THEN 'approved'::public.submission_status ELSE 'rejected'::public.submission_status END;
    write_context:=coalesce(current_setting('suggfeed.workflow_write',true),'');PERFORM set_config('suggfeed.workflow_write','on',true);
    UPDATE public.submissions SET status=new_status,staff_note=trim(p_body),updated_at=clock_timestamp() WHERE id=p_submission_id;
    PERFORM set_config('suggfeed.workflow_write',write_context,true);
    INSERT INTO public.status_history(submission_id,old_status,new_status,changed_by,note) VALUES(p_submission_id,s.status,new_status,p_actor_id,trim(p_body));
    INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata) VALUES(p_actor_id,'workflow_'||p_action,'submissions',p_submission_id,jsonb_build_object('request_id',p_request_id));
    result:=jsonb_build_object('success',true,'replayed',false);
  ELSE
    kind:=CASE p_action WHEN 'start' THEN 'started' WHEN 'pause' THEN 'blocked' WHEN 'resume' THEN 'resumed' WHEN 'complete' THEN 'completed' WHEN 'reopen' THEN 'reopened' WHEN 'withdraw' THEN 'withdrawn' ELSE p_action END;
    prior_context:=coalesce(current_setting('suggfeed.guided_action',true),'');PERFORM set_config('suggfeed.guided_action','on',true);
    result:=public.post_idea_update(p_submission_id,p_actor_id,p_request_id,p_expected_updated_at,kind,p_body,'public',p_percent,p_blocked_reason,p_next_step,p_occurred_on,p_office_label,p_notify);
    PERFORM set_config('suggfeed.guided_action',prior_context,true);
  END IF;
  result:=result || staff_workflow_snapshot(p_submission_id,p_actor_id);
  INSERT INTO public.workflow_requests VALUES(p_request_id,p_submission_id,p_actor_id,payload,result,clock_timestamp());
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.perform_workflow_action(uuid,uuid,uuid,timestamptz,text,text,date,smallint,text,text,text,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.perform_workflow_action(uuid,uuid,uuid,timestamptz,text,text,date,smallint,text,text,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.post_idea_update(
  p_submission_id uuid,p_staff_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,
  p_kind text,p_body text,p_visibility text,p_percent smallint,p_blocked_reason text,
  p_next_step text,p_occurred_on date,p_office_label text DEFAULT 'School administration',p_notify boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions%rowtype; previous_update public.idea_updates%rowtype; event public.idea_updates%rowtype;
  payload jsonb; today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  effective_date date; latest_date date; new_status public.submission_status;
  new_percent smallint; event_time timestamptz; changes_projection boolean; strict_mode boolean; flags public.workflow_rollout%rowtype; prior_write text; draft public.idea_update_drafts%rowtype;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode = '42501';
  END IF;
  IF p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('started','update','milestone','blocked','completed','correction','resumed','reopened','withdrawn')
    OR p_visibility IS NULL OR p_visibility NOT IN ('public','staff')
    OR p_body IS NULL OR char_length(trim(p_body)) NOT BETWEEN 1 AND 600
    OR (p_percent IS NOT NULL AND (p_percent NOT BETWEEN 0 AND 100 OR p_percent % 5 <> 0))
    OR (p_kind = 'completed' AND p_percent IS NOT NULL AND p_percent <> 100)
    OR (p_kind <> 'completed' AND p_percent = 100)
    OR (p_kind = 'blocked' AND (p_blocked_reason IS NULL OR p_blocked_reason NOT IN ('budget','parts','approval','scheduling','other')))
    OR (p_kind <> 'blocked' AND p_blocked_reason IS NOT NULL)
    OR (p_next_step IS NOT NULL AND char_length(p_next_step) > 200)
    OR p_occurred_on IS NULL OR p_occurred_on NOT BETWEEN today - 14 AND today
    OR p_office_label IS NULL OR char_length(trim(p_office_label)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid progress update' USING errcode = '22023';
  END IF;
  SELECT * INTO s FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode = 'P0002'; END IF;
  payload := jsonb_build_object('submission_id',p_submission_id,'staff_id',p_staff_id,
    'updated_at',p_expected_updated_at,'kind',p_kind,'body',trim(p_body),'visibility',p_visibility,
    'percent',p_percent,'blocked_reason',p_blocked_reason,'next_step',nullif(trim(p_next_step),''),
    'occurred_on',p_occurred_on,'office_label',trim(p_office_label),'notify',coalesce(p_notify,false) AND p_visibility = 'public');
  SELECT * INTO previous_update FROM public.idea_updates WHERE request_id = p_request_id;
  IF FOUND THEN
    IF previous_update.request_payload <> payload THEN
      RAISE EXCEPTION 'Request already used' USING errcode = '23505';
    END IF;
    RETURN jsonb_build_object('replayed',true,'update',jsonb_build_object(
      'id',previous_update.id,'kind',previous_update.kind,'body',previous_update.body,'visibility',previous_update.visibility,
      'percent',previous_update.percent,'blocked_reason',previous_update.blocked_reason,'next_step',previous_update.next_step,
      'occurred_on',previous_update.occurred_on,'office_label',previous_update.office_label,'created_at',previous_update.created_at));
  END IF;
  IF p_expected_updated_at IS NULL OR p_expected_updated_at <> s.updated_at THEN
    RAISE EXCEPTION 'Submission changed' USING errcode = '40001';
  END IF;
  IF p_occurred_on < (s.created_at AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Update predates submission' USING errcode = '22023';
  END IF;
  SELECT * INTO flags FROM public.workflow_rollout WHERE singleton;
  strict_mode := flags.enabled OR coalesce(current_setting('suggfeed.guided_action',true),'')='on' OR p_kind IN ('resumed','reopened','withdrawn');
  IF flags.paused THEN RAISE EXCEPTION 'Lifecycle writes are paused' USING errcode='P0103'; END IF;
  IF strict_mode THEN
    IF p_kind IN ('reopened','withdrawn') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_staff_id AND role::text='admin') THEN RAISE EXCEPTION 'Administrator access required' USING errcode='42501';END IF;
    IF p_kind<>'withdrawn' AND ((s.status::text IN ('in_progress','resolved') AND s.started_at IS NULL) OR (s.status::text='resolved' AND s.resolved_at IS NULL)) THEN RAISE EXCEPTION 'Verified work dates required' USING errcode='P0102';END IF;
    IF p_visibility='staff' AND p_kind NOT IN ('update','milestone','correction') THEN RAISE EXCEPTION 'Lifecycle actions require public explanations' USING errcode='P0101';END IF;
    IF p_kind='blocked' AND s.is_blocked THEN RAISE EXCEPTION 'Resume paused work explicitly before pausing again' USING errcode='P0101';END IF;
    IF p_visibility='staff' AND NOT (s.status::text='in_progress' OR (s.status::text='resolved' AND p_kind='correction')) THEN RAISE EXCEPTION 'Work updates require active work; use internal notes otherwise' USING errcode='P0101';END IF;
    IF p_visibility='public' AND NOT (
      (p_kind='started' AND s.status::text='approved') OR
      (p_kind IN ('update','milestone','blocked','completed','correction') AND s.status::text='in_progress') OR
      (p_kind='resumed' AND s.status::text='in_progress' AND s.is_blocked) OR
      (p_kind='reopened' AND s.status::text='resolved') OR
      (p_kind='correction' AND s.status::text='resolved' AND p_percent IS NULL) OR
      (p_kind='withdrawn' AND s.status::text IN ('approved','in_progress','resolved'))
    ) THEN RAISE EXCEPTION 'Use an available guided action' USING errcode='P0101';END IF;
    IF p_kind='completed' THEN
      SELECT * INTO draft FROM public.idea_update_drafts WHERE request_id=p_request_id FOR UPDATE;
      IF NOT FOUND OR draft.actor_id IS DISTINCT FROM p_staff_id OR draft.submission_id IS DISTINCT FROM p_submission_id
        OR NOT EXISTS(SELECT 1 FROM public.idea_update_uploads WHERE request_id=p_request_id AND actor_id=p_staff_id AND state='ready' AND expires_at>clock_timestamp())
        OR EXISTS(SELECT 1 FROM public.idea_update_uploads WHERE request_id=p_request_id AND (actor_id IS DISTINCT FROM p_staff_id OR state='pending' OR (state='ready' AND expires_at<=clock_timestamp())))
      THEN RAISE EXCEPTION 'Completion requires ready evidence for this request' USING errcode='P0104';END IF;
    END IF;
  END IF;
  new_status := s.status; new_percent := CASE WHEN p_kind='reopened' THEN p_percent WHEN p_kind='withdrawn' THEN NULL ELSE s.progress_percent END;
  IF p_visibility = 'public' THEN
    IF s.status::text NOT IN ('approved','in_progress','resolved') THEN
      RAISE EXCEPTION 'Publish the idea before a public update' USING errcode = '22023';
    END IF;
    IF s.status::text = 'resolved' AND (p_kind NOT IN ('update','correction','reopened','withdrawn') OR (p_percent IS NOT NULL AND p_kind<>'reopened')) THEN
      RAISE EXCEPTION 'Explicitly reopen completed ideas' USING errcode = '22023';
    END IF;
    IF p_kind = 'started' AND s.status::text <> 'approved' THEN
      RAISE EXCEPTION 'Work has already started' USING errcode = '22023';
    END IF;
    IF p_kind = 'completed' THEN new_status := 'resolved'; new_percent := 100;
    ELSIF p_kind='reopened' THEN new_status:='in_progress';
    ELSIF p_kind='withdrawn' THEN new_status:='rejected';
    ELSIF p_kind IN ('started','update','milestone') AND s.status::text = 'approved' THEN new_status := 'in_progress';
    END IF;
    IF p_percent IS NOT NULL THEN
      IF s.progress_percent IS NOT NULL AND p_percent < s.progress_percent AND p_kind NOT IN ('correction','reopened') THEN
        RAISE EXCEPTION 'A decrease requires a correction event' USING errcode = '22023';
      END IF;
      new_percent := p_percent;
    END IF;
    changes_projection := new_status IS DISTINCT FROM s.status OR new_percent IS DISTINCT FROM s.progress_percent
      OR p_kind IN ('started','blocked','completed','resumed','reopened','withdrawn') OR (NOT strict_mode AND s.is_blocked AND p_kind IN ('update','milestone','correction'));
    SELECT max(occurred_on) INTO latest_date FROM public.idea_updates
      WHERE submission_id = p_submission_id AND visibility = 'public' AND deleted_at IS NULL;
    effective_date := greatest(latest_date,(s.started_at AT TIME ZONE 'Asia/Manila')::date,(s.resolved_at AT TIME ZONE 'Asia/Manila')::date);
    IF changes_projection AND effective_date IS NOT NULL AND p_occurred_on < effective_date THEN
      RAISE EXCEPTION 'Backdated history cannot overwrite current progress' USING errcode = '22023';
    END IF;
    event_time := CASE WHEN p_occurred_on = today THEN clock_timestamp()
      ELSE p_occurred_on::timestamp AT TIME ZONE 'Asia/Manila' END;
    prior_write:=coalesce(current_setting('suggfeed.workflow_write',true),'');PERFORM set_config('suggfeed.workflow_write','on',true);
    UPDATE public.submissions SET status = new_status,progress_percent = new_percent,
      started_at = CASE WHEN p_kind = 'started' OR (s.status::text = 'approved' AND new_status::text = 'in_progress')
        THEN coalesce(s.started_at,event_time) ELSE s.started_at END,
      is_blocked = CASE WHEN p_kind = 'blocked' THEN true WHEN p_kind IN ('started','completed','resumed','reopened') OR (NOT strict_mode AND p_kind IN ('update','milestone','correction')) THEN false ELSE s.is_blocked END,
      resolved_at = CASE WHEN p_kind = 'completed' THEN event_time WHEN p_kind='reopened' THEN NULL ELSE s.resolved_at END,
      resolved_at_estimated = CASE WHEN p_kind = 'completed' THEN false ELSE s.resolved_at_estimated END,
      staff_note = CASE WHEN p_kind='withdrawn' OR (p_kind='completed' AND NOT strict_mode) THEN trim(p_body) ELSE s.staff_note END,
      updated_at = clock_timestamp()
    WHERE id = p_submission_id;
    IF new_status IS DISTINCT FROM s.status THEN
      INSERT INTO public.status_history(submission_id,old_status,new_status,changed_by,note)
        VALUES(p_submission_id,s.status,new_status,p_staff_id,trim(p_body));
    END IF;
    PERFORM set_config('suggfeed.workflow_write',prior_write,true);
  END IF;
  INSERT INTO public.idea_updates(submission_id,request_id,request_payload,posted_by,kind,body,visibility,
    percent,blocked_reason,next_step,occurred_on,office_label,notify)
  VALUES(p_submission_id,p_request_id,payload,p_staff_id,p_kind,trim(p_body),p_visibility,
    CASE WHEN p_kind = 'completed' THEN 100 ELSE p_percent END,p_blocked_reason,nullif(trim(p_next_step),''),p_occurred_on,trim(p_office_label),coalesce(p_notify,false) AND p_visibility = 'public')
  RETURNING * INTO event;
  INSERT INTO public.audit_log(actor_id,action,target_table,target_id,metadata)
    VALUES(p_staff_id,'post_idea_update','idea_updates',event.id,
      jsonb_build_object('submission_id',p_submission_id,'kind',p_kind,'visibility',p_visibility));
  RETURN jsonb_build_object('replayed',false,'update',jsonb_build_object(
    'id',event.id,'kind',event.kind,'body',event.body,'visibility',event.visibility,'percent',event.percent,
    'blocked_reason',event.blocked_reason,'next_step',event.next_step,'occurred_on',event.occurred_on,
    'office_label',event.office_label,'created_at',event.created_at));
END; $$;
REVOKE ALL ON FUNCTION public.post_idea_update(uuid,uuid,uuid,timestamptz,text,text,text,smallint,text,text,date,text,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_idea_update(uuid,uuid,uuid,timestamptz,text,text,text,smallint,text,text,date,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.notify_idea_followers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.visibility<>'public' OR NOT NEW.notify OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 INSERT INTO public.idea_notifications(user_id,submission_id,update_id,kind,title,office_label)
 SELECT f.user_id,NEW.submission_id,NEW.id,NEW.kind,s.title,NEW.office_label
 FROM public.idea_follows f JOIN public.submissions s ON s.id=f.submission_id
 LEFT JOIN public.notification_preferences p ON p.user_id=f.user_id
 WHERE f.submission_id=NEW.submission_id AND s.status IN ('approved','in_progress','resolved')
 AND (coalesce(p.update_mode,'all')='all' OR NEW.kind IN ('started','milestone','blocked','completed','correction','resumed','reopened','withdrawn'))
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
CREATE OR REPLACE FUNCTION public.community_action(p_actor uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; tid uuid; cid uuid; s public.submissions%rowtype; t public.submissions%rowtype;
 r public.reports%rowtype; c public.idea_clarifications%rowtype; staff boolean; result jsonb; item jsonb; prior_write text; admin_action boolean;
BEGIN
 staff := EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role::text IN ('admin','moderator'));
 IF p_action IN ('request','close','merge','resolve','bulk_assign') AND NOT staff THEN
  RAISE EXCEPTION 'Staff required' USING errcode='42501';
 END IF;
 admin_action := p_action='merge' OR (p_action='resolve' AND p_data->>'resolution'='removed' AND EXISTS(SELECT 1 FROM public.reports WHERE id=(p_data->>'id')::uuid AND submission_id IS NOT NULL));
 IF admin_action THEN
   IF (SELECT enabled FROM public.workflow_rollout WHERE singleton) AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role::text='admin') THEN RAISE EXCEPTION 'Administrator access required to withdraw ideas' USING errcode='42501';END IF;
   prior_write:=coalesce(current_setting('suggfeed.workflow_write',true),'');PERFORM set_config('suggfeed.workflow_write','on',true);
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
   ELSE
    SELECT * INTO s FROM public.submissions WHERE id=r.submission_id FOR UPDATE;
    UPDATE public.submissions SET status='rejected',progress_percent=NULL,is_blocked=false,updated_at=clock_timestamp() WHERE id=r.submission_id;
    IF s.status::text IN ('approved','in_progress','resolved') THEN
     INSERT INTO status_history(submission_id,old_status,new_status,changed_by,note) VALUES(s.id,s.status,'rejected',p_actor,trim(p_data->>'body'));
     INSERT INTO idea_updates(submission_id,posted_by,request_id,request_payload,kind,body,visibility,occurred_on,office_label,notify)
      VALUES(s.id,p_actor,gen_random_uuid(),'{}','withdrawn',trim(p_data->>'body'),'public',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'School administration',true);
    END IF;
   END IF;
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
  UPDATE public.submissions SET status='rejected',progress_percent=NULL,is_blocked=false,updated_at=clock_timestamp() WHERE id=sid;
  INSERT INTO status_history(submission_id,old_status,new_status,changed_by,note) VALUES(sid,s.status,'rejected',p_actor,trim(p_data->>'body'));
  INSERT INTO idea_updates(submission_id,posted_by,request_id,request_payload,kind,body,visibility,occurred_on,office_label,notify)
   VALUES(sid,p_actor,gen_random_uuid(),'{}','withdrawn',trim(p_data->>'body'),'public',(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date,'School administration',true);
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
 IF admin_action THEN PERFORM set_config('suggfeed.workflow_write',prior_write,true);END IF;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.community_action(uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.community_action(uuid,text,jsonb) TO service_role;
-- Public activity dates are actual published events, not votes/private edits.
CREATE FUNCTION public.read_roadmap_activity(p_ids uuid[]) RETURNS TABLE(id uuid,last_public_update timestamptz,outcome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s.id,(SELECT max(created_at) FROM idea_updates u WHERE u.submission_id=s.id AND u.visibility='public' AND u.deleted_at IS NULL),
  (SELECT body FROM idea_updates u WHERE u.submission_id=s.id AND u.visibility='public' AND u.deleted_at IS NULL AND u.kind='completed' ORDER BY created_at DESC,id DESC LIMIT 1)
 FROM submissions s WHERE s.id=ANY(p_ids) AND s.status::text IN ('approved','in_progress','resolved') AND cardinality(p_ids)<=100;
$$;
REVOKE ALL ON FUNCTION public.read_roadmap_activity(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.read_roadmap_activity(uuid[]) TO anon,authenticated,service_role;
COMMIT;
