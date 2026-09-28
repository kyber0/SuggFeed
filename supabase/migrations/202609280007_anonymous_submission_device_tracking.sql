-- Migration: 202609280007_anonymous_submission_device_tracking.sql
-- Adds device_hash to public.submissions so anonymous users can retrieve
-- their submitted ideas from any browser on the same physical device.

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS device_hash text;

-- Fast index for looking up submissions by device hash
CREATE INDEX IF NOT EXISTS submissions_device_hash_idx
  ON public.submissions (device_hash)
  WHERE device_hash IS NOT NULL;
