# School assignment routing

## Scope and permissions

The active app is Express/Eta/TypeScript on desktop and mobile web; Expo remains retired. Suggestions and safety reports share one Postgres allocation engine. Reports and private/urgent safety items are administrator-only. Moderators can read staff detail and act only on individually assigned or active-team items. Public community browsing, submission ownership and private tracking remain separate from staff assignment authority.

Migrations: `supabase/migrations/202610250001_staff_assignment.sql` and `202610250002_urgent_assignment_sla.sql`. The second ensures a safety-urgent suggestion uses urgent SLA timing even before staff set its workflow priority. Apply before deploying this application release. Additive records preserve existing manual ownership; no school data is erased. New teams, mappings, staff eligibility and SLA durations are not seeded. Existing assignments without deadlines remain visible without fabricated timestamps.

## Setup

Open **School administration → Assignment routing**.

1. Teams & availability: enter actual team names, an active admin supervisor, a different admin backup, eligible staff, memberships and optional individual capacity.
2. Rules: choose suggestion or report, category (or all-category fallback), team and priority order. Lower numbers win. Optional category SLA overrides must preserve faster urgent handling. Empty/no-eligible-team warnings require administrative attention.
3. Settings: configure all four priority SLAs, school capacity, polling interval, urgent team and reassignment options. Minutes are elapsed calendar minutes, not business hours. Reminder, supervisor and reassign offsets are measured after the missed acknowledgement/resolution deadline. Urgent timings must be faster than normal. No values are prefilled.
4. Enable a real scheduler (below), then enable automatic routing. Existing unassigned work can be routed from Triage; existing owners are not silently overwritten.

Urgent fallback remains active even while ordinary automation is disabled: eligible urgent-team admin → available supervisor/backup → available active school admin → an active school admin as emergency coverage. Capacity can be exceeded for urgent work and the override is audited. Every active admin receives the generic urgent notice. If there is no active school administrator, no algorithm can invent a human owner; the item remains in visible triage and an error/coverage warning must be acted on. Assignment/notification failure never rejects the original submission. Until real SLA values are configured, fallback ownership has no invented deadlines.

## Engine, concurrency and retries

`assignment_allocate` is called by insert triggers for submissions/reports and by urgency/safety transitions. A per-school transaction advisory lock serializes all assignment writers, manual overrides and escalation, while other schools proceed independently. Live counts include all open suggestion/report assignments. Choose the fewest open, oldest last assignment, then random ties. Ordinary allocations respect availability and capacity. Repeating an assigned item does nothing. Manual overrides require current version and a reason; team ownership is supported, but urgent work requires a named administrator. Old assignment setters/bulk RPCs are blocked so they cannot bypass the audit.

Every assignment has a version and SLA snapshot. Acknowledgement is explicit and current-owner-only. Changing owner resets acknowledgement/deadlines for a new cycle. Existing deadlines/escalation offsets do not change when settings are edited. Availability changes notify supervisors/admins; reassignment occurs only when the school enables it. No job closes items. Group delivery moves remain separate from assignment routing.

## Scheduler and cost

Preferred: enable Supabase Cron/pg_cron, then run `supabase/operations/assignment-scheduler.sql`. It polls every minute; each school controls its actual processing interval. Locks, stored escalation stage and transactionally recorded notifications make overlapping calls idempotent. Batches are bounded; monitor queue delay and cron failures. This uses the existing database, without a new provider or dependency; existing hosting/database quotas still apply.

Fallback: schedule `GET /internal/assignment-escalation` with `Authorization: Bearer <CRON_SECRET>` using an existing scheduler. `CRON_SECRET` must already be at least 32 characters; never put it in a URL. The endpoint is global, service-only and does not accept a school/actor supplied by the caller. Existing daily Vercel schedules are insufficient for minute-scale SLAs; no misleading daily schedule is added. Automatic scheduling is not considered operational until the job is installed and monitored.

Notifications are durable in-app records, surfaced in School updates and the assignment workspace. They contain item type, action and link, never submission/report content or reporter identity. Ordinary notices respect staff assignment preferences; urgent notices always remain on. No new email or push provider is added, no Expo integration is restored, and the existing safety email path continues unchanged. In-app delivery does not prove that a person read a notice; acknowledgement records acceptance.

## Audit, operations and rollback

`assignment_events` is append-only, including actor, old/new ownership, reason, version and timestamp. App roles cannot edit/delete it. Configuration changes are also audited. Item history is visible only to authorized staff; reporting identities are not added to assignment payloads.

`assignment-disable.sql` pauses routing and removes automation triggers without deleting records or weakening the new access restrictions. Re-enable only after operational review by reinstalling the triggers from the migration in a reviewed change. A reviewed down migration is provided at `supabase/rollbacks/202610250001_staff_assignment.sql`: deploy the prior app first; it restores the original RPC gateway and moves assignment tables and metadata to a locked archive schema. It preserves current individual ownership and never erases the audit. This full downgrade restores the previous moderator permission model, so treat it as an explicit access-policy rollback. Archive restoration and migration-history repair require operator review rather than silently overwriting archived records. Roll back application releases together with their schema assumptions.

Open setup items: real teams and active members; category mappings; capacities; all SLA values; urgent supervisor and distinct backup; staff availability; scheduler installation/monitoring; coverage when no school admin is reachable. No secrets need to be pasted into chat.

## Verification

`tests/assignment-db.test.ts` uses disposable PGlite fixtures for routing, availability, capacity, idempotency, urgency, reports, failure recovery, acknowledgement, escalation and ACL/audit checks. `tests/assignment-concurrency.test.ts` uses a separately prepared local Docker PostgreSQL fixture selected by `ASSIGNMENT_TEST_CONTAINER=sf-assignment-postgres`; it deliberately refuses arbitrary container names and never connects to production. It checks ten simultaneous inserts and overlapping jobs. Without that fixture, the concurrency test is explicitly skipped. Run `npm run lint:assignments`, `npm run build` and the focused tests before release. Hosted migration/scheduler installation and browser verification must be reported separately from local results.

### Release verification · October 25, 2026

- Production migrations `202610250001` and `202610250002` applied; the foundation migration’s stored hash matches the checked-in SQL. A focused regression confirms that safety-urgent suggestions use the urgent SLA even when their workflow priority was never set. Zero schools have ordinary routing enabled and no teams, contacts or SLA values were fabricated.
- Supabase `pg_cron` installed; `suggfeed-assignment-escalation` polls every minute and a hosted run completed with status `succeeded`.
- Hosted read-only REST checks confirmed the new private views and the relationship shapes used by the application. No live submissions were created for testing.
- Production build, full TypeScript checking, focused ESLint and template compilation passed.
- 28 focused assignment/API/staff/workflow/safety regressions passed. The final six assignment/API/staff cases passed again after the final refinements. A separate real PostgreSQL test passed for ten concurrent inserts and simultaneous jobs. Migration and archiving rollback passed with both normal and non-superuser migration owners.
- Browser fixtures checked nine views at 320, 375, 768 and 1440 px, including history loading and preservation of a failed reassignment reason: no page overflow or JavaScript errors. Actual iPhone/Android hardware and native Expo were not exercised; Expo is retired.
- Full test run: 363 tests, 325 passed, 37 failed, one explicit local-Postgres-fixture skip. An untouched checkout of the prior commit had the same 37 failing test names; no new full-suite failures were introduced. This is not a claim that the repository-wide suite is green.
