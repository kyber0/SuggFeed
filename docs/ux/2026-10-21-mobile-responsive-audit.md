# Mobile responsive audit — 21 October 2026

## 1. Scope and missing information

SuggFeed's deployed application is Express + Eta + TypeScript and modular CSS. This audit uses the real templates and generated CSS/JS, with local fictional fixtures for students, moderators, school administrators and platform operators. There are no React/Tailwind components in this implementation. The optional Next application is not the deployed Express UI.

The user supplied the full audit requirements after clarification. No new broken-screen screenshots or physical devices were supplied. Browser automation is not a substitute for testing the operating-system keyboard, Safari, Android browser chrome, or a low-end phone.

No hosted accounts, memberships, ideas, settings, emails, or database records are changed by the fixture server or browser audit. External requests and service workers are blocked in the browser audit. This verifies rendering and interaction geometry, not production authentication, delivery or authorization.

## 2. Screen inventory and test matrix

Every one of the **32 page templates** has a local route in `tests/support/mobile-preview.ts` or its existing UI/workspace fixtures:

| Area | Screens and variants |
|---|---|
| Student community | Home, feed, empty feed, standalone idea, profile (member/guest/long name), notifications/preferences, private inbox, tracking |
| Roadmap | Board, tree, timeline, completed, empty, view menu, idea/progress dialog, work-record drawer |
| Staff | Review queue and empty queue, Manage Work and empty board, community reports/clarifications, analytics/chart data, staff/student directory, staff login |
| Accounts | Sign-in, sign-up, forgotten password, callback, recovery, new password, email confirmation, authenticator verification/setup |
| School administration | School directory (guest/empty/memberships/domain match), workspace application, school policies/contacts/access, domains, enrollment roster, invitations (empty/populated/receipt), invitation acceptance/expiry, private form response list/detail |
| Platform | Dashboard (empty/populated), application review, policy review, customization grants/form reviews |
| Customization | Editor, controls disclosure, components sheet, properties sheet/theme fields, publish/history/conflict dialogs; actual school home/feed/roadmap/idea/profile/submission/updates/inbox/staff previews |
| Legal and recovery | Service privacy, terms, school notice, workspace message, unsubscribe, 403, 404, 500 |
| Shared overlays | Auth dialog, submission wizard (category/details/review/expanded recovery), idea drawer, report dialog, confirmation, save-view dialog, revoke-access dialog, account/feed menus, staff navigation, toast |

Fixed/sticky elements reviewed: header, bottom tabs, staff sidebar/disclosure, table headings, school-settings navigation/save area, platform navigation, drawer/dialog headers and actions, editor toolbar/canvas/properties sheets, dropdowns and toasts. No cookie banner or chat widget exists in this app.

Required portrait widths: **320, 360, 375, 390, 412, 430, 768**. Phone fixtures use height 844; the tablet uses 1024. Landscape rotates those sizes (844 × phone width; 1024 × 768 for the tablet). Desktop smoke checks use 1440 × 844. Coverage results are in the companion generated matrix.

## 3. Findings: root causes and priority

