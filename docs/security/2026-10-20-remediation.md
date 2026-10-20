# Security remediation execution record

Started 20 October 2026 (Asia/Manila), source base `7e062db`. Implements the confirmed findings in [the combined review](2026-10-20-review.md). This record distinguishes code, deployment and provider evidence; it is not an assertion that every risk is closed.

## Decisions and scope

- Use the systematic-debugging and executing-plans workflows; preserve existing tenant/role/MFA boundaries and accounts. Existing audit authorization includes local regression verification with disposable data. No hosted attack, load test or school-data deletion is authorized by this implementation record.
- Ruling: add a transactionally maintained school content generation and include it in cache keys — preserves caching without cross-instance invalidation messages — cost if wrong: missing trigger coverage can retain stale published content. Public school resolution fails closed without a valid generation; deploy the migration first.
- Ruling: use the existing atomic request-budget store before session/identity work because no separate edge/Redis configuration is available — no new external credential or account is invented — cost: the shared counter still consumes primary-database capacity and adds one read-request round trip. External volumetric/edge protection remains an operational prerequisite, not a claim supplied by this fallback.
- Ruling: stop new PDF reservations/finalization/publication and quarantine existing PDF downloads until a scan-verdict pipeline exists — no document is deleted — cost: staff must use JPEG/PNG/WebP alternatives. Do not add a public malware-scanning service for private school files.
- Ruling: purge only expired encrypted sessions automatically; school content retention remains inventory-only until a disposal/hold procedure is approved — prevents irreversible deletion based on an assumed policy — cost: school retention finding remains partially open pending that procedure.
- Ruling: no Git history rewriting or historical-token reuse — revocation is the containment step — cost: the history scanner continues flagging the disclosed credential until revocation and a narrowly reviewed historical baseline are recorded.

## Changes

### S01 — Credential handling

- `.gitignore` now excludes `.env*` and `*.env`, retaining sanitized example-file exceptions. No real env values are committed.
- New security workflow pins checkout, Node setup, Gitleaks action and CodeQL revisions. Gitleaks is configured for version 8.24.3, full reachable history, no PR comments and no uploaded report artifact. Dependency audit and TypeScript static analysis are separate jobs. Default workflow permission is read-only; only CodeQL upload receives `security-events: write`.
- Express has an explicit Dependabot directory for its independently deployed lockfile.
- User was asked to revoke the exposed Sentry token and replied “on it.” No revocation confirmation has been received at this record's creation. No replacement Sentry credential was available here. The old token was never replayed.
- Do not disable the history scanner, ignore the entire initial commit, add the secret value to an allowlist, or rewrite shared history without coordination. A historical fingerprint baseline can be approved only after revocation is evidenced.

### S02 — Cross-instance moderation cache

- Migration `202610200001_security_remediation` adds a private `school_content_revisions` table with no client grants and a definer trigger.
- Idea visibility/content changes and inserts/deletes, comments, categories, public updates, merges and status history advance the school generation in the same transaction.
- Existing `school_presentation` returns the generation as a decimal string, avoiding JavaScript integer rounding. The existing school-resolution call reads it without an extra presentation query.
- Cache keys include school ID, customization version and content generation. Old cache fills remain under their old generation and cannot populate the next generation.
- Runtime refuses to serve a school when generation metadata is missing/malformed. Roll back application code if necessary; keep the additive migration and generation data. Do not roll back to serving unchecked stale sensitive payloads as a latency fix.

### S03 — Password policy

- Read-only provider inspection found minimum length 6, HIBP disabled, CAPTCHA disabled and email-send rate 2. Values unrelated to these settings were not published.
- Enabling `password_hibp_enabled` was attempted through the trusted management API and rejected with **HTTP 402: Pro plan required**. No subscription or billing setting was changed.
- Provider accepted `password_min_length: 12`. Signup/reset input attributes, validation text and compiled clients now require 12 characters for newly chosen passwords. Existing passwords/accounts were not reset.
- Full breached-password blocking remains open: enable the supported provider feature after a separately authorized plan upgrade, or review a supported equivalent. A longer password is a compensating control, not a leaked-password checker. Existing provider email rates were retained; no arbitrary CAPTCHA secret was invented.

### S04 — Read abuse

- Static assets are served before the new controls. An in-process burst limit precedes the shared counter.
- Production GET/HEAD page reads use a shared HMAC IP bucket: 1,000/minute for ordinary pages and 180/minute for search/count/prefetch. These are initial limits, not traffic-derived guarantees; monitor school NAT false positives before wider rollout.
- The shared guard runs before sessions, provider identity verification and school loaders. Rejected reads do not start those downstream operations. Store failure goes through the existing safe 503 response with Retry-After; denied responses are private/no-store.
- Read controls never contact providers in non-production local development/test mode. Production startup already requires its strong secret and provider configuration. Static/health/deployment topology still requires operational review; no public bypass header was introduced.
- Internal GET jobs require the exact independent strong cron bearer before bypassing normal read budgets. Existing mutation budgets remain unchanged.
- This does not absorb volumetric floods, prove trusted-proxy correctness or impose a provider hard spend cap. Confirm Vercel edge protection/monitoring and move the distributed counter outside the primary DB when provisioned and rehearsed.

### S05 — Cleanup and retention

