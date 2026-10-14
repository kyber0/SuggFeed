# Express UI/UX audit — October 14, 2026

Scope: the currently used Express/Eta app, its student/staff pages and shared panels. Audit uses local fixtures, not production accounts or database records. The retained Next.js application is not the deployed interface covered by this pass.

## Evidence and root causes

1. **Mobile staff navigation disappears.** Opening Workspace menu at 390px hides Review submissions, Manage work, Follow-ups, Analytics and Manage staff. `components.css` has a legacy media rule hiding all anchors pointing to `/admin` or `/admin/*`, even inside the new mobile sidebar. Query-string queue links survive, making the menu inconsistent. Fix the original rule; keep desktop primary navigation's existing mobile class rule.
2. **Signed-in headers overflow at 320px.** Profile with a long display name, Notifications, Inbox and some staff pages extend the document by 9–17px. The header reserves a fixed avatar/name chip plus a nonshrinking brand and theme button. Give the nav a shrinkable boundary and shorten the visible name on narrow phones; the account menu still exposes the full identity.
3. **Guest Profile icon has no accessible name.** The label is hidden on mobile and its SVG has no text alternative. Chromium's accessibility tree exposes an unnamed link. Give the anchor an explicit name.
4. **Text contrast fails in both themes.** Sign-in and primary buttons have white text on orange at 3.11:1 in light and 2.80:1 in dark, below 4.5:1 for small text. Completed badges are 4.21:1; dark completed dates are 2.24:1. Dark blue text on dark surfaces, inactive profile counts and report actions also fail. Add semantic foreground/fill choices and repair the affected styles; preserve brand artwork.
5. **Touch targets are too small.** Roadmap support controls measure 20–25px high, analytics ranges 27px and staff page-submit buttons 30px. Increase operable controls to 44px on mobile and verify cards still reflow. Compact cards that already stretch a title control across the card should keep that behavior.
6. **Overlapping modal keyboard handlers compete.** Opening authentication above the submit editor sends Tab focus back into the lower editor. Native roadmap dialogs also occupy the browser's top layer, above the existing CSS-only auth overlay when a guest clicks Follow. Use native auth dialog semantics and let lower custom keyboard handlers yield to active native dialogs.
7. **Rejected auth promises can strand buttons.** Sign-in/sign-up await SDK calls after disabling their buttons, without try/finally. A rejected promise leaves the button disabled and no visible recovery. Keep pending state guarded, catch errors, restore buttons and show feedback inside the auth dialog.
8. **Legal pages display JSX syntax.** Privacy and Terms contain literal `{" "}` in Eta prose. Remove the migrated JSX whitespace artifacts.
9. **Category keyboard focus is not visible.** Submission radios are opacity-zero and lack a corresponding focused-card outline. Render a visible focus ring around the existing label, retaining native radio semantics.

## Coverage and limits

Initial browser scan: 26 page/state routes × four widths (320, 390, 768, 1440) × two themes = 208 combinations. It checks document overflow, visible controls, opaque text/background contrast and browser errors. Color checks disable transitions to measure final states and skip gradients/translucent blends; they do not establish WCAG conformance. The preliminary DOM name heuristic produced false positives for closed disclosures; the actual missing Profile name was confirmed with Chromium's accessibility tree.

Read failures, empty lists, password recovery forms, modal nesting and keyboard flow are checked separately. Auth provider behavior, email delivery, production latency, private account records and mobile operating-system accessibility are not verified here. External accessibility package download was unavailable, so the audit uses browser geometry/accessibility data and explicit regression assertions rather than claiming an axe scan.

## Implemented outcomes

- Removed the legacy global rule hiding staff links on mobile; narrowed the account chip at phone widths and tightened header gaps at 801–960px.
- Added the guest Profile link name and visible category-radio focus outline.
- Added separate orange action-fill tokens, readable status/foreground pairs, and corrected dark-mode completed dates, Today marker and discussion CTA.
- Increased mobile roadmap support, analytics range and staff pagination hit areas to 44px.
- Made authentication a native top-layer dialog; underlying custom handlers yield while it is open. Feedback stays within auth, including sign-up email confirmation over the roadmap. Async messages and panel changes are scoped to their originating open/tab generation; originating buttons recover even if the user switches tabs.
- Removed JSX whitespace artifacts from legal pages. Policy accuracy, contact ownership and retention commitments were not part of these rendering fixes.

## Reproduce locally

From `apps/web-express`, start `node -r ts-node/register/transpile-only tests/support/ui-audit-preview.ts`. In a second shell run `python tests/browser/ui-ux-audit.py` for assertions, or `python tests/browser/ui-ux-scan.py` for the 208-combination diagnostic scan. The scripts use local fixtures and abort external requests.

UI UX Pro Max searches supported readable color pairs, visible focus and touch-friendly web controls. No verified dataset result specifically covered nested native-dialog semantics; the implementation uses the browser's native dialog behavior and direct interaction tests. The closest HTML stack reference was used as general HTML/CSS guidance, without introducing Tailwind.

## Final verification

- Full Express build, strict client checks and test TypeScript compilation passed.
- 24 existing client tests passed (auth, recovery, keyboard events, header, preferences and roadmap).
- All 13 browser regression tests passed. UI assertions cover navigation at 320/390/768px, landscape/tablet at 801/844/900/1024px, foreground contrast in both themes, 44px mobile controls, nested modals, SDK rejection recovery, stale async feedback, signup confirmation, radio focus and legal rendering.
- The final 208-combination scan reported no document overflow, no script errors and correct nested-auth focus. Its last remaining staff password-toggle contrast case was reproduced and corrected, then covered by a dedicated regression.
- An independent reviewer found two auth issues; both were reproduced in failing tests and fixed. No minor suggestions were deferred. The reviewer did not validate legal policy accuracy or production auth/email operations.

No production sign-ins, email sends, database writes or migrations were used. Git publication and live deployment completion are separate outcomes.

Execution decisions: used the existing workspace and existing authorization to push to main. Legal policy wording beyond visible rendering artifacts remains unchanged and needs owner validation; this pass does not establish its accuracy. No minor review findings were deferred.
