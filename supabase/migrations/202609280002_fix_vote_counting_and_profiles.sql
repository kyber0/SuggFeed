-- Migration: Fix vote counting and public profile display names
-- 1. Drop the vote count override trigger that was recalculating count(*) from public.votes,
--    which wiped initial/seed submission vote counts down to 1 or 0.
DROP TRIGGER IF EXISTS votes_refresh_submission_count ON public.votes;
DROP FUNCTION IF EXISTS public.refresh_submission_vote_count();

-- 2. Allow public to read display names on profiles for submission & comment author attribution
DROP POLICY IF EXISTS "public reads profile display name" ON public.profiles;
CREATE POLICY "public reads profile display name" ON public.profiles FOR SELECT USING (true);
