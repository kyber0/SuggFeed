-- ============================================================
-- Performance indexes for SuggFeed
-- ============================================================

-- 1. Covering index for "Top Ideas" sort (vote_count DESC)
--    Includes commonly selected columns to avoid heap fetches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_votes_desc
  ON submissions (vote_count DESC, created_at DESC)
  INCLUDE (id, title, status, category_id, report_count);

-- 2. Covering index for category + status filter (common feed query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_category_status
  ON submissions (category_id, status, created_at DESC)
  INCLUDE (id, title, vote_count, report_count);

-- 3. Trigram index for fast ILIKE title/description search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_title_trgm
  ON submissions USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_desc_trgm
  ON submissions USING gin (description gin_trgm_ops);

-- 4. Covering index on comments for per-submission fetch
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_submission_full
  ON comments (submission_id, created_at ASC)
  INCLUDE (id, body, display_name, parent_id, anon_token, is_hidden);

-- 5. Index for fetching child comments by parent_id (replies)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_parent_id
  ON comments (parent_id)
  WHERE parent_id IS NOT NULL;
