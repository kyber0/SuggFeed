-- Migration: Feed Performance Indexes
-- Rationale: The public feed query filters by status='approved' and orders by
-- created_at DESC.  Without a composite index Postgres performs a sequential
-- scan + sort on the full submissions table.  These two indexes cover the two
-- most common read paths: (a) the main approved feed, and (b) category-filtered
-- views.

-- Index A: primary feed query (status filter + recency sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_status_created_at
  ON public.submissions (status, created_at DESC);

-- Index B: category-filtered feed queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_category_status
  ON public.submissions (category_id, status);

-- Index C: per-user tracking lookup (used by the "track submission" flow)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_tracking_token
  ON public.submissions (tracking_token)
  WHERE tracking_token IS NOT NULL;
