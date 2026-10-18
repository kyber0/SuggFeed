# School invitation flow

## Use

- Platform dashboard → a school → **Invitations**. School administrators can also use **School settings → Member invitations** or **Manage staff → Manage invitations**.
- Choose the recipient email and Student, Moderator, or Administrator access.
- Send the branded email or create a private link. Sending does not create an account or grant membership.
- The recipient signs in or creates an account with that exact email, reviews the school/role, and accepts. Email verification is required. A valid invitation destination is also kept in the encrypted guest session so confirmation in a new tab of the same browser returns to the invitation. Wrong-account pages offer a safe switch-and-return action.
- Successful acceptance opens the school community for students or staff workspace for moderators/administrators. Existing staff MFA requirements still apply.
- Links expire in 48 hours and work once. Pending duplicates for the same school/email are blocked. Revoke an old link before creating a replacement; revocation does not remove an existing member.

## Email setup

The app uses its existing Resend transport configuration, independently of the weekly-digest switch:

- `RESEND_API_KEY`: a valid key authorized to send from the verified sender.
- `RESEND_FROM_EMAIL`: a sender address/domain verified in Resend, optionally `SuggFeed <address>`.
- `APP_ORIGIN`: the canonical HTTPS site origin, without credentials, query, or a path.

Set these securely in Vercel and the cloud environment. Redeploy for Vercel changes. Do not commit credentials or paste them in chat. No values are fabricated by this implementation. Without complete configuration, the UI disables email delivery and offers the private-link method.

The email includes school, role, access description, accept button, expiry in Philippine time, plain-text alternative, a fallback URL, and unexpected-invitation guidance. HTML is escaped; links must use HTTPS. A synthetic [HTML preview](../../apps/web-express/docs/email-previews/school-invitation.html) is included; its link is not a real invitation.

## Delivery and privacy

- “Email sent” means Resend accepted the message, not proof it reached the inbox. Inbox/bounce tracking requires provider delivery events and is not claimed here.
- Rejected requests show “Email not sent.” Timeouts, server errors, and ambiguous provider responses show “Email delivery unconfirmed”; no automatic duplicate send is attempted. The same one-time link remains available in the creation receipt.
- The provider idempotency key is the unique invitation ID. Only a token hash is stored in invitation records. The raw link is exposed once in the creator’s existing encrypted server session, then removed when the receipt is rendered.
- Recent history is limited to 50 records for the verified school admin. It exposes no token hashes or reusable links. Recipient previews mask the email; acceptance rechecks verified email, current inviter authority, current policy review, expiry, revocation and existing membership.
- No real email or live invitation is sent by the automated checks. Sender credentials and a controlled real mailbox check are still required to verify delivery.

## Verification — 18 October 2026

- Typecheck, production build, and all 263 automated tests passed (zero failures/skips).
- Chromium checked 36 page states across 320, 390, 768, and 1440px, plus dark mode, copy feedback, wrong accounts and expired/member states.
- Migration `202610180001_school_invitations.sql` applied as hosted migration 46. Existing accounts and invitation records were retained.
- Hosted rollback-only probe: 27 checks passed, including invitation creation/history privacy, recipient matching, revocation, and prior submission/tenant boundaries. Before/after snapshots matched; no synthetic records persisted.
- Probe SHA-256: `bed1b1e39589dc62b823f602f93edf0d1ccc3413b78c9a38d8632f4d2ad2918c`. Captured 2026-10-18T04:15:19.242Z UTC.
- Independent read-only review found no material blocker in permissions, token privacy, acceptance/revocation locking, redirects or email status handling.
- No real mailbox delivery was exercised. Sender credentials were not available in the execution environment.

Live deployment: `259401e` pushed to `main`. Production health returned 200; the invitation manager required sign-in (401); an unknown token showed the new unavailable screen (404); the new invitation assets and confirmation-return markup were present; strict-origin privacy headers and foreign-origin rejection (403) were retained. These checks created no invitation and sent no email.
