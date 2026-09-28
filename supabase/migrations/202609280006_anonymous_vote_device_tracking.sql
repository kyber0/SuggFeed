-- Migration: 202609280006_anonymous_vote_device_tracking.sql
-- Adds device_hash and ip_hash to public.votes to prevent infinite voting from the same device when anonymous.
-- Logged-in accounts (where user_id IS NOT NULL) are exempt from this device limit.

ALTER TABLE public.votes ADD COLUMN IF NOT EXISTS device_hash text;
ALTER TABLE public.votes ADD COLUMN IF NOT EXISTS ip_hash text;

-- Unique index ensuring an anonymous device can only vote once per submission.
-- When user_id IS NOT NULL (authenticated user), this constraint is bypassed,
-- so authenticated users vote based on user_id regardless of device.
CREATE UNIQUE INDEX IF NOT EXISTS votes_anonymous_device_unique
  ON public.votes (submission_id, device_hash)
  WHERE user_id IS NULL AND device_hash IS NOT NULL;

-- Fast index for looking up votes by device hash
CREATE INDEX IF NOT EXISTS votes_device_hash_idx
  ON public.votes (device_hash)
  WHERE device_hash IS NOT NULL;

-- Fast index for looking up votes by IP hash
CREATE INDEX IF NOT EXISTS votes_ip_hash_idx
  ON public.votes (ip_hash)
  WHERE ip_hash IS NOT NULL;

-- Allow users to view their own votes if signed in
DROP POLICY IF EXISTS "users can view their own votes" ON public.votes;
CREATE POLICY "users can view their own votes"
  ON public.votes FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);
