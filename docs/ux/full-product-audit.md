# SuggFeed product UI/UX audit

18 October 2026 · Express app, desktop/mobile web and PWA

## Product context and method

SuggFeed lets school communities submit ideas, follow accountable school progress,
and exchange private clarifications. Students and guests need clear participation
and tracking; moderators need safe review/delivery tools; school administrators
manage access and policy versions; platform operators manage schools in a separate
workspace. English is the current interface language. Preserve the existing navy/
orange brand, Inter type, role boundaries, invitation-based membership and MFA.

The audit covers all source surfaces listed in `source-inventory.json`. It is a
source/component inventory, not a claim that every state was exercised in every
browser. Repeated cards share one source definition. The Next app is not the
production Express product and is not part of this audit.

## Role flows and friction

| Flow | Route / steps | Audit outcome |
| --- | --- | --- |
| Sign up / Google / email verification | Sign-in dialog → provider/email → auth callback → role-aware account home | Existing cancellation, expiry and retry states retained; local modal/error regressions checked. Real Google delivery requires the provider and a human account. |
| Recover account | Forgot password → email link or code → recovery → set password | Existing code-entry and recovery handling retained; no unused code added to emails. |
| Staff / platform entry | Sign in → authenticator → assigned workspace | Existing MFA and platform/client separation retained. No privileges changed. |
| Join a school | Invitation → matching verified account → accept → role-specific school landing | Role/expiry shown before accepting; no bypasses of school policy or activation. |
| Request / activate workspace | Schools → request → platform review → school settings → policy review → activation → invitations | Corrected invitation wording; added unsaved-settings/application protection and required contact markers. Applications can be unavailable for legitimate service-setup reasons. |
| First idea | School home/feed → submit panel → category/content/privacy/attachments → receipt | Existing draft/retry/receipt behavior retained. Navigation never waits for animation. |
| Track / participate | Tracking code or profile → public details → support/comment/save/share/follow | Named comment composers; literal author rendering; activity empties and cursor semantics retained. |
| School news / private questions | Notifications/following or private inbox → mark read/private reply | Distinct public/private explanations and retry states retained. Shared offline feedback now explains failed network actions without navigating away. |
| Staff review / delivery | Queue/board → detail → assignment/notes/action/update/evidence → save | Dragging opens review, never saves immediately; keyboard Move alternative retained. Role grants now confirm scope; failed actions recover their controls. |
| Staff members | Search/filter → change role or invite → refresh | Fixed literal names, failed-refresh feedback and stale student search responses. Invitation creation remains in its dedicated manager. |
| Analytics | Period/category → Apply → snapshot → chart/table → CSV | Fixed inert filters and incomplete refresh. All figures now use the same normalized server scope and disclose the bounded snapshot. |
| Settings / logout | Account/security or school settings → save/verify → sign out | Native security/origin/session handling retained; long unsaved school forms get a leave warning. |
| Billing / purchases | Not implemented | Not applicable: no billing, carts, checkout or plan-based upgrades are invented. |

## Priorities and heuristic findings

Severity: 0 informational, 1 cosmetic, 2 moderate friction, 3 major task/trust barrier,
4 critical. H1 visibility; H2 familiar language; H3 control; H4 consistency;
H5 prevention; H6 recognition; H7 efficiency; H8 minimalism; H9 recovery; H10 help.

