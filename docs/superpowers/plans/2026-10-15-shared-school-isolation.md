# Shared School Isolation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. This plan is not an executed migration or proof of isolation.

**Goal:** Permit verified schools to use one shared service without sharing private data or authority.

**Architecture:** A global account may have memberships in multiple schools. Every school-owned record is constrained by school ID, with database RLS and explicit server authorization. Routes use `/s/:schoolSlug`; platform administration is separate from school roles. Unknown/inactive schools fail closed, never falling back to a default school.

**Tech Stack:** Existing Supabase Postgres/Auth/Storage, Express/Eta, TypeScript clients and existing local DB test harness.

**Spec:** `docs/superpowers/specs/2026-10-15-school-release-design.md` and `docs/compliance/school-release-readiness.md`.

## Global constraints
- School signup is disabled until every isolation gate passes. No partial production rollout that exposes tenant data through old routes or clients.
- The owner identifies the existing dataset as demo data. Plan one dedicated demo school, preserve rows and account identities, and rehearse/approve the migration before production execution. Unexpected/unmapped rows remain inaccessible to onboarding schools.
- Philippine launch reference; each institution's jurisdiction, lawful grounds, age rules, public visibility and records duties need approval.
- Keep Supabase authentication global. School admins cannot delete global Auth accounts, change global roles, view unrelated memberships or reset another school's credentials.
- Existing credentials, browser cache entries and global roles are not trusted tenant claims. Platform operator approval cannot be self-granted through school signup.
- Service-role access bypasses RLS: every service-role reader must scope by trusted tenant; mutation RPCs must verify tenant, actor and resource membership atomically.
- Migrations are additive first; legacy destructive retention and unscoped jobs stay disabled during cutover.

## Review focus
- A school A admin supplies school B's resource ID, assignee, upload path or cursor: denied without revealing B's private data.
- A revoked user reuses a stale session/JWT, browser tab, invite or saved upload URL: no new authorized action; signed URL expiry is bounded and documented.
- Two schools share category labels, account IDs or cache parameters: results/jobs/notifications remain isolated.
- Old apps, RPC signatures, direct REST calls and global profiles.role bypass the web UI: denied for private data.
- Backfill has unmapped records, mixed data or conflicting identities: stop, report counts, never guess ownership or delete evidence.

## Task 1: School lifecycle and migration mapping (prerequisite)
**Files:** new versioned migration under `supabase/migrations`, `docs/compliance/tenant-cutover.md`, local migration tests under `apps/web-express/tests`.
- [ ] Record the confirmed demo mapping, category sharing, service clients, migrations and deployed Edge Functions. Produce dry-run row counts without exporting contents.
- [ ] Create `schools(id uuid, slug text unique, name text, status text)`; statuses `pending`, `active`, `suspended`, `closed`. Store versioned school notice, contact, eligibility/publication policy and approvals in a restricted school settings record.
- [ ] Create `school_memberships(school_id,user_id,role,status)` with composite key; roles `student`, `moderator`, `admin`; only active memberships confer access. Platform operators use a separate restricted role table, not user metadata.
- [ ] Create server-only, expiring, hashed, single-use school invitation records; accepting an invitation must verify the intended account/email and school. Do not auto-grant admin based only on an email suffix.
- [ ] Add controlled school application/approval lifecycle. Public signup creates only a pending application after verified email and abuse checks. Platform staff verify institutional authority, contact, agreements and required policies before activation. Log approval/rejection with minimal private data.
- [ ] Test duplicate slugs, replayed/expired invites, unauthorized activation, self-assigned roles and last-admin protection. Test membership in A grants no authority in B.

