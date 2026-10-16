# Shared-school migration ledger

## Stage 1: registry (16 October 2026)

`202610160001_school_registry.sql` was additive at Stage 1; it is **now applied to production with migrations 002–004**. It creates:

- `schools`: unique normalized school slugs and lifecycle states.
- `school_memberships`: school-specific student/moderator/admin membership and revocation.
- `platform_operators`: separately bootstrapped business operators; nobody is promoted from legacy global roles.
- `school_registry_events`: audit history written atomically with registry operations.
- `school_release_gate`: activation locked by default, inaccessible to ordinary clients and the service role.

New authenticated clients can read only their own registry memberships/schools, or the roster for a school they actively administer. Anonymous clients have no registry access. Mutations are restricted to service-role RPCs and verify the actor's platform or school authority. Callers must supply the actor from a verified session, never a request body. The staged Express school directory and operator/settings routes now call these RPCs using freshly verified identity and separate scoped permissions.

`create_pending_school(actor,slug,name)` requires an enabled platform operator. `change_school_status(school,actor,status)` requires an enabled platform operator; activation also requires an active administrator and the locked cutover gate. `change_school_membership(school,actor,user,role,status)` requires an enabled operator or active admin of that same school, serializes membership changes per school, and refuses removal of the last active administrator. Suspended schools do not grant school-admin authority; platform operators retain recovery authority. Closed schools cannot be reopened through these operations.

The service role cannot directly write registry tables, promote platform operators, or unlock activation. Only a controlled migration/database-owner operation can bootstrap an authorized business operator. Document verified identity and approval before that operation; do not select the first or every existing administrator. Registry events intentionally exclude email/message contents. Their retention and export handling must be included in the approved schedule.

## Existing records

The user confirmed that existing SuggFeed records are demo data. Stage 1 does not rename, delete, assign, or otherwise change those records or legacy roles. Staged migration 002 preserves them in one dedicated demo school; a full hosted-snapshot local rehearsal has validated the table mapping. Account contact information may still be real and must remain protected.

## Activation prerequisites

Do **not** manually set `school_release_gate.isolation_verified` to true as a shortcut. A future reviewed cutover must first:

1. Add and validate school ownership, composite foreign keys, grants and RLS for every school-owned table/view/function.
2. Remove legacy global authorization paths and unscoped RPC signatures; integrate trusted school context in every active web/mobile/Edge client.
3. Scope caches, browser state, files, notification jobs, retention and audit events.
4. Implement verified school applications, invitations, approved notices/policies and onboarding controls.
5. Rehearse A/B-school authorization, revoked roles, suspended schools, old clients, storage and backup/restore with synthetic records.
6. Record business/school approvals, reviewed migration commit and tested recovery strategy.

After multiple schools are enabled, rolling back to legacy code/global permissions is unsafe. Prefer maintenance mode and a forward fix; a rollback must preserve tenant constraints and authorization.

## Verification and limits

The real registry SQL is exercised in local in-memory PostgreSQL with two schools. Checks cover privilege grants, global-role non-inheritance, activation lock, cross-school mutation/roster denial, revoked/suspended authority, last-admin protection and audit events. A separate check applies it after the existing workflow fixture and compares demo submissions/profiles before and after.

PGlite is a single-connection local harness: it does not demonstrate hosted Supabase configuration or concurrent transaction contention. Multi-session race tests belong to the staging cutover. The original stage was local-only; the current cutover record below supersedes that deployment status.

Executed checks: three registry/database scenarios passed, including the existing-workflow compatibility check; test TypeScript compilation passed. Independent SQL review found no material defect. The production deployment workflow is manually dispatched; this change did not dispatch it or apply the migration.


## Current cutover evidence — 16 October 2026

### Completed locally

