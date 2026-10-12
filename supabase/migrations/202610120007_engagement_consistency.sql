-- Forward fix: migration 202609280002 removed the recount trigger. The roadmap
-- vote RPC and older Edge writers must share one atomic count-maintenance path.
-- Preserve existing/seed totals; do not recount historical rows or overwrite them.
BEGIN;

CREATE OR REPLACE FUNCTION public.maintain_submission_vote_delta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.submissions SET vote_count = vote_count + 1
      WHERE id = NEW.submission_id;
    RETURN NEW;
  END IF;
  UPDATE public.submissions SET vote_count = greatest(0, vote_count - 1)
    WHERE id = OLD.submission_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.maintain_submission_vote_delta() FROM public, anon, authenticated;

-- Remove the obsolete recount if a legacy deployment still has it, otherwise a
-- single insertion could run two competing count writers.
DROP TRIGGER IF EXISTS votes_refresh_submission_count ON public.votes;
DROP TRIGGER IF EXISTS votes_maintain_submission_delta ON public.votes;
CREATE TRIGGER votes_maintain_submission_delta
  AFTER INSERT OR DELETE ON public.votes FOR EACH ROW
  EXECUTE FUNCTION public.maintain_submission_vote_delta();

-- The legacy mobile/Edge API supports toggling and device-token identity. Keep
-- that contract, but serialize the identity lookup, insert/delete and result.
-- Browser roles cannot call this service-only function with arbitrary user IDs.
CREATE OR REPLACE FUNCTION public.set_idea_vote(
  p_submission_id uuid, p_user_id uuid, p_anon_token text,
  p_device_hash text, p_ip_hash text, p_action text DEFAULT 'toggle'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_status public.submission_status; already_voted boolean; voted boolean; current_count integer;
BEGIN
  IF (p_user_id IS NULL) = (p_anon_token IS NULL)
    OR (p_anon_token IS NOT NULL AND char_length(p_anon_token) NOT BETWEEN 16 AND 128)
    OR (p_device_hash IS NOT NULL AND p_device_hash !~ '^[0-9a-f]{64}$')
    OR (p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$')
    OR p_action IS NULL OR p_action NOT IN ('vote', 'unvote', 'toggle') THEN
    RAISE EXCEPTION 'Invalid voter' USING errcode = '22023';
  END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Sign in required' USING errcode = '42501';
  END IF;
  SELECT status INTO current_status FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR current_status NOT IN ('approved', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'Submission not found or not public' USING errcode = 'P0002';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.votes WHERE submission_id = p_submission_id AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id) OR
      (p_user_id IS NULL AND user_id IS NULL AND (anon_token = p_anon_token OR
        (p_device_hash IS NOT NULL AND device_hash = p_device_hash)))
    )
  ) INTO already_voted;

  IF p_action = 'unvote' OR (p_action = 'toggle' AND already_voted) THEN
    DELETE FROM public.votes WHERE submission_id = p_submission_id AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id) OR
      (p_user_id IS NULL AND user_id IS NULL AND (anon_token = p_anon_token OR
        (p_device_hash IS NOT NULL AND device_hash = p_device_hash)))
    );
    voted := false;
  ELSE
    INSERT INTO public.votes(submission_id, user_id, anon_token, device_hash, ip_hash)
      VALUES (p_submission_id, p_user_id, p_anon_token, p_device_hash, p_ip_hash)
      ON CONFLICT DO NOTHING;
    voted := true;
  END IF;
  SELECT vote_count INTO current_count FROM public.submissions WHERE id = p_submission_id;
  RETURN jsonb_build_object('vote_count', current_count, 'voted', voted, 'already_voted', already_voted);
END;
$$;
REVOKE ALL ON FUNCTION public.set_idea_vote(uuid, uuid, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_idea_vote(uuid, uuid, text, text, text, text) TO service_role;

COMMIT;
