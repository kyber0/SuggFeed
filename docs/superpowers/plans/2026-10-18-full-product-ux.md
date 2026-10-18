# Full product UX implementation plan

> Execute natively with `superpowers:executing-plans`; use one final independent review.

**Goal:** Audit every SuggFeed surface and remove confirmed barriers to safe, understandable task completion.

**Architecture:** Preserve role-separated school/platform routes, Express/Eta rendering and the existing design system. Fix shared causes and existing components; keep hosted data and access policy untouched. Use local fixtures for state and browser verification.

**Tech Stack:** Express, Eta, TypeScript, modular CSS, Supabase, Playwright, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-18-full-product-ux.md`

## Global constraints

- Cover every source screen/component in the inventory and state matrix; separate source coverage from browser evidence.
- Preserve navy/orange brand, mobile web/PWA, reduced motion and role isolation.
- Never create fake billing, carts, plans, maps, RTL translations or legal approvals to satisfy generic checklist examples.
- No hosted test records, account/role changes, emails or database migrations for this UI audit.
- Fix confirmed defects before optional cosmetic additions; retain user drafts on failures.

## Review focus

- Names containing HTML and quotes must render literally in cards, comments and data attributes.
- Failed/late requests must not falsely report success or replace newer results.
- Analytics filters, chart, table, KPIs, export and scope labels must describe the same available records.
- Offline transitions and canceled navigation must not discard form input.
- Keyboard focus, mobile safe areas, 200% zoom and dark contrast must work without hover.

## Tasks

- [x] 1. Inventory all templates, browser modules, emails, offline shell and role flows. Record each applicable state as exists/missing/not applicable and record evidence. Run the existing browser baseline.
- [x] 2. Fix unsafe name rendering in staff/idea clients using the existing escaping utility. Add regression coverage. Make staff refresh/search/role changes expose failures, prevent stale search results and confirm privilege grants.
- [x] 3. Repair analytics at its source: normalize GET filters, generate consistent filtered server aggregates and timeline, use native filter navigation, refresh all dashboard data, provide a chart table alternative, escape exported cells and disclose snapshot limits. Cover filter/date/zero/single-point/error cases.
- [x] 4. Add shared offline status and narrowly scoped unsaved-form protection; align offline shell copy, focus scroll clearance, print behavior and identified labels/keyboard gaps. Retain native form/origin/security semantics.
- [x] 5. Review every inventory entry with the 12 audit categories. Confirm scan findings before fixes. Expand browser fixtures for school/platform/security states and check widths, themes, data extremes and essential flows. Run build/type checks and relevant/full regressions.
- [x] 6. Obtain one independent code review, resolve findings, publish authorized changes, and document exact evidence plus checks requiring real users/credentials/devices.

## Execution ledger

- Baseline: existing 13 browser regressions passed; source inventory and broader scan in progress.
- Ruling: Proceed with the already authorized audit and fixes without another plan approval — the attached request explicitly authorizes both. This avoids an unnecessary pause; scope remains the existing product.
- Ruling: State existence means a source implementation exists, not that every state/browser combination has passed. Real Google/SMTP delivery, real-device/Safari and screen-reader research remain explicit external verification limits.

- Final evidence: 97-source inventory/state matrix; 265 local regressions, 18 browser regressions, 280 scan cases; build/type checks passed. Independent reviewer confirmed both findings resolved and no final blocker.
- Ruling: Complete regression files were executed in isolated direct ts-node processes because Node 24's test-child path initially produced file-only counts; the result includes actual assertion totals. The repository's Node 22 requirement is unchanged.
- Ruling: Visual review remains mandatory alongside width scans — it found vertical letters/digits in analytics despite no document overflow. Scoped fixes and regressions now cover that failure.
