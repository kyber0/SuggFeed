# Submission safety and quality

## Use

School administrators open **Follow-ups → Submission safety** (or `/s/{school}/admin/safety`). Tabs cover the private queue, urgent alerts, designated administrators, school-wide aggregate analytics, and append-only audit history. Moderators keep their ordinary work board and cannot use these safety tools. Current school membership and existing MFA checks remain authoritative.

Safety is separate from the existing progress workflow. `clear`, `flagged`, `hidden`, and `deleted` do not replace Planned, In progress, Completed, or Rejected. Clearing safety never publishes a pending submission. An administrator must review urgent items before the ordinary publication workflow can proceed.

Reports accept an optional reason and are unique per account/submission. At the configured threshold the submission is privately held; its progress stage is preserved. Review decisions require a reason and an expected version. Delete removes the main title/description, preserves a tombstone and related tracking, votes, replies, school answers, and audit records; this is not a full privacy-erasure operation.

Named owners open a pending item from **My activity**. Anonymous owners use **Your answers & images → Review or edit submission** from the original browser/receipt. Editing ends as soon as staff open review or change the workflow. Owner editing covers title, description, and category; existing versioned school answers/images stay intact and are scanned again. A stale edit retains text in the browser and returns a conflict. Existing urgent flags and outstanding reports cannot be cleared by an owner edit.

## Configuration and editable rules

- `src/lib/content-safety-config.ts`: comment/submission flag-or-reject modes; submission hourly limit (5) and cooldown (30 seconds); report hourly limit (20) and hide threshold (3); trigram similarity threshold (0.22), maximum 5 matches; in-app display and optional urgent email.
- `src/lib/comment-moderation-words.ts`: shared Tagalog/Taglish word list and safe exceptions. English data and recommended transformers remain supplied by **obscenity 0.4.6**. No second library or external classifier.
- `src/lib/urgent-rules.ts`: English/Tagalog phrase rules. These are heuristic review signals, not diagnoses or findings of fact.
- `src/lib/category-rules.ts`: keyword-to-active-school-category aliases. Explicit student choices win; omitted choices use rules and Other/first-active fallback. Category IDs stay canonical. Administrators can use Browse all submissions in the queue to override categories on clean items too.

**TODO for school staff:** finalize urgent keywords, designated administrators, response coverage, emergency/safeguarding contacts, and the escalation process. The contacts screen clearly marks the missing institutional contact as a placeholder. Default recipients are all active school admins; selecting specific admins restricts future alerts. Keep the in-app queue monitored. The application is not an emergency response service.

Detection failures log a constant error code and hold the submission privately. Full submission text/rule matches are not logged or sent to another service. Urgent detection overrides reject mode to preserve the concern for a human. False positives/negatives remain possible; update rules with staff feedback.

## Storage and enforcement

Apply `supabase/migrations/202610240002_submission_safety.sql` after `202610240001` **before deploying code**. It is additive: existing submissions start clear, accounts and memberships are preserved. New unchecked legacy inserts are held privately. It adds:

- Separate submission safety fields, optimistic version, and staff-review cutoff.
- School-scoped account/IP budget records and restricted creation/review/similarity RPCs.
- Private designated-recipient and notification tables with idempotent notification keys.
- Restrictive private-read policies, public queue filtering, safety-publication guards, and append-only audit enforcement.
- Database-native pg_trgm search, existing one-vote-per-user behavior, and aggregate analytics without a client-side row cap.

Browser Supabase roles cannot call safety mutation RPCs directly. The existing service-only tenant dispatcher supplies current school/actor; Express supplies trusted policy/verdict rather than accepting these from the request. SQL locks serialize receipt creation, quota charges, report counting, and owner/staff edits. Receipt replays do not spend another submission quota.

Public feed, activity/bookmarks, comments, similarity, notifications/digests, and media paths filter held submissions. Dynamic cache revisions change on submission updates. Previously issued storage signed URLs may remain usable for their existing 60-second lifetime; previously viewed/copied public content cannot be recalled.

Status changes produce generic private in-app updates to named owners, respecting current all/milestones preferences. Anonymous users retain capability-based tracking; no identity is added. Existing staff notes remain in their existing protected tracking flow. Urgent alerts never send an automated content response to the submitter. Native mobile push is not supported by this application.

## Optional email

No new environment variables or dependencies are required for the default in-app implementation. Urgent email is **off by default**. After school staff finalize escalation, the operator can enable `notifications.urgentEmail` using the existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and HTTPS `APP_ORIGIN`. It uses the existing sender/free allowance; no submission content leaves the system, only a generic alert and protected link.

Delivery uses per-notice idempotency keys, fresh admin/email verification, and an atomic claim. Failed/uncertain/processing notices require operator reconciliation; they are not blindly resent. The event-driven sender handles up to ten pending notices per urgent event, within the last 24 hours. Keep in-app alerts as the authoritative channel; use a monitored job before enabling email for schools with more than ten designated admins. No live email was sent during verification.

## Verification

Focused checks cover profanity/evasion/innocent words, urgent rules, categorization, direct HTTP input bypass attempts, receipt replay, quotas, unique reports/threshold holding, admin-only queue/analytics/audit, anonymous capabilities, staff review cutoff, sticky urgent flags, status notices, and migration execution without superuser privileges.

Local browser fixtures cover populated/empty queue, alerts, contacts, analytics, audit, owner editing and notices at 320, 375, 768, and 1440px, including escaped malicious text, long content, conflict preservation, and save feedback. Browser fixtures use invented data only. Real Android/iPhone keyboard and assistive-technology checks remain manual.

Run app `npm run typecheck`, `npm run lint:moderation`, `npm run build`, and the focused safety tests. The repository-wide suite has unrelated existing failures in stale UI assertions and browser VM mocks; compare failure names against baseline before release.

### Release evidence (2026-10-24)

- Type checking, scoped moderation lint, and production build: passed.
- Focused safety/HTTP/database checks: 35 passed; affected dashboard/profile regression checks: 4 passed.
- Full suite: 307 passed, 29 failed. Failure names match the prior 29-failure baseline; no new failures.
- Browser fixture matrix: 32 screen/width combinations passed with no page overflow or script errors; review conflict preserves its reason and owner save succeeds.
- No live user-content fixtures, mail, or push were generated during verification.
