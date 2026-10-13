BEGIN;
ALTER TABLE public.notification_preferences
 ADD COLUMN digest_paused boolean NOT NULL DEFAULT false,
 ADD COLUMN digest_kinds text[] NOT NULL DEFAULT ARRAY['started','update','milestone','blocked','completed','correction','resumed','reopened','withdrawn'],
 ADD CONSTRAINT digest_kinds_valid CHECK(cardinality(digest_kinds) BETWEEN 1 AND 9 AND array_position(digest_kinds,NULL) IS NULL AND digest_kinds <@ ARRAY['started','update','milestone','blocked','completed','correction','resumed','reopened','withdrawn']::text[]);
CREATE OR REPLACE FUNCTION public.claim_weekly_digests()
RETURNS SETOF public.weekly_digest_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE week date := (date_trunc('week',clock_timestamp() AT TIME ZONE 'Asia/Manila')-interval '7 days')::date;
BEGIN
 DELETE FROM public.weekly_digest_jobs WHERE created_at<now()-interval '90 days';
 UPDATE public.weekly_digest_jobs SET state='uncertain',finished_at=now() WHERE state='processing' AND created_at<now()-interval '15 minutes';
 RETURN QUERY WITH candidates AS (
  SELECT p.user_id FROM public.notification_preferences p
  WHERE p.weekly_digest AND NOT p.digest_paused AND NOT EXISTS(SELECT 1 FROM public.weekly_digest_jobs j WHERE j.user_id=p.user_id AND j.week_start=week)
  ORDER BY p.user_id LIMIT 10
 ), claimed AS (
  INSERT INTO public.weekly_digest_jobs(user_id,week_start) SELECT user_id,week FROM candidates
  ON CONFLICT(user_id,week_start) DO NOTHING RETURNING *
 ) SELECT * FROM claimed;
END $$;
REVOKE ALL ON FUNCTION public.claim_weekly_digests() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_digests() TO service_role;
COMMIT;