| Screen/component | Reproduction | Root cause | Fix | Priority / effort |
|---|---|---|---|---|
| Whole app | Any width | `html { overflow-x:hidden }` concealed descendant overflow | Remove the global mask; retain explicit local scrollers for tables, canvas and timelines | Must fix / S |
| Confirmation card | 320–360 | Unbroken account email could exceed its card | Inherit `overflow-wrap:anywhere` from the shared text baseline; bound account card content | Must fix / S |
| School application | 320–375 | Native inputs had intrinsic widths instead of the form's available width | Width/max-width 100%, min-width 0 and existing input styling on the actual application fields | Must fix / S |
| All school headers and editor previews | 320–430 | Later `.school-context-identity {display:flex}` overrode the mobile header rule | Remove the duplicate display declaration from customization CSS; header owns its visibility | Must fix / S |
| Home school-category controls | 320–375, long custom category | Short-label assumption: nowrap pill and intrinsic wrapper width | Bound wrapper/pill, allow wrapping, auto pill height, preserve supporter/count space | Must fix / S |
| Roadmap view dropdown | Phone landscape | 320px menu right-aligned to a small trigger extended 13px past the left edge | Position relative to the whole navigation container; cap to its width; use dvh height | Must fix / S |
| Form controls across app | Phone landscape and several portrait forms | Width-only mobile overrides and later feature CSS reduced input fonts below 16px | Shared 16px floor through tablet width and on coarse pointers | Must fix / S |
| Auth dialog close action | Short landscape / keyboard | Close action shared the field scroll region; a sticky overlay could cover another button | Separate close row and independently scrollable auth body | Must fix / M |
| Submission wizard | Short landscape / expanded recovery | Legal notice and recovery section lived outside the step scroller; the active step had only 44px left | One scroll region contains notices, recovery and steps; footer remains a separate flex item; update step scroll-reset callers | Must fix / M |
| Review and roadmap dialogs | 844 × 320 | Fixed headings/tabs/footer left a 46px review region or 96px roadmap region | On short viewports let the dialog scroll as one document; keep the close header sticky | Must fix / M |
| Fixed forms / virtual keyboard | Simulated 320px visible height | Layout viewport could stay tall; narrow sheets no longer use the desktop centering transform | Track visualViewport with frame-coalesced listeners; bound and top-align open forms to the visible area; flowing dialog content | Must fix / M |
| Buttons / navigation / menu controls | 320–430 and landscape | Component-specific 30–40px sizes defeated generic touch styles | Shared 44px minimum floor for buttons, disclosures and action/navigation links, retaining visible focus and existing per-component actions | Must fix / S |
| School form answers | Long URL/answer | Header and card touched the viewport edges; dynamic answers needed bounded gutters | Reuse the responsive page primitive and shared wrapping | Must fix / S |
| Tablet editor components rail | 1024–1279 landscape | The default hidden rail was never shown by the explicit open state | Let explicit open state override the tablet default | Must fix / S |
| Editor chrome | 320–430 | Four tiny select columns plus toolbar rows left little room for the preview | Collapsible Preview controls; 2-column controls when open; 44px controls; larger color fields | Nice to have / M |
| Preview badge | Narrow preview | Fixed fictional-preview badge overlapped bottom navigation | Raise badge above bottom tabs with safe-area allowance | Must fix / S |
| Body copy | Mobile | Previous mobile-type rules intentionally reduced several descriptions to 12.5–13px | Restore those body descriptions to 14px; keep metadata distinct and inputs at least 16px | Nice to have / S |
| Analytics tables | Mobile | Table data deliberately wider than the page, but keyboard scrolling was not named/focusable | Reuse local scroller; add focusable named region; keep visible existing scroll hint | Nice to have / S |

### Before / after evidence

The initial unmasked baseline ran 1,106 screen/viewport combinations. This includes 16px input checks as well as overflow; a failed row does not necessarily mean page overflow. Later passes added touch targets, overlap checks, open-menu states and simulated keyboard checks. Do not compare failure totals as identical test sets.

Concrete baseline measurements:

- Confirmation document width: **370px at a 320px viewport**.
- Open school application document width: **389px at a 320px viewport**.
- School home/category controls: **391px at a 320px viewport**.
- School header/avatar: **407px at a 375px viewport**.
- Landscape roadmap view menu: **left edge −13px**.
- Review scroll region: **46px at 844 × 320**; the fix removes that constrained region on short screens.
- Submission step: **44px at 844 × 320**; the fix includes notices/recovery in the same flowing scroll area.

Before/after JSON and 360px screenshots are generated outside Git under the chosen `--output` directory. The companion coverage matrix records the final results. Inspect screenshots alongside measurements: zero document overflow alone does not prove a usable screen.

## 4. Global baseline

`reset.css` keeps the existing border-box reset, removes the root overflow mask, adds inherited long-text wrapping, bounds raster/video/canvas media, allows fieldsets to shrink, and gives preformatted content its own scroll region. Do not globally constrain table intrinsic widths: analytics tables must retain legible columns inside their local scroll container.

`responsive-primitives.css` supplies page gutters, action groups, scrollable tables, constrained sheets, action-bar safe-area padding and the shared touch/input floors. Inline prose hyperlinks keep normal text flow; connected tab/segmented controls keep their grouped appearance. Standalone action groups and bottom tabs use explicit gaps. The 44px/16px accessibility floors intentionally override older feature-specific sizes at mobile/tablet widths. There is no body-wide overflow clipping workaround.

