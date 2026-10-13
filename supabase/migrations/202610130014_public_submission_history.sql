BEGIN;
-- The public projection deliberately excludes notes, actors, and private states.
CREATE FUNCTION public.read_public_submission_history(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.submissions WHERE id=p_submission_id AND status IN ('approved','in_progress','resolved')) THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(events) ORDER BY events.created_at DESC,events.id DESC),'[]'::jsonb) INTO result FROM (
  SELECT id,created_at,
    CASE WHEN old_status IN ('approved','in_progress','resolved') THEN old_status::text ELSE NULL END AS old_status,
    new_status::text AS new_status
  FROM public.status_history WHERE submission_id=p_submission_id AND new_status IN ('approved','in_progress','resolved')
  ORDER BY created_at DESC,id DESC LIMIT 100
 ) events;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_public_submission_history(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.read_public_submission_history(uuid) TO anon,authenticated,service_role;
COMMIT;
