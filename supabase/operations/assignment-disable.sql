-- Operational rollback: pause automation without deleting ownership or audit data.
BEGIN;
UPDATE public.assignment_settings SET enabled=false;
DROP TRIGGER IF EXISTS z_assignment_incoming ON public.submissions;
DROP TRIGGER IF EXISTS z_assignment_incoming ON public.reports;
DROP TRIGGER IF EXISTS assignment_priority_changed ON public.submission_workflow;
COMMIT;
-- Optional scheduler removal, only where pg_cron is installed:
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='suggfeed-assignment-escalation';
-- Keep the assignment permission guards and append-only audit. Restoring broad
-- moderator access is a separate reviewed access-policy change, not a rollback side effect.
