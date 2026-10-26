# SuggFeed remediation and refactor execution prompt

## Role and objective

Act as a principal engineer responsible for safely improving the existing SuggFeed application. Execute the audit recommendations through small, verified changes. Preserve current product design, content, school isolation and workflow authority. Refactor in place; do not rewrite the application or restore retired apps.

Read `AGENTS.md`, relevant local skills, `audit/REPORT.md`, `audit/metrics.md`, `audit/file-inventory.md` and `audit/rls-inventory.md` before implementation. Audit baseline is `6da6fc938ad1b5539138ba717728ff372bc8a40d`. Measurements describe that revision; recheck current code before treating a finding as open.

## Operating rules

1. Inspect branch, worktree, latest main and existing user changes. Use an isolated branch/worktree when needed. Never overwrite unrelated work.
2. Begin by recording an execution checklist with each finding ID, current evidence, planned change and verification. Keep it updated in `audit/REMEDIATION-STATUS.md`.
3. Identify callers, templates, tests, fixtures, generated artifacts, configuration and SQL involved before each change. Search references rather than guess.
4. Characterize observable behavior before refactoring. Never make failing tests green by deleting assertions or weakening permissions.
5. Use the current Express/Eta/TypeScript stack, existing helpers and bounded SQL authority. Add no new framework or unnecessary abstraction.
6. Do not expose secrets, copy environment files into Git, print tokens or log private submissions. Inspect configuration presence without reading values into reports.
7. Do not execute destructive SQL, wipe accounts, loosen RLS, bypass MFA/activation/review, or mutate hosted data as part of local verification. Use synthetic fixtures and disposable database instances. If required infrastructure is absent, mark its verification blocked and continue independent work.
8. Keep pure file moves/renames separate from logic changes. Preserve history with git mv, then update imports and verify. Deliver related commits together if intermediate commits cannot build.
9. The proposed target folders are justified options, not mandatory ceremony. Introduce only boundaries that remove a demonstrated cycle, mixed responsibility or duplicated contract.
10. Run tests because this execution task explicitly requires verification. Never claim a check passed without command output. Report pre-existing versus introduced failures separately.

## Phase 0 — Reproduce and resolve implementation decisions (1–2 days)

- Confirm Node22 target and supported package manager from current deployment configuration.
- Reproduce install, all existing lint scripts, typecheck, tests and production build from clean output using synthetic credentials and external-service isolation.
- Baseline expectation from the audit:363 tests,321 pass,41 fail,1 skip. Do not assume those counts remain current.
- Classify each failure: actual behavior regression, stale fixture, missing environment or unresolved product expectation. Record evidence and retain security assertions.
- Determine which lock/install path should be authoritative. Root pnpm and standalone npm were both supported but resolved different SDKs. Inspect CI/Vercel constraints first; propose the smallest supported consolidation. Ask the owner only if deployment requirements leave this genuinely unresolved.
- Confirm ownership of expected UI behavior before changing conflicting tests. Missing DOM methods are fixture defects; denied tenant/role access is not a fixture inconvenience.

Done: reproducible baseline, explicit failure map, canonical-install decision or documented blocker, no production writes.

## Phase 1 — Security and verification baseline

### H1 / M7: dependencies

- Recheck current advisories and installed resolution. Audit identified body-parser1.20.8 affected by GHSA-27r3-jxmh-p828 and ip-address affected by GHSA-rxp7-6hxx-x8q5.
- Patch the smallest compatible dependency chain. Do not use broad forced major upgrades or merely silence advisories.
- Add focused bounded-body/error-handling regression checks; inspect compressed request handling without running attacks against production.
- Verify both supported install paths resolve the intended patched versions during transition. Re-audit and document any remaining advisory reachability.

### H2: regression suite

- Repair comment revision fixtures against current revision-aware reporting.
- Repair feed/staff DOM fixtures against actual query, lazy-loading, maximize and event APIs.
- Reconcile platform/role markup fixtures with intended current behavior; preserve negative authorization and exact-ID checks.
- Add browser characterization where VM fakes cannot establish real focus/layout/lifecycle behavior.
- Run assignment concurrency tests against disposable PostgreSQL when available. A skipped race test is not verification.

Done: targeted and full checks green, or precise environment blockers disclosed; patched dependencies verified in the deployment tree.

## Phase 2 — Reproducible build and delivery (1–2 days)

Address M1/M6 and quick guardrails:

- Standardize documented install/build commands. If temporarily retaining two locks, add a small resolution-drift check for critical runtime packages.
- Wire every existing scoped lint command into CI, plus type checking, tests and production build. Keep security audit gates.
- Pin release CLI versions where the workflow used latest or unversioned npx.
- Establish clean-install/build/start smoke verification with no pre-existing generated assets.
- Confirm actual branch protection, production approval and Vercel auto-deploy behavior with the owner. YAML alone does not prove hosted settings.
- Add boundary/cycle checks as warnings, recording the current baseline and preventing new violations before escalating existing rules to errors.

Done: one reproducible documented path, no accidental SDK divergence, complete checks and identified release gates.

## Phase 3 — Small dependency-boundary repairs (1–2 days)

Address M2/M3:

