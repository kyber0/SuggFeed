-- Add comment_count column to submissions table for high-performance feed list queries
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- Backfill comment_count for all existing submissions
UPDATE public.submissions s
SET comment_count = (
  SELECT count(*)
  FROM public.comments c
  WHERE c.submission_id = s.id
);

-- Index for comment_count
CREATE INDEX IF NOT EXISTS idx_submissions_comment_count ON public.submissions (comment_count DESC);

-- Automatic trigger function to keep comment_count perfectly in sync
CREATE OR REPLACE FUNCTION public.update_submission_comment_count()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.submissions
    SET comment_count = comment_count + 1
    WHERE id = NEW.submission_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.submissions
    SET comment_count = greatest(0, comment_count - 1)
    WHERE id = OLD.submission_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_comment_count ON public.comments;
CREATE TRIGGER trigger_update_comment_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_submission_comment_count();
