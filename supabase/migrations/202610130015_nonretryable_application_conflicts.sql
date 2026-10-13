-- Application conflicts require new input, so retrying the same transaction
-- cannot resolve them. PostgREST's Hasql transaction runner retries SQLSTATE
-- 40001 indefinitely; PT409 instead returns an HTTP conflict immediately.
-- Preserve function bodies, signatures, security settings, ownership and grants.
BEGIN;

DO $migration$
DECLARE
  routine record;
  definition text;
BEGIN
  FOR routine IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        'save_staff_review', 'review_submission_transition',
        'post_idea_update', 'perform_workflow_action',
        'repair_work_dates', 'community_action'
      ])
      AND p.prosrc ~* 'errcode[[:space:]]*=[[:space:]]*''40001'''
  LOOP
    definition := regexp_replace(
      pg_get_functiondef(routine.oid),
      'errcode[[:space:]]*=[[:space:]]*''40001''',
      'errcode = ''PT409''',
      'gi'
    );
    EXECUTE definition;
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
