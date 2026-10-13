# Scrollbars, notifications and email presentation

## Scrollbars

The shared UI stylesheet sets rounded scrollbar thumbs for the page and nested
scroll areas, with separate light and dark colors. The page reserves scrollbar
space to reduce shifts when opening a dialog. System colors take over in forced
color mode. The auth card now shows a scrollbar when its content overflows.

## Toast notifications

All Express toast callers, including sign-in, use the same notification stack.
Three notices are shown at once; further notices wait, and exact duplicates are
ignored while visible or queued. Information and success notices last six
seconds, warnings last nine seconds, and errors remain until dismissed. Timers
and progress pause on hover, keyboard focus, or a hidden browser tab. Dismiss
buttons support keyboard focus; mobile notices sit above the bottom navigation.
Messages and titles are inserted as text. Routine notices use polite status
announcements; errors use alerts. Motion follows the reduced-motion preference.

## App confirmations

Submission validation and staff-role errors use the shared toast handler.
Browser JavaScript alerts and confirmations have been replaced throughout the
Express client. Saved-search deletion, clearing tracking codes, draft recovery,
queue removal and staff actions use a themed confirmation dialog. Cancel receives
initial focus; Escape cancels only this dialog, and focus returns to its trigger.
Changes still require confirmation before destructive writes. Staff filter forms
wait for confirmation before navigating; cancellation keeps the selection.
The browser's own unsaved-work warning when leaving a page remains necessary:
browsers control that navigation prompt and do not allow custom content there.

## Existing custom emails

The existing authentication designs live in `supabase/templates`. Review and
comment notifications share `supabase/functions/_shared/notifications.ts`.
These designs now include inbox preview text, responsive spacing, dark-mode
styles where supported by the mail client, and a solid header color fallback.
Authentication links and Supabase template variables are preserved.

Weekly digests now send matching HTML alongside their existing plain text.
The renderer escapes public notification fields and requires HTTPS links.
Delivery still uses the existing opt-in, pause, kind filters, verified addresses,
claiming and idempotency controls. The footer links to email preferences and the
existing signed unsubscribe flow.

[Open the sample weekly digest](email-previews/weekly-digest.html). It contains
fictional school updates and no real account data. Its unsubscribe link points
to preferences so opening the preview cannot unsubscribe anyone.

## Publishing

The web changes take effect with the next Express app deployment. Shared review
and comment email changes require deployment of the Edge Functions that import
the shared notification helper. Authentication template changes must be published
under Supabase Authentication email templates; committing these files does not
update hosted Auth settings. This change does not send messages or enable a
scheduler, email opt-in, or a new delivery provider.

Compilation: `npm run build` in `apps/web-express`. Automated tests were not run
for this UI refinement.

## Password recovery callback

The Express callback reads Supabase's PKCE recovery intent or the implicit
`type=recovery` fragment and shows a new-password form. Recovery sessions do not
enter the normal profile redirect or server-session sync until the password has
been updated. The update verifies the current account, confirms matching inputs,
and keeps failures on the form. A successful update offers a link to the profile;
a subsequent cookie-sync error is reported separately from password-update errors.

Callback credentials are removed from browser history. The PKCE flow identifier
is passed to code exchange before URL cleanup can lose it. A short-lived,
account-bound session-storage marker lets the reset form resume after a reload;
expired or incomplete links cannot fall back to an unrelated existing sign-in.
Reset cancellation signs out. Normal OAuth return navigation is preserved.
Focused auth checks use mocked Supabase sessions and never send reset emails or
change production passwords.
