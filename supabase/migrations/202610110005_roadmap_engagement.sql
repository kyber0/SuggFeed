-- In-app follows/notifications first. External delivery is explicitly held until
-- a preference-aware, deduplicating dispatcher is implemented and enabled.
BEGIN;

CREATE TABLE public.idea_follows (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, submission_id)
);
CREATE INDEX idea_follows_submission_idx ON public.idea_follows(submission_id);

CREATE TABLE public.idea_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES public.idea_updates(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('started', 'update', 'milestone', 'blocked', 'completed', 'correction')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  office_label text NOT NULL CHECK (char_length(office_label) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (user_id, update_id)
);
CREATE INDEX idea_notifications_user_page_idx ON public.idea_notifications(user_id, created_at DESC, id DESC);
CREATE INDEX idea_notifications_user_unread_idx ON public.idea_notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE public.idea_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.idea_notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'push')),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'pending', 'processing', 'delivered', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error_code text CHECK (char_length(last_error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);
CREATE INDEX idea_notification_outbox_dispatch_idx ON public.idea_notification_outbox(available_at, id) WHERE state = 'pending';

-- These are server-managed account-private tables, not browser Supabase tables.
-- No client policies or grants; API reads must scope the authenticated session.
ALTER TABLE public.idea_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idea_follows, public.idea_notifications, public.idea_notification_outbox FROM anon, authenticated;
GRANT ALL ON public.idea_follows, public.idea_notifications, public.idea_notification_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.set_idea_follow(p_user_id uuid, p_submission_id uuid, p_following boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_status public.submission_status;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Sign in required' USING errcode = '42501';
  END IF;
  IF p_following IS NULL THEN RAISE EXCEPTION 'Invalid following state' USING errcode = '22023'; END IF;
  SELECT status INTO current_status FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF p_following THEN
    IF NOT FOUND OR current_status NOT IN ('approved', 'in_progress', 'resolved') THEN
      RAISE EXCEPTION 'Idea not found or no longer public' USING errcode = 'P0002';
    END IF;
    INSERT INTO public.idea_follows (user_id, submission_id) VALUES (p_user_id, p_submission_id)
      ON CONFLICT (user_id, submission_id) DO NOTHING;
  ELSE
    -- Unfollowing remains possible if a previously public idea is withdrawn.
    DELETE FROM public.idea_follows WHERE user_id = p_user_id AND submission_id = p_submission_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_idea_follow(uuid, uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_idea_follow(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_idea_notification_read(p_user_id uuid, p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.idea_notifications n SET read_at = coalesce(n.read_at, clock_timestamp())
  FROM public.idea_updates u, public.submissions s
  WHERE n.id = p_notification_id AND n.user_id = p_user_id
    AND u.id = n.update_id AND u.submission_id = n.submission_id
    AND u.visibility = 'public' AND u.deleted_at IS NULL
    AND s.id = n.submission_id AND s.status IN ('approved', 'in_progress', 'resolved');
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_idea_notification_read(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_idea_notification_read(uuid, uuid) TO service_role;

-- Idempotent update IDs already guard progress-post retries. The uniqueness here
-- also protects fanout/recovery retries and prevents duplicate notification rows.
CREATE OR REPLACE FUNCTION public.notify_idea_followers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visibility <> 'public' OR NOT NEW.notify OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.idea_notifications (user_id, submission_id, update_id, kind, title, office_label)
    SELECT f.user_id, NEW.submission_id, NEW.id, NEW.kind, s.title, NEW.office_label
    FROM public.idea_follows f JOIN public.submissions s ON s.id = f.submission_id
    WHERE f.submission_id = NEW.submission_id AND s.status IN ('approved', 'in_progress', 'resolved')
    ON CONFLICT (user_id, update_id) DO NOTHING;

  -- Default follows are in-app only. Future explicit channel opt-ins can queue
  -- held delivery intents, but no email/push service is called from a transaction.
  INSERT INTO public.idea_notification_outbox (notification_id, channel, state)
    SELECT n.id, channel.name, 'held'
    FROM public.idea_notifications n
    JOIN public.idea_follows f ON f.user_id = n.user_id AND f.submission_id = n.submission_id
    CROSS JOIN (VALUES ('email'), ('push')) AS channel(name)
    WHERE n.update_id = NEW.id AND ((channel.name = 'email' AND f.email_enabled) OR (channel.name = 'push' AND f.push_enabled))
    ON CONFLICT (notification_id, channel) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_idea_followers() FROM public, anon, authenticated;
CREATE TRIGGER idea_updates_notify_followers
  AFTER INSERT ON public.idea_updates FOR EACH ROW EXECUTE FUNCTION public.notify_idea_followers();

-- Serializing on the submission makes the vote count returned by this RPC
-- authoritative, rather than a stale read + 1. The existing votes count trigger
-- remains the sole source of count maintenance for inserts/deletes.
CREATE OR REPLACE FUNCTION public.cast_idea_vote(p_submission_id uuid, p_user_id uuid DEFAULT NULL, p_anon_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.submissions%rowtype; inserted integer; current_count integer;
BEGIN
  IF (p_user_id IS NULL) = (p_anon_token IS NULL) OR
    (p_anon_token IS NOT NULL AND (char_length(p_anon_token) < 16 OR char_length(p_anon_token) > 128)) THEN
    RAISE EXCEPTION 'Invalid voter' USING errcode = '22023';
  END IF;
  IF p_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Sign in required' USING errcode = '42501';
  END IF;
  SELECT * INTO s FROM public.submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('approved', 'in_progress', 'resolved') THEN
    RAISE EXCEPTION 'Submission not found or not public' USING errcode = 'P0002';
  END IF;
  INSERT INTO public.votes (submission_id, user_id, anon_token) VALUES (p_submission_id, p_user_id, p_anon_token)
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  SELECT vote_count INTO current_count FROM public.submissions WHERE id = p_submission_id;
  RETURN jsonb_build_object('vote_count', current_count, 'already_voted', inserted = 0);
END;
$$;
REVOKE ALL ON FUNCTION public.cast_idea_vote(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_idea_vote(uuid, uuid, text) TO service_role;

COMMIT;
