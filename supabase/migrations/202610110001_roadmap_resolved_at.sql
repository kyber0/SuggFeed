-- Migration: Add resolved_at column for accurate completion dates on the campus roadmap
-- 1. Add column
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- 2. Backfill resolved_at from status_history where ideas reached 'resolved' status
UPDATE public.submissions s
SET resolved_at = h.first_resolved
FROM (
  SELECT submission_id, min(created_at) AS first_resolved
  FROM public.status_history
  WHERE new_status = 'resolved'
  GROUP BY submission_id
) h
WHERE h.submission_id = s.id AND s.status = 'resolved' AND s.resolved_at IS NULL;

-- 3. Fallback for older resolved submissions without status history
UPDATE public.submissions
SET resolved_at = updated_at
WHERE status = 'resolved' AND resolved_at IS NULL;

-- 4. Fast index for completed roadmap ordering
CREATE INDEX IF NOT EXISTS idx_submissions_resolved_at
  ON public.submissions (resolved_at DESC) WHERE status = 'resolved';

-- 5. Update save_staff_review RPC to maintain resolved_at
CREATE OR REPLACE FUNCTION public.save_staff_review(
  p_submission_id uuid, p_staff_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_note text, p_assignee_id uuid, p_priority text, p_target_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.submissions%rowtype; w public.submission_workflow%rowtype;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role::text IN ('admin', 'moderator', 'staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending', 'approved', 'in_progress', 'resolved', 'rejected')
    OR p_priority IS NULL OR p_priority NOT IN ('low', 'normal', 'high', 'urgent')
    OR p_note IS NULL OR char_length(p_note) > 2000 THEN
    RAISE EXCEPTION 'Invalid review' USING errcode = '22023';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_assignee_id AND role::text IN ('admin', 'moderator', 'staff')) THEN
    RAISE EXCEPTION 'Assignee must be staff' USING errcode = '22023';
  END IF;
  SELECT * INTO s FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING errcode = 'P0002'; END IF;
  IF p_expected_updated_at IS NULL OR s.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Review has changed' USING errcode = '40001';
  END IF;
  SELECT * INTO w FROM public.submission_workflow WHERE submission_id = p_submission_id;
  INSERT INTO public.staff_workflow_history (submission_id, actor_id, previous, current) VALUES (
    p_submission_id, p_staff_id,
    jsonb_build_object('status', s.status, 'assignee_id', w.assignee_id, 'priority', coalesce(w.priority, 'normal'), 'target_date', w.target_date, 'response', s.staff_note),
    jsonb_build_object('status', p_status, 'assignee_id', p_assignee_id, 'priority', p_priority, 'target_date', p_target_date, 'response', nullif(trim(p_note), ''))
  );
  INSERT INTO public.submission_workflow (submission_id, assignee_id, priority, target_date)
    VALUES (p_submission_id, p_assignee_id, p_priority, p_target_date)
    ON CONFLICT (submission_id) DO UPDATE SET
      assignee_id = excluded.assignee_id,
      priority = excluded.priority,
      target_date = excluded.target_date,
      updated_at = now();
  UPDATE public.submissions SET
    status = p_status::public.submission_status,
    staff_note = nullif(trim(p_note), ''),
    reviewed_by = p_staff_id,
    reviewed_at = now(),
    resolved_at = CASE WHEN p_status = 'resolved' THEN coalesce(s.resolved_at, now()) ELSE null END,
    updated_at = clock_timestamp()
  WHERE id = p_submission_id;
  IF s.status::text <> p_status THEN
    INSERT INTO public.status_history (submission_id, old_status, new_status, changed_by, note)
      VALUES (p_submission_id, s.status, p_status::public.submission_status, p_staff_id, nullif(trim(p_note), ''));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.save_staff_review(uuid, uuid, timestamptz, text, text, uuid, text, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_staff_review(uuid, uuid, timestamptz, text, text, uuid, text, date) TO service_role;

-- 6. Update moderate_submission RPC to maintain resolved_at
CREATE OR REPLACE FUNCTION public.moderate_submission(
  p_submission_id uuid, p_staff_id uuid, p_status text, p_note text DEFAULT null
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous_status public.submission_status; current_resolved_at timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role::text IN ('admin', 'moderator', 'staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'Invalid status' USING errcode = '22023';
  END IF;
  IF char_length(coalesce(p_note, '')) > 2000 THEN
    RAISE EXCEPTION 'Note too long' USING errcode = '22023';
  END IF;
  SELECT status, resolved_at INTO previous_status, current_resolved_at FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode = 'P0002'; END IF;
  UPDATE public.submissions SET
    status = p_status::public.submission_status,
    staff_note = coalesce(nullif(trim(p_note), ''), staff_note),
    reviewed_by = p_staff_id,
    reviewed_at = now(),
    resolved_at = CASE WHEN p_status = 'resolved' THEN coalesce(current_resolved_at, now()) ELSE null END,
    updated_at = now()
  WHERE id = p_submission_id;
  INSERT INTO public.status_history (submission_id, old_status, new_status, changed_by, note)
    VALUES (p_submission_id, previous_status, p_status::public.submission_status, p_staff_id, nullif(trim(p_note), ''));
END; $$;
REVOKE ALL ON FUNCTION public.moderate_submission(uuid, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_submission(uuid, uuid, text, text) TO service_role;
