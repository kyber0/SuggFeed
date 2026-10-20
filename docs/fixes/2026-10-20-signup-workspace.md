# Signup and workspace fixes — 20 October 2026 (Asia/Manila)

## Confirmation email

Read-only Supabase Auth configuration showed custom Resend SMTP using the test sender `onboarding@resend.dev`, with confirmation required and no custom send-email hook. Changed only `smtp_admin_email` to the previously configured sender `invites@suggfeed.me`. Readback confirmed the sender change, existing Resend host/username and mandatory confirmation. Credentials were not changed, copied into source or logged.

The test sender restricts delivery to Resend's account owner; it is unsuitable for general signup. The specific delivery error could not be independently retrieved from provider logs, and this does not establish that every possible delivery failure is fixed. Resend's domain API was blocked by this environment's network policy; direct DNS queries were also unavailable. No email was sent, no account created and no confirmation requirement bypassed by this diagnostic. User retry/inbox delivery remains the final external check. Existing Auth email rate limits were retained.

Signup now gives a clear confirmation-delivery error and retains entered values rather than displaying the provider's terse transport message.

## Native form origin

Helmet's default `no-referrer` policy caused a native Chromium form POST to send `Origin: null`. The shared origin guard correctly rejected it. The same local form under `same-origin` sent its real origin and was accepted.

Normal pages now use `Referrer-Policy: same-origin`; explicit sensitive auth/account policies remain unchanged. Cross-site referrers stay suppressed, and `sameOriginOnly` still rejects cross-site, mismatched and malformed origins. No null-origin exception or CSRF bypass was added. This shared fix covers native platform rollout/review and other normal-page forms. Old tabs must reload to obtain the policy.

## Layout

- Replaced the school banner's full-size content-card styling with a compact aligned context bar. Kept the demo warning in an accessible expandable disclosure. Mobile actions wrap without overflowing.
- Rebuilt customization reviews using the existing platform dashboard hierarchy, padded card headings, clear access status, aligned actions, bounded text and an organized policy/form review section. Approval and role/MFA requirements are unchanged.
- Updated generated style/client assets and cache-version URLs.

## Checks

Node 22 full type checking and production build passed. Local fictional browser previews were captured and visually inspected at 320, 375, 768 and 1440 px without horizontal overflow. Desktop banner height is 62 px; mobile layout wraps naturally. Local native form inspection reproduced the old origin failure and accepted the corrected policy; the fictional rollout action returned to the review page. No hosted rollout setting or school data was changed during those checks.

No automated tests were added or run for this follow-up. Live signup/inbox delivery, production rollout actions and Safari/Firefox remain unverified.