## Task 2: Complete database isolation
**Files:** staged SQL migrations; all policies/views/RPCs referenced below; `tests/tenant-isolation-db.test.ts` using the existing local database harness.
- [ ] Inventory current schema, views, triggers and functions after all migrations, not just the initial schema. Add `school_id` to school-owned root and child records; populate only through the reviewed mapping. Validate counts and non-null constraints after backfill.
- [ ] Roots include categories, submissions, staff_saved_views, student_saved_searches, audit_log, retention_settings and per-school notification preferences. Replace singleton school settings with per-school keys. Decide whether workflow rollout is platform-only or per-school explicitly.
- [ ] Child tables include status_history, attachments, votes, comments, bookmarks, shared_posts, reports, submission_workflow, staff_internal_notes, staff_workflow_history, idea_updates, idea_update_drafts, idea_update_uploads, idea_follows, idea_notifications, idea_notification_outbox, idea_clarifications, idea_merges, weekly_digest_jobs, workflow_requests, work_date_repairs and submission_receipts. Composite foreign keys `(school_id, parent_id)` enforce same-school ancestry, including merge source/target and report submission/comment.
- [ ] Rebuild unique constraints and indexes with school scope where required: categories slug, saved-search names, notification/digest deduplication, receipt/idempotency scope, preferences. Index common `(school_id,status,created_at,id)` access paths; measure plans with synthetic representative data.
- [ ] Replace global `is_admin`/`is_staff` authorization with membership predicates that check the supplied school's active status and `auth.uid()`. Lock function search_path and grants; test recursion and revoked membership. Views must preserve RLS/security invoker behavior where supported.
- [ ] Explicit public policy: only active-school, approved public records/columns may be read without membership. Public status is deliberate disclosure, not permission to read private author identifiers, reports, voters or internal notes. Private-first school settings must not be bypassable through anon REST.
- [ ] Replace all security-definer mutators with tenant-aware signatures. For service-role-only RPCs verify passed actor is active member of the same school; derive/validate resource school internally. Revoke obsolete function signatures so old clients cannot bypass tenant checks.
- [ ] Global profiles expose only permitted self information; school directory uses membership-scoped projection. Global web_sessions remain per-user with no staff authority accepted from cached active-school selection.
- [ ] Adversarial matrix: anon/student/moderator/admin/platform operator across schools A and B; direct REST/RPC/storage access, mismatched parent IDs, inactive schools, removed memberships and mixed-school batches. Assert both returned data and absence of side effects. Do not test on production.

## Task 3: Express tenant context, routes and all readers/writers
**Files:** new `src/lib/school-context.ts`; `src/types/index.ts`; `src/server.ts`; `src/lib/identity.ts`; all `src/routes/*.ts` and tenant-owning `src/lib/*.ts`.
**Interface:** `SchoolContext { id: string; slug: string; status: 'active'; membership: { role: 'student'|'moderator'|'admin' } | null }`. Resolve from route slug using database records; attach to request only after validation. Public school reads permit null membership only under publication policy. Protected school routes require active membership; never accept role or school ownership from request body.
- [ ] Establish `/s/:schoolSlug` community routes and `/s/:schoolSlug/admin` staff routes; platform `/platform` uses separate authorization. Unknown/suspended school gives a safe response. Canonical origin is configured, never derived from untrusted Host for emailed links.
- [ ] Replace global role checks, `profiles.role` updates, roster search and staff invites with scoped membership operations. Prevent tenant admins from modifying platform operators/global identities.
- [ ] Require explicit school context for data/feed/roadmap/profile/community/engagement/evidence/workflow/staff/digest operations. Add `.eq('school_id',school.id)` to service queries and tenant parameters to mutators; validate affected-row counts and resource ownership.
- [ ] Profile activity, settings, reports and notifications show only active school's records; account security is global and labeled. School departure removes membership, not another school's account records.
- [ ] Include school ID in all shared cache keys and invalidation, locks, cursors and idempotency receipts. Anonymous context binds school ID as well as device/account context. Cursors from other schools fail without leaking records.
- [ ] Legacy root routes redirect safe GETs only after explicit existing-school mapping. Legacy writes cannot silently choose a school. Remove/deactivate old unscoped endpoints and signatures at cutover.
- [ ] Integration tests exercise every protected route with A/B identities, forged school IDs and stale permissions. Publicly available school A content remains intentionally public while private metadata is excluded.