| Priority | Finding / source evidence | Severity / heuristic | Resolution |
| --- | --- | --- | --- |
| Must fix | Unescaped author/member names in client card markup (`idea`, drawer, `admin-staff`) can insert misleading HTML and break controls | 4 · H5/trust | Existing HTML escaping used for text and attributes; special-character regression coverage |
| Must fix | Category selection only assigned an unused variable; 90 days/all time still sliced a 30-day timeline (`admin-analytics.ts`) | 3 · H1/H4 | Native URL filters backed by a shared server aggregation model; no fake all-time label |
| Must fix | Refresh changed only a chart, silently ignored errors and left KPI/table/export stale | 3 · H1/H9 | Refresh loads a complete scoped server snapshot; normal full-page errors remain explicit |
| Must fix | Analytics claimed real-time totals despite a bounded read; votes were shown as if cast on submission dates | 3 · H2/trust | Visible snapshot scope, read limit, current-support grouping and refresh semantics |
| Must fix | Staff refresh ignored errors; failed role actions stayed disabled; late searches could replace newer results | 3 · H1/H9 | Visible failure/retry feedback, bounded requests, recoverable buttons, abort + generation guard |
| Must fix | Role grants did not explain the permissions being granted | 3 · H3/H5 | Named scope confirmation before grants and administrator-to-moderator changes; server authority unchanged |
| Must fix | Standalone and drawer comment inputs had no accessible names | 3 · accessibility | Associated labels added to both composers |
| Must fix | Chart lacked a tabular equivalent and selected daily/cumulative mode was only visual | 2 · H4/accessibility | Exact-value table and `aria-pressed`; single-point chart markers |
| Must fix | School policy/application text could be discarded by navigation | 2 · H3/H5 | Scoped dirty-form warning, blocked offline save, submitted/error-page behavior; no browser storage of policy text |
| Must fix | Offline status was only discovered after an action failed; offline shell denied existing local drafts | 2 · H1/H9 | Shared polite connection status; corrected shell copy, SVG, dark mode and focus |
| Must fix | Analytics columns and metric values compressed into vertical letters/digits; chart toggles collapsed | 3 · H4/accessibility | Scoped table scroll, stable metric layout and nonshrinking 44px toggles |
| Nice to have, implemented | Filter selection semantics, contact-required markers, mixed-direction long names, sticky focus clearance, printing | 1–2 · H4/H7 | Native analytics radios, pressed staff filters, wrapping/bidi isolation, print and scroll rules |
| Do not touch | Tenant activation, invitation identity checks, policy/legal approvals, MFA and platform role separation | Security constraint | No database changes, automatic activation or role changes |
| Nice to have, deferred | Global command palette, additional shortcuts, undo for already-published workflow actions, localization | No demonstrated blocker | Existing contextual search and keyboard controls remain; these need product rules, not cosmetic controls |

## Screen/component state matrix

E = exists in source; M = missing; N = not applicable. State existence is not a
WCAG certification or a production/browser test result. Loading/error coverage may
be supplied by the shared navigation/auth shell. X means bounded/wrapped content
handling exists; true translations/RTL layout remain outside the English product.
The matrix includes every screen/partial; the linked inventory also lists each
control/chart/form/card definition and every browser module.