- Migrations `202610160001` through `202610160004`: registry, isolation of 30 business tables, onboarding/policies/invitations, and shared request budgets.
- All business readers/writers require explicit school context; global identity and platform operations are separate. Private browser state, caches, jobs and new evidence paths are scoped. Legacy Edge handlers and Next entrypoints retire with 410.
- Staff and platform operator access requires provider-verified AAL2; `/account/security` provides explicit TOTP enrollment and challenge. No real authenticator was enrolled by this task.
- Independent review defects fixed: private feed totals no longer use public CDN caching; bookmark/share conflict indexes match tenant keys; tracking uses only a scoped hashed capability with safe public projection.
- Protected repeatable-read hosted snapshot: 32 source tables, **159,473 rows**, captured `2026-10-16T11:04:55.640528Z`. Restricted backup schema `private_release_backup_20261016` is database-owner-only; source rows were preserved.
- Independently encrypted export: 113 authenticated compressed frames, 9,377,950 bytes; SHA256 `7792cd0a61fbae01820eb67ac94de06278bb3838f7d504e80a4474d9f7b159b7`. Local file `/tmp/suggfeed-precutover-20261016.enc` must be moved to an approved durable restricted backup destination before treating it as long-term recovery coverage. Never commit it. Its recovery key depends on the existing session secret; retain that secret securely.
- Full export restored into disposable local PostgreSQL/PGlite, all existing constraints validated, all four staged migrations applied successfully. Preserved 10,004 submissions and 149,380 comments; no operator auto-grants and activation gate stayed false. This tests database recovery only, not hosted Auth/Storage restoration or multi-session races.

### Live work still required

The initial direct Node connection failed DNS because this environment requires its outbound proxy. Using the supported `NODE_USE_ENV_PROXY=1` and system CA settings restored management API connectivity. The CLI could not accept the securely injected token format locally; the documented Supabase Management API deployed the same repository handlers directly. No token was exposed.

**Live cutover completed:** all four migrations committed together and were recorded in migration history. Preserved 10,004 submissions and 149,380 comments. Only the exact verified requested account was bootstrapped as platform operator; one operator exists. An owner-only audit record in the restricted backup schema records execution, operator UUID, migration version and backup checksum. `isolation_verified=false`; no school was activated. All ten retired Edge deployments were deployed and live-checked with malformed/forged requests: every handler returned its expected 410 retirement code. Both `submission-attachments` and `idea-update-evidence` buckets were confirmed private. Source function definitions had not drifted since the successfully rehearsed snapshot.

The Express build must deploy with these migrations. Follow the remaining acceptance and activation checklist below; completed technical steps do not supply legal/institutional approval.

1. Completed: management connectivity, source function drift/counts and private bucket checks. Pre-cutover database size was 154,659,987 bytes. Repeat drift/backup checks before any further schema change.
2. Confirm off-project durable backup and recovery access. The provider reported no managed backups and PITR disabled; do not equate the protected same-database copy with independent disaster recovery.
3. Completed: applied the four reviewed new migrations in one controlled transaction and recorded their exact versions in migration history. Do not replay unrelated old migrations merely because historical tracking is incomplete. Leave `school_release_gate.isolation_verified=false`.
4. Completed: bootstrapped only the exact confirmed, verified sign-in account `keanethdaveberido@gmail.com` as platform operator through a controlled owner operation, with an audit record. Do not promote all legacy admins. This is not permission to publish that email in legal notices.
5. Completed: all ten Edge tombstones deployed and verified. Retired Next middleware is included in the app release. Direct grants/RPC checks and hosted object-policy/signed-link checks still need final verification. Keep tenant buckets private.
6. Deploy the matching Express build. Non-destructive checks must verify chooser, account security, health, no-store behavior, old endpoints and inactive/private-school denial. Do not create test accounts, records, messages or load on production.
7. Use two-school synthetic staging for hosted Auth/Storage, concurrency, cache switching, revocation and recovery checks. Record cutover commit, reviewer, outputs, rollback/forward-fix steps and operational owners.
8. Confirm the actual operator’s name and monitored public privacy mailbox; configure notices and approved school policies, institutional authority, contracts, age/retention rules and rights/incident operations before approving any school. CSPC is a prospective adopting school, not the declared service operator. Only after evidence review may the database owner unlock isolation; each school still needs its own reviewed policy and explicit activation.


### Final local validation
Full suite **236 passed, zero failed/skipped**. Complete app build and all TypeScript targets passed. Four HTTP smoke checks passed against the compiled Express app (chooser redirect, unauthenticated security redirect, private legal page/CSP and retired root write). No production test records, enrollment, email or load tests were performed. `check:release` intentionally still exits 1 for unresolved operational/legal gates.
