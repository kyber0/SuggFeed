-- Add threading and moderation columns to comments
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS report_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_id);