`responsive.ts` updates visible viewport CSS properties once per animation frame on visualViewport resize/scroll, removes those listeners on pagehide and reattaches on pageshow. `interactive-widget=resizes-content` helps supported Android browsers resize the layout viewport when opening the keyboard. Safari still requires physical-device verification.

## 5. Exact fixes and verification

The ready-to-use fixes are in the application source, not illustrative React code:

- `public/css/modules/reset.css`: shared sizing, wrapping and media baseline.
- `public/css/modules/platform.css`: `.school-directory-section form` bounded controls.
- `public/css/modules/customization.css`: remove duplicate school-identity display ownership.
- `public/css/modules/pages.css`: `.sf-sort-dropdown-wrap`, `.sf-category-pills`, `.sf-cat-pill`.
- `public/css/modules/full-detail.css`: roadmap menu anchoring.
- `public/css/modules/submit.css` and `views/partials/submit-panel.eta`: shared `.sip-scroll-body`.
- `src/client/submit-panel.ts`: reset the actual shared scroller when changing steps.
- `public/css/modules/responsive-primitives.css` and `src/client/responsive.ts`: touch, landscape and keyboard behavior.
- `public/css/modules/school-studio.css`, `views/school-customization.eta`: editor controls and preview badge.

Verify a finding in DevTools by choosing its listed width, opening the listed form/menu, pasting the overflow diagnostic, and scrolling/focusing the last control. Expected: no page-level sideways scrolling, no menu beyond either viewport edge, reachable fields/actions, and no clipped long text. Test `844 × 320` specifically for the short-height flow. Use the keyboard simulations only to inspect the fallback CSS; test the real operating-system keyboard separately.

Desktop impact: normal desktop layout is retained. Long dynamic text can wrap, category pills can grow for long labels, analytics regions become keyboard-focusable, and 100vh surfaces use dynamic viewport units. Touch-enabled desktops receive the larger control floor. No permissions, content, routes or backend rules change.

## 6. Reusable components in the existing stack

Use semantic Eta markup with these shared classes rather than adding React:

```html
<!-- PageContainer: bounded page with 16px gutters -->
<main class="sf-main sf-page-container">...</main>

<!-- ResponsiveTable: retain native table semantics and label the scroller -->
<p>Scroll across the table to see all columns.</p>
<div class="sf-responsive-table" tabindex="0" role="region" aria-label="School records">
  <table>...</table>
</div>

<!-- ButtonGroup: stacked on mobile, wrapping inline on larger screens -->
<div class="workspace-actions sf-button-group">
  <button type="button">Cancel</button><button type="submit">Save</button>
</div>

<!-- BottomSheet: use the existing native dialog lifecycle/focus handling -->
<dialog class="app-confirm-dialog sf-bottom-sheet" aria-labelledby="sheet-title">
  <h2 id="sheet-title">...</h2>...
</dialog>

<!-- StickyActionBar: reserve as a flex sibling, not an overlay over the form -->
<footer class="staff-review-footer sf-sticky-action-bar">...</footer>
```

These are already used by form responses, analytics, report/confirmation dialogs and the staff review footer. `.sf-safe-bottom` is available for other bounded footer regions. The action-bar class supplies sizing/safe-area behavior; its parent component controls whether it is fixed or in normal flow.

## 7. Debug script and automated audit

Paste `scripts/debug-overflow.js` into DevTools. Red outlines mark uncontained candidates; orange marks descendants of a local clipping/scroll container. Use the console table to inspect the source element. A wide analytics table or editor canvas inside its own scroller is intentional. Call `sfDebugOverflow.clear()` to restore outlines. The script is never loaded by production.

Run from `apps/web-express` with the existing Node 22 dependencies and Python Playwright/Chromium installed:

```sh
npm run build
node -r ts-node/register/transpile-only tests/support/mobile-preview.ts
# In another terminal:
python tests/browser/mobile-responsive.py --screenshots --output /tmp/sf-mobile-audit/after
# Minimal widths requested for ongoing overflow regressions:
python tests/browser/mobile-responsive.py --widths 320,360,390,430
# Coarse pointer / mobile CSS smoke check:
python tests/browser/mobile-responsive.py --widths 320,430 --portrait-only --touch
# Desktop geometry smoke check (no mobile input/tap minimum assertions):
python tests/browser/mobile-responsive.py --widths 1440 --portrait-only --desktop
```