| Surface | Empty | Loading | Error | Success | Restricted | Interaction | Extremes | Scope / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `403` | N | E | E | N | E | E | E | Staff/access denial, role-aware recovery. |
| `404` | N | E | E | N | E | E | E | Unknown/deleted route, role-aware recovery. |
| `500` | N | E | E | N | E | E | E | Server failure with recovery; not an empty-content success. |
| `account-security` | E | E | E | E | E | E | E | Load/enroll/unfinished setup/verify/failure and role-aware return. |
| `admin-analytics` | E | E | E | E | E | E | E | Normalized filter snapshot, KPIs, charts/table, export and zero records. |
| `admin-staff` | E | E | E | E | E | E | E | Roster/student search, grants, demotion/revocation, refresh and invitation link. |
| `admin` | E | E | E | E | E | E | E | Queue filters, selection, actions, paging and shared review. |
| `auth-callback` | E | E | E | E | E | E | E | OAuth errors, session exchange, email verification and password recovery. |
| `digest-unsubscribe` | E | E | E | E | E | E | E | Confirmation form, invalid link, stopped emails and return. |
| `feed` | E | E | E | E | E | E | E | Initial/search/following/pagination; saved searches and idea drawer. |
| `home` | E | E | E | E | E | E | E | Hero, ideas, search/track, topic/sort controls; submit/receipt shared. |
| `idea` | E | E | E | E | E | E | E | Detail, comments/replies/support, public history and evidence. |
| `layout` | E | E | E | E | E | E | E | Headers, role shell, global scripts, connection status, legal links. |
| `notifications` | E | E | E | E | E | E | E | Signed out, updates, paging, read state, preferences and unavailable weekly delivery. |
| `partials/auth-modal` | E | E | E | E | E | E | E | Sign in/signup/reset link and code; focus, loading, error and confirmation. |
| `partials/confirmation` | N | N | N | E | N | E | E | Queued native confirm dialog, cancel first, focus restore. |
| `partials/empty-state` | E | N | N | N | E | E | E | Contextual content and action in full/compact variants. |
| `partials/feed-card` | E | E | E | E | E | E | E | Escaped content, author/privacy/support and action menu. |
| `partials/header` | N | N | N | N | E | E | E | Role-aware desktop/mobile account menu and theme toggle. |
| `partials/idea-detail-drawer` | E | E | E | E | E | E | E | Lazy details, errors, support/comments and unsaved composer. |
| `partials/mobile-nav` | N | N | N | N | E | E | E | School member navigation, active state and safe-area spacing. |
| `partials/navigation-skeleton` | N | E | N | N | N | E | E | Destination-specific skeleton and cancel while loading. |
| `partials/report-dialog` | E | E | E | E | E | E | E | Private report form with validation and request feedback. |
| `partials/staff-board-lane` | E | E | E | E | E | E | E | Independent lane scroll/paging, drag handles, Move and empties. |
| `partials/staff-progress` | E | E | E | E | E | E | E | Guided update/action/evidence form and update history. |
| `partials/staff-review` | E | E | E | E | E | E | E | Decision/progress/notes/history, conflict, unsaved drafts, refresh. |
| `partials/staff-sidebar` | N | N | N | N | E | E | E | Role/current links, saved views and persistent collapse. |
| `partials/submission-picker` | E | E | E | E | E | E | E | Search/choose/selected/no-result/failed result status. |
| `partials/submit-panel` | E | E | E | E | E | E | E | Steps, validation, upload, receipt, duplicates, draft/retry queue. |
| `partials/toast` | N | N | E | E | N | E | E | Polite/urgent live feedback, dedupe, pause, persistent errors, dismiss/focus. |
| `partials/work-record` | E | E | E | E | E | E | E | Date/progress detail, evidence, public history and pagination. |
| `partials/workspace-icons` | N | N | N | N | N | N | N | Decorative SVG symbols; no action/state machine. |
| `platform-schools` | E | E | E | E | E | E | E | Directory, applications, policy review, service readiness and activation errors. |
| `privacy` | N | E | E | N | E | E | E | Service notice, legal identity availability and contact. |
| `private-inbox` | E | E | E | E | E | E | E | Account/tracking-code lookup, clarification reply and report decisions. |
| `profile` | E | E | E | E | E | E | E | Four activity tabs, preferences, guest/account, pagination and unavailable public rows. |
| `roadmap` | E | E | E | E | E | E | E | Board/tree/calendar/outcomes; detail/work-record dialogs and independent paging. |
| `school-directory` | E | E | E | E | E | E | E | Guest onboarding, memberships, applications and gated application form. |
| `school-invitation` | E | E | E | E | E | E | E | Guest/matching account, pending/accepted/member/expired/revoked/unavailable. |
| `school-invitations` | E | E | E | E | E | E | E | Ready/locked form, email/link delivery receipt, duplicate/revoke/history. |
| `school-message` | N | E | E | N | E | E | E | Shared status/recovery page; dynamic title/message/action. |
| `school-notice` | N | E | E | N | E | E | E | Rendered school notice; no fabricated school identity or privacy approval. |
| `school-settings` | E | E | E | E | E | E | E | Pending/active setup, policy version, contacts/access/retention, save errors and invitations. |
| `staff-board` | E | E | E | E | E | E | E | Independent lanes, drag/review, keyboard Move, bulk assignment. |
| `staff-community` | E | E | E | E | E | E | E | Reports, reminders, clarification and merge flows. |
| `staff-login` | E | E | E | E | E | E | E | Password/Google entry, failures, staff access explanation. |
| `terms` | N | E | E | N | E | E | E | Service participation terms and legal identity availability. |

### Browser modules and email/offline surfaces

Every browser module is indexed with its created nodes and bindings. Its states
are owned by the screen/partial above; helpers (`events`, preferences, school
context, activity, theme, responsive, navigation/cache, scroll reveal) supply
shared behavior and have no independent page requiring seven duplicate panels.
Client loading, timeout, error and selected/busy states were reviewed at those
owners. Native GET analytics filters now preserve URL/back navigation instead of
pretending to filter only the chart.

| Surface | Empty | Loading | Error | Success | Restricted | Interaction | Extremes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `confirmation.html` email | N | N | N | E | N | E | E |
| `recovery.html` email | N | N | N | E | N | E | E |
| `magic_link.html` email | N | N | N | E | N | E | E |
| `email_change.html` email | N | N | N | E | N | E | E |
| `invite.html` provider email | N | N | N | E | N | E | E |
| School invitation Resend email (HTML + plain text) | N | N | E | E | E | E | E |
| Weekly digest / unsubscribe email | N | N | E | E | E | E | E |
| `offline.html` | N | N | E | N | E | E | E |

Email failures and eligibility restrictions belong to the sending/receiving flow,
not embedded interactive widgets in email. Provider templates retain real one-time
links/codes; the app has code-entry recovery. The invitation includes role, expiry,
matching-account instructions and ignore/forward guidance. Email delivery itself
was not sent by this audit. Notification/email preferences do not promise push or
immediate delivery when those services are unavailable.

## Review across the twelve requested categories

1. **Architecture/navigation:** Role shells and school scoping remain separate;
   URL filters, tabs, fragments, independent lane pages and deep-link recovery are
   inventoried. No redundant generic client dashboard is added for operators.
