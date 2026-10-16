# School Release Readiness Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Correct verified privacy/security gaps and establish evidence-based gates for school deployment.

**Architecture:** Reuse Express middleware and Eta legal pages. Keep school policy separate from code, with validated environment configuration and a local configuration check. No new production data stores or destructive jobs.

**Tech Stack:** Express, TypeScript, Eta, Helmet, Node tests; Supabase/Vercel remain existing providers.

**Spec:** `docs/superpowers/specs/2026-10-15-school-release-design.md`

## Global Constraints
- No new dependencies or production test records/deletion. Later user authorization permits reviewed migrations after backup and rehearsal; activation still requires evidence.
- Shared SaaS confirmed; platform operator/contact and per-school policies unconfirmed.
- No compliance certification; distinguish source verification and configuration from operational evidence.
- User already requested planning and implementation. Execute independent fixes under that authorization; unresolved school decisions remain release gates, not guessed policies.

## Review Focus
- Missing/hostile contact values must never produce invented or unsafe mailto links.
- CSP must allow current external scripts and inert JSON, while rejecting executable inline scripts.
- Notice must distinguish account-linked submissions from anonymous mode and logs.
- Configuration output must never reveal secrets or imply compliance.
- Rights and retention procedures must preserve third-party privacy, legal holds and anonymous ownership boundaries.

### Task 1: Legal and operational evidence register
**Files:** `docs/compliance/school-release-readiness.md`, spec and this plan.
- [x] Record source access limits, applicability, data flows, existing controls and confirmed gaps.
- [x] Specify owners, evidence and stop-ship conditions; document rights, incident, retention and restore procedures.
- [x] Review all claims against routes/migrations, recording unverified hosted settings explicitly.

### Task 2: Truthful notices and contact configuration
**Files:** `src/lib/legal.ts`, `src/routes/legal.ts`, `views/privacy.eta`, `views/terms.eta`, `views/partials/auth-modal.eta`, `views/partials/submit-panel.eta`, `.env.example` under `apps/web-express`.
**Interface:** `legalDetails(env: NodeJS.ProcessEnv = process.env)` returns `{operatorName: string|null, privacyEmail: string|null}`. Routes pass `legal` to both views.
- [x] Test missing, valid, malformed mailbox and escaped operator data using local rendering.
- [x] Replace stale identity/retention/security/provider claims; add notice links at collection points.
- [x] Render both legal views with and without configuration; compile all templates.

### Task 3: Browser policy hardening
**Files:** `src/server.ts`, `src/lib/security.ts`, `tests/release-readiness.test.ts`.
**Interface:** `browserSecurityHeaders(req,res,next)` sets Permissions-Policy. Existing Helmet config owns CSP.
- [x] Assert local HTTP response disables camera/microphone/geolocation/payment; assert the shared CSP no longer grants unsafe-inline scripts or jsDelivr and frame ancestors are none.
- [x] Apply policy while preserving self-hosted scripts, Supabase connections and existing style support.
- [x] Run focused auth and template regression tests plus build.

### Task 4: Release preflight and handoff
**Files:** `scripts/check-release.ts`, `package.json`, `.env.example`, app README.
**Interface:** `npm run check:release` reads environment only, prints check names/status and currently exits 1 even with valid configuration because shared-service release gates remain open.
- [x] Check HTTPS canonical origin, Supabase URL/keys, strong session secret, configured platform name/mailbox; never output values. Mark manual gates unverified even on success.
- [x] Test missing/valid configurations as pure functions and the blocked CLI in an isolated subprocess with dummy values and no network.
- [x] Record executed checks, remaining gates and exact deployment steps. Review diff before commit.

## Execution record
Started 2026-10-15. Live source retrieval: NPC returned HTTP 403; Lawphil/NPC alternate requests denied by proxy. No laws represented as freshly verified. Implementation authorization comes from current user request; school-specific commitments are excluded pending answers.

Ruling: shared SaaS confirmed after initial audit. Platform contact is not a substitute for tenant notices. Tenant isolation has its own plan and is a hard release blocker. Existing data was subsequently confirmed demo-only; retain it in a dedicated demo school in the separately reviewed migration.
Additional confirmed security fix: archive-old-submissions accepted `Bearer undefined` when its secret was absent. Add a local handler regression test and reject absent/short secrets before constructing a database client; deploy separately only under reviewed retention operations.

### Confirmed product decisions (2026-10-15)
- One shared SaaS service for many schools.
- Operator is a registered business; exact legal name and monitored privacy mailbox still need configuration/verification.
- User identifies existing records as demo data only. Preserve these in a dedicated demo school during a reviewed migration; do not delete data or auto-grant platform administration. Existing account identities may still contain real contact information and need protection.
- Tenant isolation remains unimplemented; data mapping is no longer an unanswered product question, but migration rehearsal and approval remain required.

### Foundation verification
- `npm run build`: passed (server, service worker, client, strict client cohort and API types).
- `npx tsc -p tsconfig.tests.json`: passed.
- Readiness tests: 5 passed; archive authorization tests: 2 passed; auth tests: 9 passed; template tests: 3 passed (19 total). All local/mocked.
- Archive missing-secret regression reproduced before the fix: attempted database construction with `Bearer undefined`; after fix no database access and HTTP 401.
- `npm run check:release`: expected exit 1. Current local environment lacks production HTTPS APP_ORIGIN and platform legal name/mailbox; shared-service release gates remain open regardless of configuration.
- Deno runtime/hosted Edge deployment not verified. No database migration, purge, real email or production functional test performed.
- Tenant isolation workstream: planned, not implemented. No overall deployment/legal readiness claim.

Final independent review found a mailbox URL-fragment edge case and stale scope wording. Reproduced the mailbox test failure, rejected fragment-bearing addresses, reran all five readiness checks successfully and reran server/test type checks. Updated the design to the confirmed registered-business/shared-SaaS/demo-data decisions. No remaining material foundation regression was reported by review; this does not assess the unimplemented isolation workstream.


### Shared-service continuation — 16 October 2026
The isolation plan now has locally implemented migrations, scoped server/browser/jobs, reviewed school onboarding, shared request budgets and staff/operator MFA. Actual hosted snapshot export/restore and four-migration local rehearsal passed. See `docs/compliance/tenant-cutover.md` for remaining live work; proxy configuration restored management API access; all four migrations and the requested operator bootstrap are applied, and all ten legacy Edge handlers were retired and verified. School activation remains locked. The latest user clarification identifies this as their own project for schools to adopt, not a CSPC-operated service or a confirmed registered company. Operator name/public privacy mailbox remain unresolved.
