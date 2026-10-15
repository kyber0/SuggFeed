# Shared-school migration ledger

## Stage 1: registry (16 October 2026)

`202610160001_school_registry.sql` is additive and currently **not applied to production**. It creates:

- `schools`: unique normalized school slugs and lifecycle states.
- `school_memberships`: school-specific student/moderator/admin membership and revocation.
- `platform_operators`: separately bootstrapped business operators; nobody is promoted from legacy global roles.
- `school_registry_events`: audit history written atomically with registry operations.
- `school_release_gate`: activation locked by default, inaccessible to ordinary clients and the service role.

New authenticated clients can read only their own registry memberships/schools, or the roster for a school they actively administer. Anonymous clients have no registry access. Mutations are restricted to service-role RPCs and verify the actor's platform or school authority. Callers must supply the actor from a verified session, never a request body. No application route calls these RPCs yet.

`create_pending_school(actor,slug,name)` requires an enabled platform operator. `change_school_status(school,actor,status)` requires an enabled platform operator; activation also requires an active administrator and the locked cutover gate. `change_school_membership(school,actor,user,role,status)` requires an enabled operator or active admin of that same school, serializes membership changes per school, and refuses removal of the last active administrator. Suspended schools do not grant school-admin authority; platform operators retain recovery authority. Closed schools cannot be reopened through these operations.

The service role cannot directly write registry tables, promote platform operators, or unlock activation. Only a controlled migration/database-owner operation can bootstrap an authorized business operator. Document verified identity and approval before that operation; do not select the first or every existing administrator. Registry events intentionally exclude email/message contents. Their retention and export handling must be included in the approved schedule.

## Existing records

The user confirmed that existing SuggFeed records are demo data. Stage 1 does not rename, delete, assign, or otherwise change those records or legacy roles. A later migration will preserve them in one dedicated demo school, after rehearsing complete table mapping. Account contact information may still be real and must remain protected.

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

PGlite is a single-connection local harness: it does not demonstrate hosted Supabase configuration or concurrent transaction contention. Multi-session race tests belong to the staging cutover. No SQL from this stage has been run against the user's production project.

Executed checks: three registry/database scenarios passed, including the existing-workflow compatibility check; test TypeScript compilation passed. Independent SQL review found no material defect. The production deployment workflow is manually dispatched; this change did not dispatch it or apply the migration.
