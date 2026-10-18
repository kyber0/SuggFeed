# Browser actions and backend audit — 18 October 2026

## Confirmed failures and fixes

1. The final idea button dispatched a non-bubbling submit event. The delegated document listener never received it, so no request was made. The event now bubbles, with regression checks for backend success and failure.
2. Weekly-email unsubscribe still used `no-referrer`. Chromium sends `Origin: null` for native POST forms under that policy. The page now uses `strict-origin`, preserving the site origin without exposing token paths/query strings. Invitation/settings forms retain the same corrected policy.
3. A global mobile CSS rule hid every `/admin` link, including staff workspace navigation in unscoped renders. It is now restricted to header shortcuts; mobile staff menu links remain available.

The generated submission script and base stylesheet have new versioned URLs to avoid stale browser assets.

## Checks performed

- 106 declarative template bindings checked against the 126-entry handler registry: no missing handlers.
- Full automated suite: 255 passed, zero failed/skipped. Covers HTTP authorization, role changes and invitations, reviews/workflows, progress/evidence, comments, votes, bookmarks, saved searches, private receipts, notification preferences, digest jobs, and tenant isolation.
- Typecheck and production build passed.
- Browser UI audit: 13 passed. Includes mobile staff navigation at 320/390/768px, landscape navigation, header overflow, touch controls, modal focus/stacking, and authentication failure recovery. Updated the stale guest-link assertion to the current school selector.
- Actual rendered idea form in Chromium at 1440px and 390px reached Express and the real local PostgreSQL test database (PGlite) tenant gateway, recorded a pending idea, and displayed its private receipt. No browser page errors.
- Simulated HTTP 503 during browser submission displayed feedback, retained the entered draft, and restored the submit button.
- Hosted rollback-only verification: 24 checks passed on `qulwcnhrxnjpfxlwqmpm` at 2026-10-18T03:44:26.672Z. Newly includes submission creation, idempotent replay, and receipt recovery via the real gateway.
- Hosted probe SHA-256: `d4f304d80afc3e5e621895e1db27d6c2c29ef8bbbdf8269f7992e3c6722b56dd`. Before/after registry, account, security metadata, and release-gate snapshots matched. No synthetic data persisted.

## Limits

The complete browser-to-database flow was exercised locally; hosted writes were tested inside a rolled-back transaction. No user's authenticated production session was impersonated. This audit did not perform real Google OAuth, deliver emails, or upload/download actual hosted attachment files. Provider configuration and those real-user flows remain separate checks; passing this audit is not a guarantee that every future backend request succeeds.
