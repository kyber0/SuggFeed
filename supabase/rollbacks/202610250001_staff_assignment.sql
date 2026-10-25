-- Deploy the prior application release before this reviewed downgrade.
-- Ownership in submission_workflow.assignee_id is preserved. New metadata and
-- the immutable audit are archived instead of being destroyed.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE SCHEMA assignment_archive_20261025;
REVOKE ALL ON SCHEMA assignment_archive_20261025 FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='suggfeed-assignment-escalation'$q$;END IF;
END $$;
UPDATE public.assignment_settings SET enabled=false;
DROP TRIGGER IF EXISTS z_assignment_incoming ON public.submissions;
DROP TRIGGER IF EXISTS z_assignment_incoming ON public.reports;
DROP TRIGGER IF EXISTS assignment_priority_changed ON public.submission_workflow;
DROP TRIGGER IF EXISTS assignment_legacy_guard ON public.submission_workflow;
DROP POLICY IF EXISTS assigned_staff_submission ON public.submissions;
DROP POLICY IF EXISTS assigned_staff_upload ON public.idea_update_uploads;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['submission_workflow','staff_internal_notes','staff_workflow_history','idea_clarifications','idea_updates','idea_update_drafts','work_date_repairs'] LOOP EXECUTE format('DROP POLICY IF EXISTS assigned_staff_private ON public.%I',t);END LOOP;
END $$;
DROP VIEW public.staff_assigned_submissions,public.staff_assignment_queue,public.staff_assignment_stale,public.staff_assignment_notes,public.staff_assignment_history,public.staff_assignment_clarifications,public.assignment_records;
CREATE TABLE assignment_archive_20261025.suggestion_assignments AS SELECT school_id,submission_id,assignee_id,assignment_team_id,assigned_at,assignment_reason,acknowledged_at,ack_due_at,due_at,assignment_version,escalation_stage,next_action_at,assignment_sla FROM public.submission_workflow;
REVOKE ALL ON assignment_archive_20261025.suggestion_assignments FROM PUBLIC,anon,authenticated,service_role,tenant_executor;
ALTER TABLE public.submission_workflow DROP COLUMN assignment_team_id,DROP COLUMN assigned_at,DROP COLUMN assignment_reason,DROP COLUMN acknowledged_at,DROP COLUMN ack_due_at,DROP COLUMN due_at,DROP COLUMN assignment_version,DROP COLUMN escalation_stage,DROP COLUMN next_action_at,DROP COLUMN assignment_sla;
DROP FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb);
ALTER FUNCTION public.tenant_rpc_before_assignment(uuid,uuid,text,jsonb) RENAME TO tenant_rpc;
GRANT EXECUTE ON FUNCTION public.tenant_rpc(uuid,uuid,text,jsonb) TO service_role;
DO $$ DECLARE f record;t text;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'assignment_%' LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE',f.signature);END LOOP;
 FOREACH t IN ARRAY ARRAY['assignment_settings','assignment_teams','assignment_assignees','assignment_team_members','assignment_rules','report_assignments','assignment_events','assignment_notifications'] LOOP EXECUTE format('ALTER TABLE public.%I SET SCHEMA assignment_archive_20261025',t);END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
