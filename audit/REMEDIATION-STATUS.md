# Audit remediation status — 26 October 2026

## Security follow-up — latest local verification

The Claude-Red follow-up is recorded in [security verification](security-followup-verification.json).
Both supported installation paths pass: **397 tests, 396 passed, zero failed, one
native-PostgreSQL test skipped in the standard suite and passed separately**.
Seven local browser cases and the native 85-table recovery rehearsal pass.
Two forward migrations are prepared but have not been applied to production.
CodeQL rerun, remaining alert triage and hosted release/recovery evidence remain open.
See [rollout requirements](../docs/operations/security-followup.md).


This is the current status against the historical audit published in `bfa1ac7`.
Earlier batch JSON files retain their original results; they are not the final
verification. No hosted migration, account change, deployment or restore was run.

## Earlier audit-remediation results

- Target Node **22.23.4**, clean npm installation: **390 tests, 389 passed,
  zero failed, one skipped**. Original baseline: 363/321/41/1.
- All four scoped lints, full Express type checking and production build pass.
- Dependency audits are clear; body-parser is 1.20.9 and ip-address is 10.7.5.
  Supabase 2.117.2 and Node types 22.20.5 are aligned across both lockfiles.
- Fresh pnpm 9.15.0 installation: the same **390/389/0/1** result; all four
  lints, typecheck, build and dependency audit pass. Both verification installations
  disabled install scripts and regenerated application outputs from scratch. The npm
  dependency installation used host Node 24; every verification command used Node 22.
- The skipped standard-suite test passes separately on real disposable PostgreSQL:
  ten concurrent assignments respect capacity and concurrent jobs notify once.
  Dump/restore preserves 84 fixture tables, data, owners, effective grants, RLS,
  policies and function security; restored admin/student access checks pass.
- Browser characterization: eight color/design cases at 320/375/768/1440 in both
  themes; 144 inspector cases covering selection, pane, read-only state and widths
  320/1440. Pre-refactor output matches after extraction. Caret/focus, scroll,
  expanded details, incomplete colors and inline edits are exercised.
- Static boundary check: zero explicit runtime import cycles or layer violations.
  `git diff --check` passes.

Exact commands, counts, timings and scope are in
[final verification](remediation-verification-final.json),
[hotspot measurements](remediation-hotspots.json),
[PostgreSQL evidence](remediation-postgres.json) and
[changed files](remediation-files.md).

## Finding disposition

| Finding | Implemented | Remaining limit or follow-up |
|---|---|---|
| H1 / M7 | Patched both vulnerable resolutions in both locks; compressed JSON/form size and malformed-input regression checks | No exploit or hosted load test attempted |
| H2 | Repaired all 41 failing baseline cases without relaxing tenant/MFA/revision guards; fixed real search-draft and selected-version bugs | Standard suite retains its explicit native-PostgreSQL skip; separate CI job runs it |
| H3 | Characterized inspector/board/progress first; extracted rendering, focus, response parsing, installation and validation responsibilities | Complex helpers/shared state remain; this is risk reduction, not elimination of every controller hotspot |
| M1 | Kept npm deployment and pnpm development supported; aligned SDK/types/security fixes; added lock-drift regression guard | No forced package-manager migration |
| M2 | Leaf authorization/error modules remove reverse imports/cycle; pure contracts replace server requires of generated browser JS | Classic browser globals still require ordered initialization |
| M3 | Strict DOM adapters, generated typed contracts, explicit import-boundary guard and browser/runtime checks | Whole classic-script conversion and global-edge graph remain incremental work |
| M4 | Every Supabase HTTP operation has a 20-second bound and caller cancellation; readiness probe has a 3-second deadline; no-I/O liveness added | Multi-operation requests can take longer; production SLOs and provider timing are unmeasured |
| M5 | Server-generated request IDs, privacy-safe stable error codes, correlated logs, local backup/restore rehearsal and runbook | Hosted alert delivery, backup retention/ownership, managed auth/storage recovery and deploy rollback drill require an operator environment |
| M6 | All four lints and boundaries gate CI/release; real PostgreSQL check gates release; Supabase/Vercel CLI versions pinned | GitHub protection query returned Forbidden; actual branch/Vercel gates cannot be certified from YAML |
| L1 | One server board-window constant drives validation, browser metadata, lane links and guidance; missing/invalid browser metadata disables extra lazy loading | Server bounds remain authoritative |
| L2 | Documented competing template locations and unknown external/manual ownership | Retained unused candidate until owner confirms external consumers; no speculative deletion |
| L3 | Published scoped verification/critical-flow evidence and its exclusions | Whole-app coverage denominator and approved license policy remain unestablished; no legal violation is asserted |

## Complexity evidence

These measurements use the audit's AST method and actual Sonar cognitive rule.
Extracted helper scores are included in the JSON so smaller entry functions do
not conceal remaining complexity.

| Entry point | Before | After |
|---|---|---|
| Inspector `render` | CC122 / cognitive153 / nesting14 | CC18 / cognitive18 / nesting3 |
| Board `navigate` | Audit CC82 / cognitive91; immediate-before cognitive88 | CC23 / cognitive22 / nesting3 |
| Progress `updateComposer` | CC47 / cognitive76 | CC26 / cognitive36 / nesting4 |

## Critical-flow verification and limits

| Area | Evidence |
|---|---|
| School access and platform management | Existing HTTP tests retain role, school, MFA and revision rejection assertions |
| Feed, voting and navigation | Actual Eta escaping; applied search/draft separation; confirmed 429 versus ambiguous 503; no duplicate uncertain write |
| Board | Independent pagination/lazy recovery; selection-time version retention; invalid/oversized window limits; loading/drag harnesses |
| Progress | Completion evidence and workflow gates; private preview; expired/malformed replies preserve drafts |
| Customization | Canonical server/browser contract parity; server works without public JS; 144 exact inspector output/state cases |
| HTTP resilience | Caller cancellation, delayed response/body deadlines, readiness failure and privacy-safe error records |
| Persistence and recovery | Existing PGlite role/migration tests plus native PostgreSQL concurrency and restore check |

These checks are not a whole-app coverage percentage, mobile device certification,
production performance result or managed Supabase disaster-recovery certification.
The restore uses synthetic auth/storage schemas and roles within one local cluster.
All owned fixture containers are removed, with no network or published ports.

## Release and rollback

Changes are local to the current remediation branch. Publish through normal review
and CI; do not bypass hosted protections. Review deployed backup/alert/gate settings
before production sign-off. No new application SQL migration is required.

Changed public scripts have updated query revisions to avoid the seven-day static
cache serving old behavior. Keep templates and built assets together. Controller
changes can be reverted independently; retain the dependency security patches.

Source ownership and remaining decisions:
[application boundaries](../docs/operations/remediation-boundaries.md).
Local and hosted recovery scope:
[recovery rehearsal](../docs/operations/recovery-rehearsal.md).
