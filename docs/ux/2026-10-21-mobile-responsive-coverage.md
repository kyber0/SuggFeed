# Mobile screen coverage — 21 October 2026

All 32 page templates are represented by 94 named screen/state fixtures.

**1,316 / 1,316** final portrait/landscape checks passed. An additional **188 / 188** coarse-pointer/mobile-emulation checks passed at 320px and 430px, and **94 / 94** desktop geometry checks passed at 1440px.

Checks: correct fixture response; requested overlay/state actually opened; document width; uncontained bounds; visible input text at least 16px; visible button/disclosure/navigation/action targets at least 44px; same-layer overlaps; reachable close actions; dialog viewport bounds. Inline prose links are excluded from touch-size assertions. Local scroll containers and intended overlay layers are treated separately.

Each cell is **portrait / landscape**. `Fixed` = a failing, comparable baseline check now passes. `OK` = baseline and final pass. `Checked` = no equivalent baseline state, or tablet landscape changed from 844px to the correct rotated 1024px width. These statuses describe browser checks, not physical-device certification.

| Screen / state | 320 | 360 | 375 | 390 | 412 | 430 | 768 |
|---|---|---|---|---|---|---|---|
| home | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| feed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| feed-empty | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| idea | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| profile | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| profile-long-name | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| profile-guest | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| inbox | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| notifications | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| roadmap-board | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| roadmap-tree | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| roadmap-timeline | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| roadmap-done | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| roadmap-empty | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| admin | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| admin-empty | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| work-board | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| work-empty | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| staff-community | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| analytics | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| staff | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| staff-login | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| schools-guest | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| schools-empty | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| schools-memberships | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| settings | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| invitations-empty | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| invitations | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| invitation | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| invitation-expired | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| platform-empty | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| platform | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| customization-reviews | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| form-responses | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| form-answers | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| school-notice | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| school-message | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| security | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| callback | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| recovery | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| confirmation | Fixed / OK | Fixed / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| unsubscribe | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| privacy | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| terms | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| 403 | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| 404 | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| 500 | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| studio | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| signin | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| signup | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| forgot | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| submit | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| submit-description | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| submit-review | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| idea-drawer | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| roadmap-detail | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| staff-review | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| staff-progress | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| staff-notes | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| confirmation-dialog | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| report-dialog | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Fixed | OK / Checked |
| security-setup | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| new-password | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / OK | OK / Checked |
| studio-components | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| studio-properties | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| studio-publish | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| studio-history | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| studio-conflict | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| school-application | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| platform-policy | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| save-view | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| revoke-staff | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| work-record | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| account-menu | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| feed-menu | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| roadmap-view-menu | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| staff-menu | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| tracking | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| toast | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| submit-recovery | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| studio-controls | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| studio-theme-fields | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| keyboard-signup | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| keyboard-submit | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| school-submit-form | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked | Checked / Checked |
| school-home | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | OK / Checked |
| school-feed | OK / Fixed | OK / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | OK / Checked |
| school-roadmap | OK / Fixed | OK / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | OK / Checked |
| school-idea | OK / Fixed | OK / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | OK / Checked |
| school-profile | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |
| school-submit | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | OK / Checked |
| school-notifications | OK / OK | OK / OK | Fixed / OK | Fixed / OK | Fixed / OK | Fixed / OK | OK / Checked |
| school-inbox | OK / Fixed | OK / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | OK / Checked |
| school-staff | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Fixed | Fixed / Checked |

## Reproduction

From `apps/web-express`, start `tests/support/mobile-preview.ts` as described in the audit, then run:

```sh
python tests/browser/mobile-responsive.py --screenshots --output /tmp/sf-mobile-audit/release
python tests/browser/mobile-responsive.py --widths 320,430 --portrait-only --touch
python tests/browser/mobile-responsive.py --widths 1440 --portrait-only --desktop
```

No physical iPhone/Android tests were performed. See the real-device checklist and existing contrast-test limitations in [the full audit](2026-10-21-mobile-responsive-audit.md).
