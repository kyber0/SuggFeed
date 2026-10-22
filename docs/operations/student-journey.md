# Student journey

Students use Home, Ideas, Submit and My activity. Progress is a child destination
of Ideas, linked from both the idea feed and the existing roadmap route. School
updates and private messages remain within My activity's shortcuts. Existing
URLs continue to work; disabled roadmap access is still controlled by school
configuration. Account and platform screens do not display student bottom tabs.
The school wordmark returns to that school. A school switch action appears only
when the account has multiple active memberships; no additional membership read
is added to school resolution. Authorization still selects the current school's
active role and applies its existing enrollment and publication checks.

Direct school links keep their intended school through sign-in. If membership is
missing, account routing opens the school directory with the school's name filled
in. Existing confirmed-domain, approved-email-list and access-request operations
provide the join action. Matching never creates membership on a GET request.
Private school pages show a sign-in/join destination without exposing community
content. Pending access requests explain that another request is unnecessary.

Students can draft before signing in wherever school publication rules allow.
For a named submission, sign-in is requested before sending. The current draft,
category and supported custom answers/image references are kept in school-scoped
session storage for at most 30 minutes during authentication. On return, the form
opens for review. Consent is not restored and the idea is never automatically
submitted. This temporary handoff does not replace an explicit saved draft or
change submission receipts, retries or account permissions. Storage failure
stops sign-in navigation with a message so current text can be copied first.
Drafts belonging to another previously signed-in account are not auto-restored.

The handoff works in the original tab and browser. Confirming email in another
tab/device does not transfer draft text there; return to the original tab. The
existing opt-in seven-day saved draft remains available separately. Closing the
original tab, blocking browser storage or waiting past expiry can lose the
transient copy. No credentials, consent, tracking codes or receipt actors are
included in the draft payload. Uploaded references retain existing expiry rules.

Receipts explain school review and point named submissions to My activity.
Anonymous submissions retain private-code tracking, also linked from My activity.
No school response deadline is promised.

## Delivery checks

Express type checking and production build passed. Local Chromium fixture
inspection covered Home, Ideas, Progress, My activity, School updates and Inbox
at 320, 375, 768 and 1440px, with no page overflow or JavaScript exceptions.
A local signed-in fixture reload restored title and description from an anonymous
draft, reopened the panel, and left consent unchecked. The four bottom destinations
were confirmed. The existing middleware test double was adapted for the own-account
membership list; no new tests were added and no automated test suite was run.

Real Google/email confirmation, DNS joining, roster changes and production data
were not exercised. These remain live integration checks. Temporary drafts are
intentionally not transferred to another browser/tab; the signup message directs
students back to the original tab after email confirmation.
