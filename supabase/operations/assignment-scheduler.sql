-- Run only after the assignment migration, using the Supabase SQL editor.
-- Supabase Cron/pg_cron must be installed. No external HTTP or paid worker is used.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'Enable Supabase Cron (pg_cron) first';END IF;
END $$;
-- One technical polling cadence; each school controls its own check interval.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='suggfeed-assignment-escalation';
SELECT cron.schedule('suggfeed-assignment-escalation','* * * * *','SELECT public.assignment_tick(100)');
