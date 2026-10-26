# Inactivity logout

All authenticated accounts use a 30-minute inactivity deadline, including students,
moderators, school administrators and platform operators. At 28 minutes, a dialog
warns the user and provides Stay signed in and Sign out actions. The Studio has the
same policy as ordinary pages.

## What counts

- Visible, trusted pointer, keyboard, wheel or input events send a same-origin
  activity request, coalesced to at most one per minute per page.
- Genuine HTML document navigation renews an unexpired session.
- Stay signed in renews only a session that has not already expired.
- Background API reads, session checks, provider token refresh, hidden tabs and
  prefetch requests do not renew the deadline.
- Server time determines expiry; the warning timer uses the difference between
  server time and the returned deadline. Returning from a suspended tab or the
  back/forward cache checks the current server state.

The activity endpoint has a separate durable budget: 60 requests per account and
2,000 per IP per 15 minutes. Its category is independent of the 20-attempt login
budget. This supports ordinary multiple tabs without making every input event a
network request. The existing login and submission limits are unchanged.

## Security and persistence

`enforceIdleSession` runs after loading the encrypted session and before identity,
school or protected endpoint work. Expired server sessions lose their user and
provider tokens before protected work can run. Mutations receive a 401 response
with `SESSION_IDLE_EXPIRED`; they must not be replayed automatically.

The anonymous session retains a fingerprint of the previous verified provider
session. Browser refresh/restore cannot simply reattach that same provider session
through `/auth/session`; a fresh sign-in establishes a new provider session. Local
browser markers contain deadlines/flags, not credentials, and suppress automatic
restoration after expiry. They are a UX safeguard; the server deadline is the
security check. The existing cookie lifetime is not the inactivity allowance.

This controls SuggFeed's application session. It does not claim immediate global
revocation of every already-issued provider JWT or sign out other devices. A valid
bearer token remains a credential under the identity provider's own expiry rules.

Existing authenticated sessions without an activity timestamp receive one
30-minute grace period on their first request after rollout. No SQL migration or
new environment variable is required. Policy constants live in
`apps/web-express/src/lib/session-idle.ts`.

## Unsaved work and failure handling

The warning gives users time to continue or save. Existing submission recovery is
invoked before the browser redirects; this does not promise autosaving all staff
or customization edits. Expiry never retries a mutation or submits a draft.

If the session cannot be checked by its last known deadline, the browser signs out
locally rather than extending access offline. Multiple tabs share activity notices
and query server state. Without JavaScript, the server still rejects expired
sessions on the next request, but cannot clear an already-rendered offline page.

## Verification for this change

Target Node 22 type checking, production build and static boundary checks pass.
Automated tests and live/browser expiry checks were not run for this feature.
The earlier audit's 389 passing tests predate this change. Before deployment,
verify the 28-minute warning, 30-minute expiry, fresh sign-in, multiple tabs,
background token refresh and draft recovery on real browsers.
