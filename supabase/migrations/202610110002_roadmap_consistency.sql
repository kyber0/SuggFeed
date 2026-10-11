-- Forward-only correction of completion provenance and view-specific roadmap data.
-- Apply before deploying code that reads resolved_at_estimated or category counts.
BEGIN;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS resolved_at_estimated boolean NOT NULL DEFAULT false;

-- Only the latest recorded transition can substantiate the current completion
-- cycle. A prior resolution followed by reopening must not be presented as exact.
UPDATE public.submissions s
SET resolved_at = CASE WHEN h.new_status = 'resolved' THEN h.created_at ELSE coalesce(s.updated_at, s.created_at) END,
    resolved_at_estimated = h.new_status IS DISTINCT FROM 'resolved'
FROM (
  SELECT current_submission.id, latest.new_status, latest.created_at
  FROM public.submissions current_submission
  LEFT JOIN LATERAL (
    SELECT new_status, created_at FROM public.status_history
    WHERE submission_id = current_submission.id
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) latest ON true
  WHERE current_submission.status = 'resolved'
) h
WHERE h.id = s.id;

UPDATE public.submissions SET resolved_at = NULL, resolved_at_estimated = false WHERE status <> 'resolved';

-- The database owns date consistency for ALL writers, including older Edge
-- Functions and future progress-update RPCs. Explicit backdated completion dates
-- supplied by a validated RPC are preserved on a new resolution.
CREATE OR REPLACE FUNCTION public.maintain_submission_resolution()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
    NEW.resolved_at_estimated := false;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, clock_timestamp());
    NEW.resolved_at_estimated := false;
  ELSIF OLD.status <> 'resolved' THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, clock_timestamp());
    NEW.resolved_at_estimated := false;
  ELSE
    NEW.resolved_at := coalesce(NEW.resolved_at, OLD.resolved_at, clock_timestamp());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS submissions_maintain_resolution ON public.submissions;
CREATE TRIGGER submissions_maintain_resolution
  BEFORE INSERT OR UPDATE OF status, resolved_at, resolved_at_estimated ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.maintain_submission_resolution();

ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_resolution_consistent;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_resolution_consistent
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)
    AND (NOT resolved_at_estimated OR status = 'resolved'));

CREATE INDEX IF NOT EXISTS idx_submissions_roadmap_category_preview
  ON public.submissions (category_id, status, vote_count DESC, id)
  WHERE status IN ('approved', 'in_progress', 'resolved');

-- Exact aggregates are computed before pagination; SECURITY INVOKER retains RLS.
CREATE OR REPLACE FUNCTION public.roadmap_category_counts(
  p_search text DEFAULT '', p_category text DEFAULT 'all', p_stage text DEFAULT 'all'
) RETURNS TABLE (name text, total bigint, planned bigint, in_progress bigint, completed bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.name, count(*),
    count(*) FILTER (WHERE s.status = 'approved'),
    count(*) FILTER (WHERE s.status = 'in_progress'),
    count(*) FILTER (WHERE s.status = 'resolved')
  FROM public.submissions s JOIN public.categories c ON c.id = s.category_id
  WHERE s.status IN ('approved', 'in_progress', 'resolved')
    AND (p_stage = 'all' OR s.status::text = p_stage)
    AND (p_category = 'all' OR c.name = p_category)
    AND (coalesce(p_search, '') = '' OR s.title ILIKE '%' || p_search || '%'
      OR s.description ILIKE '%' || p_search || '%')
  GROUP BY c.name ORDER BY c.name;
$$;
REVOKE ALL ON FUNCTION public.roadmap_category_counts(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.roadmap_category_counts(text, text, text) TO anon, authenticated, service_role;

-- Keep the established moderation signature, but do not insert impossible
-- same-status history rows. Submission, transition and audit commit together.
CREATE OR REPLACE FUNCTION public.moderate_submission(
  p_submission_id uuid, p_staff_id uuid, p_status text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.submissions%rowtype;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role::text IN ('admin', 'moderator', 'staff')) THEN
    RAISE EXCEPTION 'Staff access required' USING errcode = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending', 'approved', 'rejected', 'in_progress', 'resolved')
    OR char_length(coalesce(p_note, '')) > 2000 THEN
    RAISE EXCEPTION 'Invalid review' USING errcode = '22023';
  END IF;
  SELECT * INTO s FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode = 'P0002'; END IF;
  UPDATE public.submissions SET
    status = p_status::public.submission_status,
    staff_note = coalesce(nullif(trim(p_note), ''), staff_note),
    reviewed_by = p_staff_id, reviewed_at = now(), updated_at = clock_timestamp()
  WHERE id = p_submission_id;
  IF s.status::text <> p_status THEN
    INSERT INTO public.status_history (submission_id, old_status, new_status, changed_by, note)
      VALUES (p_submission_id, s.status, p_status::public.submission_status, p_staff_id, nullif(trim(p_note), ''));
  END IF;
  INSERT INTO public.audit_log (actor_id, action, target_table, target_id, metadata)
    VALUES (p_staff_id, 'review_submission', 'submissions', p_submission_id,
      jsonb_build_object('old_status', s.status, 'new_status', p_status));
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_submission(uuid, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_submission(uuid, uuid, text, text) TO service_role;

-- Older mobile/Edge clients keep their narrower transition policy. Checking the
-- expected state while holding the row lock prevents stale reviews overwriting
-- concurrent staff changes, and removes the former multi-request partial write.
CREATE OR REPLACE FUNCTION public.review_submission_transition(
  p_submission_id uuid, p_staff_id uuid, p_expected_status text, p_status text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_status public.submission_status;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role::text IN ('admin', 'moderator')) THEN
    RAISE EXCEPTION 'Moderator access required' USING errcode = '42501';
  END IF;
  SELECT status INTO current_status FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submission not found' USING errcode = 'P0002'; END IF;
  IF p_expected_status IS NULL OR current_status::text <> p_expected_status THEN
    RAISE EXCEPTION 'Review has changed' USING errcode = '40001';
  END IF;
  IF p_status IS NULL OR NOT (
    (current_status = 'pending' AND p_status IN ('approved', 'rejected', 'in_progress')) OR
    (current_status = 'approved' AND p_status IN ('in_progress', 'resolved', 'rejected')) OR
    (current_status = 'in_progress' AND p_status IN ('resolved', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'That status change is not allowed' USING errcode = '22023';
  END IF;
  PERFORM public.moderate_submission(p_submission_id, p_staff_id, p_status, p_note);
END;
$$;
REVOKE ALL ON FUNCTION public.review_submission_transition(uuid, uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_submission_transition(uuid, uuid, text, text, text) TO service_role;

COMMIT;