## Task 4: Browser navigation, school onboarding and notices
**Files:** layout/header/navigation/profile/auth/admin/submit Eta views; all corresponding `src/client/*.ts`; preferences, navigation-cache, submission-storage and SW.
- [ ] School chooser and pending-application status; approved school activation flow. Build accessible forms for school name, authorized contact, DPO/privacy details and acceptance of reviewed institutional agreements. Rate limit applications, minimize data and verify before provisioning admin access.
- [ ] All links/forms/fetches use trusted rendered school base paths; switching school cancels in-flight requests and clears account-specific UI. No flash of another school's cached content.
- [ ] Namespace local drafts/history/preferences where school-specific; migrate legacy browser state only with known existing-school mapping. Clear private state on logout/account change and honor reduced motion/accessibility.
- [ ] Render `/s/:slug/privacy` and `/s/:slug/terms` from approved versioned school settings, distinguish provider and school purposes/contacts. Present notice at collection and store consent records only for processing that actually relies on consent; keep optional choices separate.
- [ ] Verify callbacks return to an authorized school route through a validated relative return path, with no open redirect or elevation through query parameters.
- [ ] UI tests cover mobile/desktop school switching, revoked membership, multiple tabs, expired invite, missing policies and no-school states.

## Task 5: Storage, jobs, alternate clients and operations
**Files:** `supabase/functions/**`, storage policies/migrations, Express evidence/digests/cleanup, `apps/web`, mobile clients found in repository, deployment docs.
- [ ] Tenant-prefix object keys and enforce membership/record linkage at upload finalization and download. Signed URLs must have short lifetimes; public evidence must follow school publication policy. Cross-school object swaps fail.
- [ ] Tenant-scoped digest jobs/preferences/senders, unsubscribe scope, notifications, outbox, retention/holds and cleanup. Never send school A private information to B via a global subscription or worker.
- [ ] Update or disable all older Next/mobile/Edge entrypoints before changing grants. Inspect direct Supabase calls and service-role routes; web-only filtering is insufficient.
- [ ] Implement deployment-wide rate controls per IP/account/school with bounded budgets; verified bot checks where appropriate. Configure Supabase Auth limits/MFA independently. Bound retries on conflict/outage; do not amplify database load.
- [ ] School-specific exports/return/deletion use verified authorized requests, redact third-party data and honor records holds. Separate removal of a school from deletion of the user's global identity. Restore rehearsals must preserve tenant separation and deletion suppression.
- [ ] Log tenant references without unnecessary content; platform support access is time-bound, justified and audited. Review provider dashboard access and backups, which are outside RLS.

## Task 6: Cutover and acceptance
- [ ] Restore production-shaped synthetic staging; rehearse migrations, row mapping, grants and rollback. Migration failure leaves onboarding disabled. Keep old app versions from accessing new-school records.
- [ ] Run negative authorization tests, privacy-request drill, backup/restore drill, performance/load checks in staging, accessibility and dependency/license review. Record results against release commit and schema version.
- [ ] Obtain platform/legal and first-school approvals with known data owner mapping. Apply reviewed migration in maintenance window with backup and monitoring; do not use code rollback that restores global permissions after multiple schools exist.
- [ ] Verify minimum two synthetic schools in staging, then monitored approved onboarding. No production readiness claim until every P0 and applicable legal gate is evidenced.

## Current status
All tasks are pending. This plan makes no claim that adding a `school_id` column alone secures multi-tenancy. Existing data is confirmed demo-only; the operator is a registered business whose exact identity/contact remain unconfigured. Independent browser-policy, notice-accuracy and cron authorization fixes are tracked in the foundation plan.

### Confirmed product decisions (2026-10-15)
- One shared SaaS service for many schools.
- Operator is a registered business; exact legal name and monitored privacy mailbox still need configuration/verification.
- User identifies existing records as demo data only. Preserve these in a dedicated demo school during a reviewed migration; do not delete data or auto-grant platform administration. Existing account identities may still contain real contact information and need protection.
- Tenant isolation remains unimplemented; data mapping is no longer an unanswered product question, but migration rehearsal and approval remain required.
