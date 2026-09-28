-- Migration: Add user-level bookmarks, reports, and shared_posts tables with RLS and report RPCs
-- Date: 2026-09-28
-- Description:
-- 1. Create bookmarks table linked to user_id and submission_id
-- 2. Create shared_posts table linked to user_id and submission_id
-- 3. Create reports table linked to user_id and submission_id / comment_id
-- 4. Enable RLS so users can only view, insert, and delete their own bookmarks and shares
-- 5. Provide secure report_submission and report_comment RPCs enforcing authentication and uniqueness

-- ── 1. Bookmarks ──
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_user_submission_unique UNIQUE (user_id, submission_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS bookmarks_submission_id_idx ON public.bookmarks(submission_id);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can read own bookmarks" ON public.bookmarks
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can insert own bookmarks" ON public.bookmarks
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can delete own bookmarks" ON public.bookmarks
  FOR DELETE USING (user_id = auth.uid());

-- ── 2. Shared Posts ──
CREATE TABLE IF NOT EXISTS public.shared_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_posts_user_submission_unique UNIQUE (user_id, submission_id)
);

CREATE INDEX IF NOT EXISTS shared_posts_user_id_idx ON public.shared_posts(user_id);
CREATE INDEX IF NOT EXISTS shared_posts_submission_id_idx ON public.shared_posts(submission_id);

ALTER TABLE public.shared_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own shared posts" ON public.shared_posts;
CREATE POLICY "Users can read own shared posts" ON public.shared_posts
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own shared posts" ON public.shared_posts;
CREATE POLICY "Users can insert own shared posts" ON public.shared_posts
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own shared posts" ON public.shared_posts;
CREATE POLICY "Users can delete own shared posts" ON public.shared_posts
  FOR DELETE USING (user_id = auth.uid());

-- ── 3. Reports ──
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  reason text DEFAULT 'inappropriate',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_target_check CHECK (
    (submission_id IS NOT NULL AND comment_id IS NULL) OR
    (submission_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reports_user_submission_unique ON public.reports(user_id, submission_id) WHERE submission_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_user_comment_unique ON public.reports(user_id, comment_id) WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_user_id_idx ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS reports_submission_id_idx ON public.reports(submission_id);
CREATE INDEX IF NOT EXISTS reports_comment_id_idx ON public.reports(comment_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own reports" ON public.reports;
CREATE POLICY "Users can read own reports" ON public.reports
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert own reports" ON public.reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can manage reports" ON public.reports;
CREATE POLICY "Staff can manage reports" ON public.reports
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ── 4. RPCs for atomic reporting with auth enforcement ──
CREATE OR REPLACE FUNCTION public.report_submission(target_id uuid, report_reason text DEFAULT 'inappropriate')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_user_id uuid := auth.uid();
  already_reported boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reports WHERE user_id = current_user_id AND submission_id = target_id
  ) INTO already_reported;

  IF already_reported THEN
    RETURN json_build_object('success', false, 'message', 'already_reported');
  END IF;

  INSERT INTO public.reports (user_id, submission_id, reason)
  VALUES (current_user_id, target_id, coalesce(report_reason, 'inappropriate'));

  UPDATE public.submissions
  SET report_count = coalesce(report_count, 0) + 1
  WHERE id = target_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.report_comment(target_id uuid, report_reason text DEFAULT 'inappropriate')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_user_id uuid := auth.uid();
  already_reported boolean;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.reports WHERE user_id = current_user_id AND comment_id = target_id
  ) INTO already_reported;

  IF already_reported THEN
    RETURN json_build_object('success', false, 'message', 'already_reported');
  END IF;

  INSERT INTO public.reports (user_id, comment_id, reason)
  VALUES (current_user_id, target_id, coalesce(report_reason, 'inappropriate'));

  UPDATE public.comments
  SET report_count = coalesce(report_count, 0) + 1
  WHERE id = target_id;

  RETURN json_build_object('success', true);
END;
$$;
