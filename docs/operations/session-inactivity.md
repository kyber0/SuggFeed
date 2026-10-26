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

The anonymous web session retains a fingerprint for user feedback, but the
security decision is also stored independently in `provider_idle_sessions`.
A hash of the verified provider session ID and account ID identifies the record.
Cookie deletion, a new web session and access-token refresh therefore cannot reset
an expired provider session. A fresh provider sign-in creates a different record.
Manual signout revokes the corresponding application record too.

The table stores the opaque fingerprint, account ID, last activity and revoked
flag. It stores no access or refresh token. Account deletion cascades to these
records, and a deleted identity cannot recreate one. Only the service-only RPC
can operate on them; browsers and the service role cannot read the table directly.
The application fails closed if that RPC is missing, unavailable or malformed.
Background checks never extend activity; the database locks each record before
checking or updating its 30-minute deadline.

This does not independently revoke provider JWTs for other clients or sign out
other devices. Do not purge an expired guard merely because its web cookie ended:
the old provider session may still issue credentials. Operators must tie guard
retention/cleanup to confirmed provider invalidation and issued-token expiry.

Previously untracked authenticated sessions receive one 30-minute grace period on
first use. The corresponding SQL policy is fixed at the agreed 30 minutes; the
browser warning constants live in `apps/web-express/src/lib/session-idle.ts`.
No new environment variable is required. Apply migration
`202610260004_provider_idle_sessions.sql` before deploying this app version.

## Unsaved work and failure handling

The warning gives users time to continue or save. Existing submission recovery is
invoked before the browser redirects; this does not promise autosaving all staff
or customization edits. Expiry never retries a mutation or submits a draft.

If the session cannot be checked by its last known deadline, the browser signs out
locally rather than extending access offline. Multiple tabs share activity notices
and query server state. Without JavaScript, the server still rejects expired
sessions on the next request, but cannot clear an already-rendered offline page.

## Verification

The security follow-up adds direct HTTP checks for cookie loss, refreshed tokens
and fresh sign-in; database-role checks for expiry, non-revival, owner mismatch
and denied access; and optional local browser checks for the warning, logout,
explicit continuation, Studio iframe activity and another tab's activity.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/check-session-idle.cjs
```

The optional check uses synthetic local sessions and a controlled clock; it does
not exercise production accounts. See the current security follow-up report for
actual run results. The added provider-session lookup has not been benchmarked
against production latency.
