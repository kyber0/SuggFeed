# School Enrollment Rosters Implementation Plan

**Goal:** Add optional school-managed enrollment eligibility alongside verified email joining and invitations.
**Architecture:** Store a versioned school access rule and an email-only roster separately from memberships. Enforce student eligibility in shared database role checks, join RPCs, server school resolution and account navigation. Staff roles and revoked memberships retain their existing rules.
**Stack:** Express, Eta, TypeScript, PostgreSQL/Supabase; no new dependencies.
**Spec:** User-approved joining options in this conversation; SSO deferred until a school needs it.

## Constraints and review focus

- Default behavior remains unchanged until a school administrator enables roster requirements.
- Only MFA-authenticated school admins manage their school's roster; no public roster endpoint.
- Emails only, up to 1,000 unique entries per school; no names, grades or IDs.
- Require explicit review confirmation for full replacement and optimistic version checks to prevent stale overwrite.
- Missing roster eligibility pauses student access regardless of invitation or domain joining; it never deletes accounts, memberships or ideas.
- Staff access remains administrator-controlled, and revoked memberships cannot be restored by roster changes.
- No real school roster or rule will be changed during deployment.
- Per host instruction, do not add/run tests unless the user requests them. Use build/typecheck, source review and installed migration metadata; report unverified runtime behavior.

## Tasks

- [x] Add migration `202610180003_school_enrollment_rosters.sql`: private policy/roster tables, service-only administration functions, shared eligibility helper, role checks, account membership summaries and domain join eligibility.
- [x] Add roster parser and admin routes/settings partial: validate the whole list before a transaction, preserve rejected input, show current mode/count and replacement warning, require confirmation/version.
- [x] Update school resolution, directory and account landing: deny paused students with a useful explanation, keep staff routing, display pending roster matches without a join action.
- [x] Build/typecheck, review access callers and grants, apply migration before deployment, publish code, document administrator setup and limitations.

## Delivery evidence

Build and typecheck passed; local desktop/mobile previews reviewed. Migration recorded on the configured hosted project, both private tables have RLS and no direct anon/authenticated reads or service writes, with zero configured rosters/rules. Accounts and memberships remained at 11 each across migration. No automated tests or real enrollment workflows were run.
