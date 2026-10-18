# Hosted school isolation verification

Captured: 2026-10-18T03:25:42.481Z (UTC). Project: `qulwcnhrxnjpfxlwqmpm`.

## Evidence

- Hosted migration count: 45, including `202610170001_school_release_evidence.sql`.
- Actual hosted rollback-only SQL: **21 assertions passed**.
- Probe SHA-256: `a60b01d6c40319f9f28e941e46be26cfc9bebeed06548c3a25fe66f1dc1c3915`.
- Registry/account/security snapshots matched before and after the probe; no synthetic accounts or schools persisted.
- Existing baseline: 10 accounts, 2 schools, zero probe schools.
- School ownership, composite parent references, RLS, executor restrictions, and private bucket configuration passed metadata assertions.
- Cross-school reads/writes/deletes, parent ownership, directories, profiles, notifications, revoked memberships, gateway resource boundaries, and context restoration after success/failure passed transaction probes.
- Anonymous direct submissions/settings requests returned 401. Anonymous gateway request returned 404 (RPC unavailable to that role).
- Deployed application health returned 200.
- Local full suite passed 251 tests; typecheck and production build passed.

Independent read-only review found no material blocker for the fictional-demo release, including the reserved UUID exception, invitation authorization, rollback safeguards, and release evidence permissions.

## Scope and limits

The hosted probe uses synthetic fixtures inside one transaction ending in ROLLBACK. It does not create persistent test accounts or send invitations. Run with `NODE_USE_ENV_PROXY=1 node --use-system-ca apps/web-express/scripts/verify-hosted-isolation.cjs --probes` from the repository root. Management credentials stay in environment bindings.

Private bucket configuration was checked live. Actual signed-file download and real-user browser account switching were **not** exercised in this hosted run; local regression coverage is separate. This evidence establishes the measured isolation boundaries, not legal compliance or an institutional authorization.

## Activation scope

Only reserved fictional demo UUID `00000000-0000-4000-8000-000000000001` may operate without final business configuration. It remains private and invitation-based, for synthetic content and adult evaluation. Gmail eligibility text does not automatically admit accounts. Sample contact addresses are unmonitored and prominently labeled.

CSPC remains pending, with no institutional policy approval. Real-school activation continues to require reviewed policies and service business configuration. The release gate requires a timestamp, enabled operator identity, and this evidence reference; application roles cannot write that gate.

## Release result

Implementation pushed to `main` as `6f120f5`. The hosted release transaction recorded the evidence, approved demo policy version 3 explicitly for fictional demonstration, and changed only `demo` to `active`. CSPC remained `pending`, version 1 unapproved. No invitations were issued.

Post-release live checks:

- `/health`: 200.
- `/s/demo/feed` without sign-in: 403, school membership required.
- `/s/cspc/feed` without sign-in: 404, pending workspace unavailable.
- Platform demo settings without sign-in: 401.
- New platform invitation POST without sign-in: 401 with sign-in-required page, confirming the new route is live without creating an invitation.

Super admins manage the demo from platform settings. A separate invited/member account is required to explore the school-facing interface; platform authority does not grant entry to member UI.
