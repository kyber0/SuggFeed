-- Text-only, immutable school progress events. No browser access to the base table.
-- Deploy after 202610110002_roadmap_consistency.sql. Uploads/notifications are additive later phases.
BEGIN;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS progress_percent smallint;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_progress_percent_bounds
  CHECK (progress_percent IS NULL OR (progress_percent BETWEEN 0 AND 100 AND progress_percent % 5 = 0));
UPDATE public.submissions SET progress_percent = 100, is_blocked = false WHERE status = 'resolved';
ALTER TABLE public.submissions ADD CONSTRAINT submissions_progress_matches_status CHECK (
  (status = 'resolved' AND progress_percent = 100) OR
  (status <> 'resolved' AND (progress_percent IS NULL OR progress_percent < 100))
);
-- Existing in-progress work remains unknown, not an invented percentage or start date.

CREATE TABLE public.idea_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  request_payload jsonb NOT NULL,
  posted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('started','update','milestone','blocked','completed','correction')),
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 600),
  visibility text NOT NULL CHECK (visibility IN ('public','staff')),
  notify boolean NOT NULL DEFAULT false,
  percent smallint CHECK (percent IS NULL OR (percent BETWEEN 0 AND 100 AND percent % 5 = 0)),
  blocked_reason text CHECK (blocked_reason IN ('budget','parts','approval','scheduling','other')),
  next_step text CHECK (next_step IS NULL OR char_length(next_step) <= 200),
  occurred_on date NOT NULL,
  office_label text NOT NULL CHECK (char_length(trim(office_label)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  CHECK ((kind = 'blocked' AND blocked_reason IS NOT NULL) OR (kind <> 'blocked' AND blocked_reason IS NULL))
);
CREATE INDEX idea_updates_staff_history_idx ON public.idea_updates(submission_id, occurred_on DESC, created_at DESC, id DESC);
CREATE INDEX idea_updates_public_history_idx ON public.idea_updates(submission_id, occurred_on DESC, created_at DESC, id DESC)
  WHERE visibility = 'public' AND deleted_at IS NULL;
ALTER TABLE public.idea_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idea_updates FROM public, anon, authenticated;
GRANT SELECT ON public.idea_updates TO service_role;
-- Immutable correction events replace edits/deletes. Database-owned RPC performs insertion.

CREATE OR REPLACE FUNCTION public.maintain_progress_projection()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'resolved' THEN
    NEW.progress_percent := 100;
    NEW.is_blocked := false;
  ELSIF TG_OP = 'UPDATE' AND OLD.status::text = 'resolved' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.progress_percent := NULL;
    NEW.started_at := NULL;
    NEW.is_blocked := false;
  ELSIF NEW.status::text NOT IN ('approved','in_progress') THEN
    NEW.progress_percent := NULL;
    NEW.started_at := NULL;
    NEW.is_blocked := false;
  ELSIF TG_OP = 'UPDATE' AND NEW.status::text = 'approved' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.progress_percent := NULL;
    NEW.started_at := NULL;
    NEW.is_blocked := false;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER submissions_maintain_progress_projection
BEFORE INSERT OR UPDATE OF status, progress_percent, started_at, is_blocked ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.maintain_progress_projection();

-- Narrow anonymous read: no user IDs, author identity, request payloads, or private events.
CREATE FUNCTION public.read_public_idea_updates(p_submission_id uuid)
RETURNS TABLE(id uuid, kind text, body text, percent smallint, blocked_reason text,
  next_step text, occurred_on date, office_label text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id,u.kind,u.body,u.percent,u.blocked_reason,u.next_step,u.occurred_on,u.office_label,u.created_at
  FROM public.idea_updates u JOIN public.submissions s ON s.id = u.submission_id
  WHERE u.submission_id = p_submission_id AND u.visibility = 'public' AND u.deleted_at IS NULL
    AND s.status::text IN ('approved','in_progress','resolved')
  ORDER BY u.occurred_on DESC,u.created_at DESC,u.id DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.read_public_idea_updates(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.read_public_idea_updates(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION public.post_idea_update(
  p_submission_id uuid,p_staff_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,
  p_kind text,p_body text,p_visibility text,p_percent smallint,p_blocked_reason text,
  p_next_step text,p_occurred_on date,p_office_label text DEFAULT 'School administration',p_notify boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions%rowtype; previous_update public.idea_updates%rowtype; event public.idea_updates%rowtype;
  payload jsonb; today date := (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
  effective_date date; latest_date date; new_status public.submission_status;
  new_percent smallint; event_time timestamptz; changes_projection boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role::text IN ('admin','moderator','staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode = '42501';
  END IF;
  IF p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('started','update','milestone','blocked','completed','correction')
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
  new_status := s.status; new_percent := s.progress_percent;
  IF p_visibility = 'public' THEN
    IF s.status::text NOT IN ('approved','in_progress','resolved') THEN
      RAISE EXCEPTION 'Publish the idea before a public update' USING errcode = '22023';
    END IF;
    IF s.status::text = 'resolved' AND (p_kind NOT IN ('update','correction') OR p_percent IS NOT NULL) THEN
      RAISE EXCEPTION 'Explicitly reopen completed ideas' USING errcode = '22023';
    END IF;
    IF p_kind = 'started' AND s.status::text <> 'approved' THEN
      RAISE EXCEPTION 'Work has already started' USING errcode = '22023';
    END IF;
    IF p_kind = 'completed' THEN new_status := 'resolved'; new_percent := 100;
    ELSIF p_kind IN ('started','update','milestone') AND s.status::text = 'approved' THEN new_status := 'in_progress';
    END IF;
    IF p_percent IS NOT NULL THEN
      IF s.progress_percent IS NOT NULL AND p_percent < s.progress_percent AND p_kind <> 'correction' THEN
        RAISE EXCEPTION 'A decrease requires a correction event' USING errcode = '22023';
      END IF;
      new_percent := p_percent;
    END IF;
    changes_projection := new_status IS DISTINCT FROM s.status OR new_percent IS DISTINCT FROM s.progress_percent
      OR p_kind IN ('started','blocked','completed') OR (s.is_blocked AND p_kind IN ('update','milestone','correction'));
    SELECT max(occurred_on) INTO latest_date FROM public.idea_updates
      WHERE submission_id = p_submission_id AND visibility = 'public' AND deleted_at IS NULL;
    effective_date := greatest(latest_date,(s.started_at AT TIME ZONE 'Asia/Manila')::date,(s.resolved_at AT TIME ZONE 'Asia/Manila')::date);
    IF changes_projection AND effective_date IS NOT NULL AND p_occurred_on < effective_date THEN
      RAISE EXCEPTION 'Backdated history cannot overwrite current progress' USING errcode = '22023';
    END IF;
    event_time := CASE WHEN p_occurred_on = today THEN clock_timestamp()
      ELSE p_occurred_on::timestamp AT TIME ZONE 'Asia/Manila' END;
    UPDATE public.submissions SET status = new_status,progress_percent = new_percent,
      started_at = CASE WHEN p_kind = 'started' OR (s.status::text = 'approved' AND new_status::text = 'in_progress')
        THEN coalesce(s.started_at,event_time) ELSE s.started_at END,
      is_blocked = CASE WHEN p_kind = 'blocked' THEN true WHEN p_kind IN ('started','update','milestone','completed','correction') THEN false ELSE s.is_blocked END,
      resolved_at = CASE WHEN p_kind = 'completed' THEN event_time ELSE s.resolved_at END,
      resolved_at_estimated = CASE WHEN p_kind = 'completed' THEN false ELSE s.resolved_at_estimated END,
      staff_note = CASE WHEN p_kind = 'completed' THEN trim(p_body) ELSE s.staff_note END,
      updated_at = clock_timestamp()
    WHERE id = p_submission_id;
    IF new_status IS DISTINCT FROM s.status THEN
      INSERT INTO public.status_history(submission_id,old_status,new_status,changed_by,note)
        VALUES(p_submission_id,s.status,new_status,p_staff_id,trim(p_body));
    END IF;
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

-- Append progress fields to the existing server-only queue without reordering its columns.
CREATE OR REPLACE VIEW public.staff_submission_queue AS
SELECT s.id,s.title,s.description,s.status,s.vote_count,s.comment_count,
  s.created_at,s.updated_at,s.staff_note,jsonb_build_object('name',c.name) AS categories,
  w.assignee_id,coalesce(w.priority,'normal') AS priority,w.target_date,a.display_name AS assignee_name,
  s.progress_percent,s.started_at,s.is_blocked,s.resolved_at
FROM public.submissions s JOIN public.categories c ON c.id=s.category_id
LEFT JOIN public.submission_workflow w ON w.submission_id=s.id
LEFT JOIN public.profiles a ON a.id=w.assignee_id;
REVOKE ALL ON public.staff_submission_queue FROM public,anon,authenticated;
GRANT SELECT ON public.staff_submission_queue TO service_role;
COMMIT;