- Service-only `purge_expired_web_sessions` deletes at most 1,000 expired rows per RPC call; the cron route makes at most 10 calls within a 15-second catch-up budget, ordered by expiry with skip-locked selection. Unexpired sessions and account rows are untouched. Calls allow 1–5,000 rows for separately controlled backlog cleanup.
- `/internal/security-maintenance` requires the independent cron bearer and returns counts only. Vercel daily schedule is `0 1 * * *`: **09:00 Manila**. Log event `security_maintenance` reports `removed`/`more` without identities or tokens. Alert if `more` persists or daily success is absent.
- MFA-protected platform operator endpoint `/platform/security/retention` returns per-school expiry candidate counts and policy-review state. It is a dry run and explicitly labels school-content deletion blocked pending disposal and legal-hold approval.
- No deleting worker for school ideas/files/notes or accounts was enabled. A DPO/operator must define the schedule, holds, dependencies, audit retention and backup suppression before that part can be closed. Existing disclosure of `retention_days` must not be advertised as executed deletion.

### S06 — Files

- New PDF selection/reservation and finalization are rejected by the UI/server; the database trigger also rejects bypassed/stale pending/ready/published PDF writes. The evidence bucket no longer accepts PDF uploads.
- Existing PDF metadata/objects are preserved, but application downloads are quarantined instead of issuing signed URLs. Existing signed links issued before deployment expire under their existing 60-second TTL; no immediate revocation promise is made.
- Image workflows remain supported. School branding/submission image processing now has an explicit 8-second Sharp timeout in addition to size/pixel/content validation.
- A future PDF pipeline must bind a clean verdict to the exact immutable object hash, bound scanner resources and fail closed. Removing quarantine without this replacement reopens S06.

### S07 — Definer privileges

- The additive migration removes PUBLIC/anon/authenticated execution on the two Auth trigger helpers and sets `search_path=pg_catalog,public`.
- Intentional self-subject role helpers, service-only tenant gateway, all accounts/memberships and school grants are retained.

## Verification and rollout ledger

- New local tests cover the full migration chain, transaction rollback of content generations, cache separation by generation/tenant, bounded expired-session deletion, direct-client maintenance denial, trigger helper ACLs, database PDF rejection and shared read-budget denials/failures.
- Existing evidence tests were updated to verify PDF quarantine while preserving image signing/path/owner/idempotency assertions. Related UI fixtures now use valid image alternatives. Older DOM/category fixtures exposed by the full suite are updated to the current shared component contract, not by weakening application validation.
- First full suite: 269 cases, 258 passed / 11 failed. Failures were traced to stale DOM/category/PDF fixtures and new pre-session budget mocks. Rerun outcome and review findings are recorded below when complete.
- A root workspace build attempt hit the environment's pnpm wrapper; builds/typechecks are rerun using the deployed Express package's own npm scripts. This is an environment entry-point issue, not evidence of a successful root build.
- Hosted migration, final provider readback, deployment and post-deployment results remain pending until explicitly appended below.

## Remaining external actions

1. Confirm historical Sentry token revocation and replace any required build binding with a least-privilege token. Do not paste credentials in chat.
2. Authorize/support provider HIBP capability if breached-password blocking is required; no paid upgrade is implied by this code change.
3. Evidence edge limits, alert delivery, provider console MFA, backup isolation and a restore rehearsal.
4. Approve school disposal/legal-hold operations before enabling destructive content retention. Current report-only behavior is deliberate and visible.

None of these external items is marked fixed merely because code was written or local fixtures pass.

## Main-branch integration and revocation update

- Integrated the security changes onto animation commit `35b21e8`, retaining the newer UI refresh and shared animation system. Resolved duplicate fixture properties without removing application checks.
- On 20 October 2026 (Asia/Manila), the user confirmed revoking the old Sentry token and creating a replacement. This is operator confirmation, not an independent provider-console verification. The replacement is never embedded in source; configure required secure Vercel/GitHub bindings separately.
- Gitleaks 8.24.3 (published download SHA-256 verified) reported two findings over reachable Git history: the historical Sentry token and a public Supabase client JWT. Offline decoding identified the JWT's role as `anon`; no token was replayed. `.gitleaksignore` contains only those exact commit/path/rule/line fingerprints. No entire file, commit or detector is allowlisted. New occurrences remain scanned.
- This push includes the additive migration but does not execute hosted migrations or verify provider configuration. Deploy migration `202610200001_security_remediation` before the application: school resolution intentionally returns 503 when content-generation metadata is absent. No production data, emails or accounts are modified by preparing this commit.

### Integrated verification before push

- Node **22.23.3**: animation lint, full Express/server/client/test type checking and production build passed.
- Full regression suite: **278 passed, zero failed/skipped**, including disposable-database migration, isolation/cache generation, PDF quarantine, read-budget and bounded session-maintenance checks. No hosted records were used by these checks.
- Gitleaks **8.24.3**: all 217 reachable commits and the staged patch passed with only the two documented exact historical fingerprints excluded. New environment files are not staged.
- Fresh npm advisory audit of the integrated lockfile: **zero known vulnerabilities**, including development dependencies.
- CodeQL/GitHub-hosted workflow execution and live migration/provider configuration have not been independently rechecked in this push. The external requirements above remain operational follow-up items.
