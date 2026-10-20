# Confirmation email and admin workspace cleanup

## Confirmation and branding

Added SuggFeed logo images to invitation/digest HTML and versioned Supabase confirmation/recovery templates. Logos use the public HTTPS image with alt text; email clients may still block remote images until the recipient allows them.

Existing sign-up uses PKCE, whose code exchange depends on the initiating browser's verifier. Added `/auth/confirm` for signup token-hash confirmation, independent of that verifier. The new template puts its credential in the URL fragment; the page removes it immediately, keeps it only in memory, and requires an explicit Confirm action. No confirmation happens merely because an email scanner opens the page. Supabase verifies the token, then the existing server session endpoint verifies the resulting access token and regenerates the session when identity changes. The browser's Google account is not used to choose the confirmed account. Recovery retains its numeric-code flow.

The page explains any existing signed-in account, reports expiry/used links, and provides a bounded resend form. Confirmation remains required. No passwords, Auth keys or tokens are added to Git. Template activation must follow deployment of the new route; older emails keep their original flow and newly requested emails use the new template after activation.

## Workspace

Removed the separate school banner. Kept a compact desktop school identity beside the header and school settings/customization/invitation links in the school-admin dashboard; existing sidebar access remains. Review queue rows use one native title button with a full-row hit target, no duplicate Review action, compact inline category/title and a one-line description. J/K still focus the idea buttons.

Replaced workspace grab-hand cursors with native move/selection cursors. Theme changes in the studio now patch the current iframe rather than navigating/refetching the preview, including a ready-state race safeguard. This reduces waiting for theme switches; it is not a measurement of every production cold start.

## Verification

Full Express type checking and production build passed. Local Chromium inspected confirmation with a different fictional signed-in account: the token fragment was removed and explicit confirmation remained required. The logo loaded in rendered email HTML. Admin rows measured 94px in the fixture, had no duplicate Review button/banner, and clicking row space opened the existing review dialog. Confirmation fit 375px without horizontal overflow. Screenshots inspected.

No automated test suite was added or run. No real confirmation/reset/invitation/digest email was sent during this work. Real mailbox delivery and cross-browser confirmation still need user verification. Supabase template activation status is recorded below after deployment.

## Rollout status

Application changes pushed as `fbfe2c5`. After the deployment became available, `/auth/confirm` returned HTTP 200 with the confirmation control, and its page referenced the configured Supabase project. The public logo asset is available. Activated the exported confirmation and recovery templates through the Supabase management API (HTTP 200), then read back both exact template contents successfully. Email confirmation remains required (`mailer_autoconfirm` false). Existing SMTP credentials and sender were unchanged. Previously issued emails retain their old links; request a fresh email to use the new flow. Real mailbox delivery and end-to-end confirmation remain unverified.

Additional local inspection confirmed dark/light switching retained the same iframe URL and updated the theme immediately, and the staff work card's computed cursor was `move`.