`--touch` enables mobile viewport behavior and coarse-pointer media queries. `CHROMIUM_PATH` overrides `/usr/bin/chromium`. `--origin` accepts localhost only. `--filter` selects a case, `--portrait-only` is useful for desktop smoke checks, and `--report-only` gathers a failing baseline without returning failure. Normal runs fail for bad fixture HTTP responses, document width beyond the viewport, uncontained overflow, undersized visible inputs/buttons, same-layer button overlaps or dialogs outside the viewport. Intentional backdrop/layer overlap and clipped local-scroller content are excluded. The suite never submits production forms. `--desktop` skips the mobile input/tap-size assertions while retaining geometry, overlap and dialog checks.

## 8. Real-device checklist — still required

- [ ] Low-end Android Chrome: native keyboard open/close, address bar collapse, category selection, file picker/camera, long feeds and timeline panning.
- [ ] iPhone Safari: keyboard and autofill/password-manager sheets, notch/home indicator, rotate with a dialog open, back/forward restoration, photo picker.
- [ ] Portrait/landscape: close buttons, final form controls and save actions remain reachable.
- [ ] Larger operating-system font size: labels do not collide with badges or icons.
- [ ] Browser zoom 200%: reflow and keyboard focus remain usable; horizontal scrolling is confined to data/canvas regions.
- [ ] Custom school palettes, long names and a missing image: fallback remains understandable.
- [ ] Reduced motion and slow device: no heavy background blur on coarse-pointer modal overlays; inspect scroll/animation smoothness and CLS on hardware.

Least certain: OS keyboard panning, native select/color/file pickers, safe-area insets, Safari-specific behavior and performance/CLS on low-end hardware. Chromium emulation cannot certify them. No new performance score or real-device result is claimed.

## 9. Coverage and remaining work

See `2026-10-21-mobile-responsive-coverage.md` for every fixture/state × width and orientation. “Fixed” indicates a reproduced baseline problem whose final check passes; “OK” means the implemented browser checks pass. Neither means all functional or device behavior is proven.

Protected operations and production transactions are outside this responsive audit. Full browser screenshots/results remain local artifacts; the source, diagnostics and reproducible tests are committed. There are no new runtime dependencies.

### Existing UI regression suite

The existing `tests/browser/ui-ux-audit.py` suite was also run. Four contrast subtest assertions fail in its color test. The exact same selectors and measurements were reproduced against an isolated, unchanged HEAD fixture: `#header-signin-btn` in light mode (1.0463), `.prof-save-btn` in light mode (1.0), `.prof-tab-count` in dark mode (1.8033), and `#jump-comment-count` in dark mode (1.8033). These are existing contrast/test limitations, not mobile-layout regressions. This task does not claim the full existing suite is green or alter unrelated brand colors to satisfy those assertions. The other test methods cover modal focus/escape, drafts, legal copy, safe text, analytics and empty states.

### Final verification

- Full Express type check and production build: passed on Node 22.
- Final screen/state matrix: **1,316 / 1,316** passed (94 states × seven widths × portrait/landscape).
- Coarse-pointer/mobile emulation: **188 / 188** passed (94 states × 320px/430px portrait).
- Desktop geometry smoke: **94 / 94** passed at 1440 × 844; mobile input/target floors are intentionally not asserted in this mode.
- Diagnostic JavaScript syntax, Python compilation and Git whitespace checks: passed.
- Initial-load CLS sampling: **0 before / 0 after** on eight representative routes at 360 × 844 with mobile/touch emulation, normal motion and 4× Chromium CPU throttling. Measured after fonts loaded and an 800ms settling period, with external traffic blocked. This does not measure a whole browsing session, long feeds, editor startup, real network latency or low-end hardware.
- Existing UI regressions: 18 methods ran; four contrast subtest assertions in one method fail identically on unchanged HEAD. No new failure was introduced by the responsive changes.

No database migrations or runtime dependencies were added. The original working checkout was preserved; changes were made in the isolated checkout used for prior fixes.
