BEGIN;
CREATE TABLE public.weekly_digest_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 week_start date NOT NULL,
 state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','delivered','empty','cancelled','failed','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(user_id,week_start)
);
ALTER TABLE public.weekly_digest_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weekly_digest_jobs FROM public,anon,authenticated;
GRANT ALL ON public.weekly_digest_jobs TO service_role;
CREATE INDEX weekly_digest_job_age_idx ON public.weekly_digest_jobs(created_at);
-- Claim once, never blindly retry after a network timeout. Providers can accept
-- a message before the worker records success. Reconcile uncertain jobs manually.
CREATE FUNCTION public.claim_weekly_digests()
RETURNS SETOF public.weekly_digest_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE week date := (date_trunc('week',clock_timestamp() AT TIME ZONE 'Asia/Manila')-interval '7 days')::date;
BEGIN
 DELETE FROM public.weekly_digest_jobs WHERE created_at<now()-interval '90 days';
 UPDATE public.weekly_digest_jobs SET state='uncertain',finished_at=now()
 WHERE state='processing' AND created_at<now()-interval '15 minutes';
 RETURN QUERY
 WITH candidates AS (
  SELECT p.user_id FROM public.notification_preferences p
  WHERE p.weekly_digest AND NOT EXISTS(SELECT 1 FROM public.weekly_digest_jobs j WHERE j.user_id=p.user_id AND j.week_start=week)
  ORDER BY p.user_id LIMIT 10
 ), claimed AS (
  INSERT INTO public.weekly_digest_jobs(user_id,week_start) SELECT user_id,week FROM candidates
  ON CONFLICT(user_id,week_start) DO NOTHING RETURNING *
 ) SELECT * FROM claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_weekly_digests() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_digests() TO service_role;
COMMIT;