2. **Flows/friction:** See flow table. New steps only for privileged access changes;
   search, navigation and read actions stay reversible and immediate.
3. **Visual system:** Existing tokens, scale and smaller mobile text retained per
   prior user preference. Empty-state system reused. Decorative title dots and
   the offline CTA contrast were corrected; no broad brand replacement.
4. **Components:** Existing modal/drawer/confirmation patterns retained. Analytics
   radios are native; selected chart/staff filters communicate state. Tables scroll
   within containers on mobile. Charts have exact-value tabular equivalents.
5. **Forms:** Associated comment labels, required contacts, preserved school policy
   drafts and visible request feedback. Backend validation and origin checks remain.
6. **States:** Matrix plus `empty-states.md` covers first use, filtered zero, cleared
   queues, busy actions, errors, lock/permission, completion and wrapped extremes.
   Loading failures are never reclassified as successful empty results.
7. **Content:** Truthful snapshot/date/vote semantics, invitation location, offline
   drafts, school access scope, period comparisons and familiar next actions.
8. **Accessibility:** Native keyboard semantics, labels, visible focus, modal focus
   trapping, toast announcements, reduced motion and drag alternatives retained.
   Browser checks are scoped evidence, not a blanket WCAG 2.2 AA certificate.
9. **Responsive/platform:** Four-width/two-theme scan, expanded role screens,
   safe-area clearance, local print rules and offline shell. Safari, real virtual
   keyboards, iOS install/push and actual 200% browser zoom require device checks.
10. **Performance:** No new dependencies or blocking animation. Native analytics
    navigation refreshes coherent server HTML, removes unused raw-submission data,
    and aggregates timeline/category bins in one pass. Private records remain out
    of persistent navigation caches. No measured production CWV claim is made.
11. **Motion:** Existing reduced-motion-aware press/focus/scroll/render effects
    retained; no extra animation is added to mask load times or hide content.
12. **Trust/security UX:** Literal names, explicit privilege grants, distinct
    private/public information, draft preservation, MFA and immutable role checks.

## Missing capability / external verification ledger

- **M: translated UI / full RTL application layout.** Not promised by the English
  product; mixed-direction user content is wrapped/isolated. Translation needs
  approved language content and product scope.
- **M: measured production LCP/INP/CLS and user task research.** Local audits cannot
  establish field performance, conversion or all-user experience. Needs production
  measurements and representative school users.
- **M: real-device/browser and assistive-technology verification.** Chromium and
  reflow checks do not substitute for Safari/iOS/Android keyboards or screen readers.
- **M: verified external email/OAuth delivery in this run.** Templates and local
  callbacks are covered; production credentials and a human account complete those
  external flows. No real messages or data mutations were made.
- **N: billing, plan limits, cart/payment failure, maps, trash/restore and undo of
  published records.** The app does not expose these features; do not invent them.

## Verification results

- Production build and complete TypeScript checks: passed.
- Complete local regression suite: 265 passed, 0 failed/skipped across 57 files;
  final affected analytics and branding checks also passed after baseline/visibility changes.
- Browser regressions: 18 passed, including native analytics filtering/table access,
  literal author names/reply text, failed staff refresh, protected offline Save,
  unsaved drafts, account modal recovery and expanded school/platform reflow.
- Responsive/contrast heuristic scan: 280 cases (35 routes × 4 widths × 2 themes),
  no document overflow, unnamed visible controls, computed opaque contrast flags
  or JavaScript exceptions. Complex-image/transparent backgrounds are not a full
  contrast certification. Modern `color(srgb ...)` parsing was corrected in the
  scanner rather than treating fractional channels as 0–255 values.
- Reviewed screenshots of analytics mobile/light and desktop/dark, school settings
  mobile/dark and platform desktop. Explicit table-scroll/toggle tests catch the
  compressed-letter defect that document-width checks alone did not detect.
- Independent read-only review completed; reply over-escaping and offline POST
  draft loss findings were corrected and have exact-path browser regressions.
- The installed Node 24 test runner initially reported only file counts when using
  `--test` with this transpiler. Each existing test file was instead executed in
  its own process through ts-node, preserving real assertion counts and exit codes.
  The app still targets Node 22; no runtime/dependency requirements were changed.

The source inventory covers 97 surfaces: 29 screens, 18 shared components,
42 browser modules, 7 email sources and one offline shell, with 993 structural/
interactive source definitions. Regenerate it with
`node apps/web-express/scripts/ui-surface-inventory.cjs`.

No hosted data, invitations, permissions or school activation state were changed
by these checks. Real OAuth/email, assistive technology, actual desktop browser
zoom/real mobile keyboards and field Core Web Vitals remain unverified.