- Extract ProgressError or the minimal shared progress contract into a leaf module to remove the progress/progress-evidence runtime cycle.
- Move reusable school authorization below HTTP so school-customization-access does not import routes/schools.
- Preserve all tenant, membership, MFA and editor-grant checks; characterize revoked membership and stale-tab behavior first.
- Trace server imports of public/js school-colors and school-design. Establish pure implementation contracts usable by both runtimes with existing tooling; do not duplicate algorithms.
- Do not remove committed generated output until clean bootstrap and runtime parity prove it unnecessary.
- Tighten DTO/DOM types incrementally in touched modules, without blanket casts or disabling errors.

Done: runtime cycle removed, no service-to-route dependency, server no longer relies on generated browser implementation where migrated, startup and authorization characterization pass.

## Phase 4 — Work-board hotspot (2–3 days)

Address H3/L1 in staff-tools, staff-progress, staff-review and related templates:

First pin behavior for independent lane pagination, lazy window bounds, selection across pages, selected-group drag, partial failures, stale responses, exact-ID panel opening, drafts, close/reopen, focus restoration and navigation history.

Then extract the smallest coherent units for lane loading, selection, dragging and review/progress panel ownership. Retain the existing external DOM contract until consumers are migrated. Avoid competing transform/state ownership and additional globals.

Centralize the loaded-window contract currently repeated as72 in browser, service and templates. Keep database safety bounds explicit. Preserve assignments, receipts, optimistic version checks and restricted moderator visibility.

Re-measure complexity with the audit method or a documented comparable method. Lower complexity by separating responsibilities, not hiding branches in generic wrappers.

Done: same user behavior, all consumers updated, characterization green, measured complexity reduced, no new cycle or duplicate state owner.

## Phase 5 — Customization studio hotspot (2–3 days)

Characterize inspector values, inline edits, selection/drag, theme rendering, draft conflicts, preview isolation, mobile interaction and published-version restoration before extraction.

Split the high-complexity inspector by actual theme/form/layout responsibilities. Preserve shared behavior and accessibility. Keep previews private and incapable of real actions. Cosmetic publishing must not reset approved policies, grant access or change school activation.

Finish shared color/design contracts if not completed earlier. Avoid an unsolicited UI redesign or general-purpose page builder.

Done: current edit/publish/restore contracts preserved, clean build/server boot, no cross-school preview leakage, lower measured cognition with readable responsibility boundaries.

## Phase 6 — Reliability and operations (1–2 days)

Address M4/M5/L3:

- Add bounded readiness/database operations using supported cancellation/deadline mechanisms. Preserve fail-closed auth; never interpret unavailable settings as enabled features.
- Distinguish no-I/O liveness from database readiness. Verify timely503 on delayed or failed infrastructure.
- Add privacy-safe request IDs, stable error codes and useful timings. Do not log credentials, full comments or private answers.
- Preserve existing assistant budgets/timeouts/circuits, encrypted sessions and bounded session cleanup.
- Verify configured monitoring rather than add a second SDK without need.
- Establish an honest coverage denominator; identify VM/browser and database coverage separately.
- Rehearse migration replay, backup restoration and app rollback in disposable environments. Report measured outcomes and recovery time; never label untested instructions a successful drill.
- Review license declarations with maintainers; do not infer a violation from LGPL metadata alone.

Done: bounded failures, diagnosable incidents, documented monitoring/recovery evidence and explicit remaining gaps.

## Phase 7 — Low-risk cleanup and documentation

- Treat inventory actions as proposals requiring current ownership/caller checks. Knip output is not a deletion list; retain executable Deno handlers, preview tools and skill scripts unless their retirement is confirmed.
- Confirm external/manual consumers of auth-email-template before removal.
- Do not rewrite old immutable SQL migrations to reduce duplication. Add forward migrations only when required, replay on a disposable database and review effective grants/RLS.
- Update README, architecture boundaries, environment reference without values, contribution guide, decision records and incident/recovery runbooks.
- Record every finding as fixed, superseded, accepted with reason or blocked with missing evidence.

## Verification gate after each logical phase

Discover exact current scripts from package.json, then run the full applicable set: scoped lints, type checking, targeted tests, full regression suite and production build. For browser changes, use real browser fixtures and inspect320/375/768/1440 widths, keyboard interaction, reduced motion and console output. For database changes, replay migrations and verify tenant/role isolation on disposable data.

Keep before/after commands, exit codes, counts, dependency resolutions and complexity metrics in a sanitized verification log. Do not claim performance, effective production RLS, backup recovery or accessibility certification from source inspection alone.

## Delivery and release

Provide small reviewable commits grouped by risk and phase. Do not force-push or bypass required checks. Publish through the repository's normal reviewed workflow; deployment and hosted migrations require the applicable authorization and verified release prerequisites.

Final response must include:
1. Finding IDs fixed and remaining, with reasons.
2. Changed-file inventory and behavior changes.
3. Exact verification results, skipped checks and blockers.
4. Before/after complexity, dependency resolution and coverage scope where relevant.
5. Migration/deployment instructions, rollback limits and operational evidence.
6. Links to review artifacts and updated remediation status.

Stop only dependent work when a real decision or missing environment blocks it. Continue other authorized phases. Never represent partial completion as production sign-off.
