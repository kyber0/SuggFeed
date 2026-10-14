# Express UI/UX Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execution here is native in the existing workspace, as authorized by the user's request to audit and fix. Steps use checkbox syntax for tracking.

**Goal:** Fix reproduced navigation, accessibility, readability and interaction problems across the active Express app.

**Architecture:** Repair shared CSS and existing client handlers at their sources. Reuse native dialog semantics for authentication and existing design tokens for colors; preserve existing routes, brand artwork and page layouts. Verify with local fixtures that never call production services.

**Tech Stack:** Express, Eta, TypeScript, modular CSS, Python Playwright/Chromium.

**Spec:** `apps/web-express/docs/ui-ux-audit-20261014.md`.

## Global Constraints

- Use the existing Express/Eta components and SuggFeed brand.
- No production database records or migrations.
- Compact mobile text remains default; Comfortable stays available.
- Use the existing workspace and authorized main publication workflow.
- Keep controls at least 44px high where applicable on mobile; preserve existing stretched card links.
- Target 4.5:1 for small foreground text on its intended fill.

## Review Focus

- Guest and staff navigation must work at 320px with long account names.
- Closing a nested auth dialog must retain the underlying editor/roadmap context.
- Auth failures must recover the pending button and announce an actionable message.
- Larger touch targets must not overflow cards or page boundaries.
- Theme, text-size and reduced-motion preferences must not break the fixed layouts.

### Task 1: Navigation and identity

**Files:** `public/css/modules/components.css`, `public/css/modules/responsive.css`, `views/partials/header.eta` under `apps/web-express`; `tests/browser/ui-ux-audit.py` and local fixture support.
**Interface:** existing anchor hrefs/account menu remain stable.

- [x] Add browser assertions for visible mobile staff links, header overflow with long names, and guest Profile accessibility name; run and record failures.
- [x] Remove the broad legacy admin-anchor hide rule, bound header/nav shrinkage, keep full identity in the dropdown, and add `aria-label="Your profile"` to the guest link.
- [x] Rebuild bundles and verify 320/390/768px guest/student/staff layouts.

### Task 2: Readable foregrounds and controls

**Files:** `public/css/modules/tokens.css`, `experience.css`, `profile.css`, `roadmap.css`, `pages.css`, `responsive.css`, `components.css` under `apps/web-express`.
**Interface:** add shared `--action-bg`/`--action-hover` tokens for orange actions; use existing `--text-link`, `--ink-2`, `--navy-2` and status tokens for foreground/fill pairs.

- [x] Add contrast assertions for primary actions, status badges, profile counts, dark dates/report links and blue-on-dark surfaces; assert mobile vote/range/page-submit height >=44px; run to reproduce failures.
- [x] Change only the shared fills/foregrounds and implicated control selectors; keep artwork and compact card click areas.
- [x] Verify light/dark themes, Comfortable text and reduced motion at narrow widths.

### Task 3: Modal layering and auth recovery

**Files:** `views/partials/auth-modal.eta`, `src/client/auth-modal.ts`, `src/client/submit-panel.ts`, `src/client/idea-detail-drawer.ts`, `public/css/modules/auth.css`, generated client JS.
**Interface:** preserve `window.openAuthModal(tab?)` and `window.closeAuthModal()`. Native auth card receives ID `auth-dialog`. Inline feedback receives ID `auth-modal-feedback` and a live role.

- [x] Add tests for Tab staying in auth over an editor, Escape closing only auth, auth opening over the roadmap's native dialog, and rejected mocked sign-in/sign-up SDK calls restoring buttons.
- [x] Convert the existing auth card to a native dialog; wire opening, closing, backdrop and cancel behavior; let lower custom keyboard handlers yield to open native dialogs.
- [x] Catch SDK failures with try/finally and show active-modal feedback inline. Preserve sign-in/session synchronization behavior and form contents on retry.
- [x] Verify nested close/focus restoration, normal auth tabs and recovery forms using mocked SDK responses.

### Task 4: Focus visibility and legal prose

**Files:** `public/css/modules/submit.css`, `views/privacy.eta`, `views/terms.eta`.
**Interface:** retain native category radios and all existing legal links.

- [x] Assert a category card shows a focus ring after keyboard focus and legal pages contain no JSX whitespace literals.
- [x] Add focused-card styling and remove the two literal artifacts.
- [x] Check keyboard category selection and both legal pages.

### Task 5: Publish verified changes

**Files:** generated CSS bundles/JS, `views/layout.eta`, changed partial/script cache versions, audit/plan documentation.

- [x] Run the full Express build and compile all Eta templates.
- [x] Run relevant existing client tests and the new UI/UX browser assertions, plus the screen scan.
- [x] Confirm no production calls, review diff/callers, update audit outcomes and plan checkboxes.
- [x] Commit and push to main, reporting tested scope and live deployment limits accurately.
