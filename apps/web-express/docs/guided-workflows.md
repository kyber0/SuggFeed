# Guided workflows: staged release runbook

This runbook covers the additive guided-workflow release (migration 010). Local tests are not a production approval. Do not enable enforcement before staging rehearsal and staff acceptance. No database, storage or account mutation is required to inspect this document.

## Preflight (read only)

Verify the linked project ID against the intended staging/production dashboard before running any command. Run `supabase migration list --linked` and compare deployed versions with the repository. The new migration is `202610130010_guided_workflows.sql`; all earlier forward migrations are prerequisites.

Inventory historical records using an operator database connection:

```sql
select id,status,created_at,started_at,resolved_at,resolved_at_estimated
from public.submissions
where (status in ('in_progress','resolved') and started_at is null)
   or (status='resolved' and resolved_at is null)
order by created_at,id;
```

Do not export titles, descriptions, identity or tracking hashes. Assign an administrator to verify dates from a real school source. Never infer dates from status or percentages. Unknown dates stay blocked. Existing completed records do not need retrospective evidence. Private repair sources are stored in `work_date_repairs`, not public history.

## Staging acceptance

1. Use a separate Supabase project and synthetic school data. Rehearse all additive migrations there first.
2. Run Express typecheck, full tests and production build. Test current role revocation, expiry, retries, stale versions, duplicate request IDs, missing dates, wrong-owner/wrong-request/expired/unfinished files and publication failure.
3. Staff approve/decline, start, pause/resume, complete with reviewed evidence, reopen and repair old dates. Moderators cannot withdraw whole public ideas or merge their sources once enforcement is enabled. Verify anonymous tracking and public/private visibility independently.
4. Verify desktop keyboard/focus restoration, tablet/mobile restrictions, dark mode, reduced motion, long titles, empty/error states and cancelled drag actions.
5. Review project backups, migration versions and environment secrets. Record staff sign-off and an operator rollback owner.

## Controlled enforcement

`public.workflow_rollout` is the single database-owned control. The migration creates it with `enabled=false, paused=false`. Application/browser roles cannot modify it. Guided actions themselves validate the strict workflow even before legacy enforcement is enabled. The OFF state only preserves compatibility with old clients during the coordinated rollout; it is not a secure final policy.

After database and all clients are deployed compatibly, an authorized operator may enable `enabled=true` using the database console. Never expose this switch as a web preference. Keep a written release record; the code does not toggle it automatically.

`deploy.yml` now requires manual dispatch from main, successful Express checks and the production environment gate. Configure **required reviewers** on GitHub's `production` environment and branch protection; YAML alone cannot create reviewers. Verify Vercel's Git auto-deploy settings separately: GitHub workflow gates do not prevent independent Vercel auto-deploys. Verify the Vercel deployment command against the intended project before release. The standalone Expo app and its EAS deployment job have been retired.

## Monitoring and rollback

Monitor structured action codes, version conflicts, file-processing failures, blocked-date counts and request latency. Never log public/private draft content, repair references, tracking codes, access tokens or evidence contents. Local PGlite exercises actual SQL but does not prove multi-session concurrency or real Supabase Storage behavior.

On a critical regression, an authorized operator sets `paused=true`, which blocks lifecycle projection writes while retaining reading and private operations. Roll back presentation assets to the previous approved release only. Retain additive schema, audit records and published history. Do not run destructive down migrations or turn off enforcement to restore unrestricted status changes. Rehearse the pause/rollback procedure in staging.

Production migration versions, historical inventory, GitHub approval configuration and staging sign-off have not been verified by local tests.
