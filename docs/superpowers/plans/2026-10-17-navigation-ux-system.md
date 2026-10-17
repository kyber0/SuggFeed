# Role-based navigation and application UX implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless separately authorized. Steps use checkboxes for tracking.

**Goal:** Make every account land in its correct workspace, expose only relevant controls, and make every supported journey end in a working page or an understandable recovery state.

**Architecture:** Resolve account authority and school membership on the server, derive a presentation context, and render separate platform, school staff, school member, and account/setup navigation. Keep existing URLs where possible; consolidate destination selection and maintain school boundaries in links, redirects, browser requests, and cached UI. Presentation must never substitute for authorization.

**Tech stack:** Express, TypeScript, Eta, PostgreSQL/Supabase, existing CSS modules and browser scripts. No new frontend framework.

**Spec:** User direction: plan first; audit the entire app UI/navigation/UX; super-admin accounts belong exclusively in platform administration, not the customer interface; eliminate broken navigation and unnecessary UI. This document includes the product specification and implementation tasks.

## Evidence collected on 17 October 2026

- `server.ts` sends `/` and all unrecognized global GET routes to `/schools`; it does not resolve a role-specific home. A typo can appear to work while landing on the wrong page.
- `auth-callback.ts` accepts school return paths or falls back to `/schools`; platform return paths are discarded. Other auth navigation also selects destinations independently.
- `partials/header.eta` uses the operator flag only on some pages. Student profile, following, messages, and school updates remain in the account menu even on platform pages. Staff portal is rendered for non-operators without a staff-role condition.
- `layout.eta` mounts community dialogs and scripts on administrative/account pages and shows member mobile tabs on school settings and the chooser.
- `schoolAdmin()` deliberately permits pending-school settings; its shared header still links into that school's community.
- `resolveSchool()` returns generic 404 for inactive schools before resolving membership. Anonymous live GETs confirmed `/s/demo/`, `/s/demo/feed`, and `/s/demo/admin` return 404. `/s/demo/admin/school-settings` and `/platform/schools` return expected 401 without a session. This is evidence for one family of broken journeys, not proof that all links were checked.
- `schoolHtml()` scopes rendered URL attributes, while browser `sfSchoolPath()` scopes client navigation and requests. Any fix must cover both implementations and avoid double prefixes.
- Staff templates contain desktop-only notices and stylesheet rules hiding staff work below 800px. Effective behavior requires browser inspection because later styles can override these rules.
- Staff sidebar exposes Manage staff alongside other staff actions. Its visible options need a capability audit against backend mutation permissions.
- Unknown-page recovery currently says Return Home, which can lead back to the chooser rather than the user's workspace.

## Product structure and role rules

| Account/context | Default destination | Primary navigation | Excluded experience |
| --- | --- | --- | --- |
| Visitor | Public welcome / sign-in and verified public-school links | About service, sign in, legal/help | Private workspace and administrative controls |
| Signed-in account without a school | Join/setup status | Invitations, school requests, account security | Empty community navigation |
| School member | Valid intended school page, otherwise school home; chooser when multiple schools require a choice | Home, Ideas, Roadmap, Updates, Profile; Submit as action | Staff and platform actions |
| School moderator | School review queue | Review, Manage work, Follow-ups, permitted analytics | School policy, role/invitation administration unless explicitly authorized |
| School administrator | School administration; setup overview while pending | Overview/setup, Review, Manage work, Follow-ups, Members, Settings, permitted analytics | Platform reviews and service configuration |
| Platform super admin | Platform dashboard | Overview, Schools, Applications/reviews, Service setup, Account security | Student profile, submission/voting, community feed, school staff persona |

Platform authority takes precedence for mixed-role accounts. Preserve existing membership records, but do not let them cause silent role switching. Use a separate school-role account for customer participation. Platform operators retain explicit, audited platform management of school setup; do not grant general access to private school content or impersonate school members. Existing demo settings management must have a platform-context destination before removing its customer-context entry point.

Account security, sign-out, recovery, and relevant legal notices remain accessible across roles. Moderators and school admins may use an explicit, clearly labeled community-view link where their membership permits it; the platform-only rule is specific to super admins.

## Global constraints

- Plan only until implementation is authorized. No account migration, role revocation, policy approval, activation, or gate changes in this audit.
- Preserve tenant isolation, MFA for privileged access, same-origin protections, policy version checks, and no-store/private cache behavior.
- Use verified server authority; never trust a role supplied by the browser or a remembered destination.
- Do not invent legal/operator information or label a setup requirement complete without evidence.
- Maintain SuggFeed branding; use existing components, semantic HTML, visible labels, 44px touch controls, theme tokens, and reduced-motion support.
- Do not hide backend failures behind redirects or empty success states. Unknown URLs remain genuine 404s.
- Use synthetic local fixtures for role and state checks; do not create test records or send invitation/reset emails in production.

## Review focus

1. Mixed platform and school membership: platform-only landing/navigation, no escalation or leakage through direct URLs.
2. Pending/suspended/private school: authorized users receive appropriate status and next actions; outsiders do not learn private registry details.
3. Auth return paths: Google, password, MFA, recovery, and invitation flows preserve a permitted destination without loops or open redirects.
4. Restored tabs and changed identity: browser caches and navigation cannot reveal a previous user's or school's data.
5. Small screens and keyboard navigation: the same allowed tasks remain available; dialogs, menus, and save actions stay reachable.

## Task 1 — Complete route/action inventory and reproduction matrix

Files: `src/server.ts`, all `src/routes/*.ts`, `views/*.eta`, `views/partials/*.eta`, `src/client/*.ts`, `src/sw.ts`, `public/css/modules/*.css` (app-relative paths).

- [ ] Inventory each screen, static/dynamic link, form destination, dialog trigger, notification/deep link, and redirect. Record owner role, school scope, method, loading state, error state, back destination, and mobile behavior.
- [ ] Cover welcome/chooser, auth/recovery/MFA, invitations, setup/policies, platform reviews, home/feed/search/saved searches, idea/detail/comments/voting/bookmarks/sharing, submit/draft recovery/uploads, roadmap views, profile/activity, updates/following/messages, review queue, board/drag/detail, follow-ups, analytics, staff access, legal pages, and error pages.
- [ ] Reproduce reported link failures with local roles and pending/active/suspended schools; distinguish missing routes from membership denial, setup blocks, and failed data reads.
- [ ] Record each issue with source link, actual destination/status, expected destination, and priority. Fix confirmed defects before cosmetic changes.

Deliverable: a complete route/action matrix and reproduction cases; do not claim every link works from a compile check.

## Task 2 — Single role-aware destination and context resolver

Create `src/lib/navigation-context.ts`; modify `src/server.ts`, `src/routes/auth.ts`, `src/routes/schools.ts`, `src/lib/school-context.ts`, `src/client/auth.ts`, `src/client/auth-callback.ts`, and corresponding auth/context tests.

- [ ] Define server context from verified platform authority, school membership, lifecycle status, and route intent. Handle authority lookup failure explicitly; do not fall back to a student persona.
- [ ] Add a canonical account landing destination (proposed `/account/home`). Route login success, root entry, logo/home, and error recovery through that destination when no permitted explicit return path applies.
- [ ] Give platform operators priority and a platform-only route policy for interactive school pages. Preserve shared account/auth routes; guard relevant data/action endpoints as well as navigation.
- [ ] Keep one-school and multi-school destinations deterministic. Revalidate any remembered school against current membership/status.
- [ ] Allowlist and validate return paths for platform, account, invitations, and school contexts. Recovery must still reach password entry before normal landing.
- [ ] Add focused regressions for mixed roles, revoked roles, authority failures, malicious return paths, and Google/password/MFA/recovery transitions.

Deliverable: correct landing and access behavior independent of hidden UI.

## Task 3 — Separate application navigation by purpose

Modify `views/layout.eta`, `views/partials/header.eta`, `views/partials/mobile-nav.eta`, `views/partials/staff-sidebar.eta`, navigation skeleton/client code, CSS bundle builder, and template/navigation tests. Create small navigation partials only where responsibility is genuinely distinct.

- [ ] Render platform, school staff, member, and account/setup shells using server context. Keep role and current school visible where relevant.
- [ ] Platform pages contain no student profile, submit button, school updates, following, or private school messages. Give platform users account security/settings and sign-out in their account menu.
- [ ] Staff pages use staff navigation; members use community navigation. Hide unauthorized administrative actions and retain backend enforcement.
- [ ] Remove duplicated navigation bars and decorative/unrelated controls. Load community dialogs and feature scripts only where those actions exist; inspect global script dependencies first.
- [ ] Use consistent breadcrumbs, active state, labels, and contextual back links. Logo targets the current role's home.
- [ ] Make staff and platform navigation usable on mobile instead of replacing tasks with a desktop-only notice.
- [ ] Verify role-specific link sets, no cross-role tabs, correct school prefixing, and keyboard menu behavior.

Deliverable: each role has a coherent navigation system on desktop and mobile.

## Task 4 — Setup, review, activation, and invitations as one journey

Modify school/platform routes and templates, `school-message.eta`, scoped styles; extend onboarding HTTP tests.

- [ ] Create a school setup overview with ordered tasks, actual state, responsible role, and one next action. Include details/contacts, policies/eligibility, visibility/retention, review, activation, invitations.
- [ ] School admins edit their tasks; platform operators review and manage school setup in the platform shell. Do not force operators into the client interface.
- [ ] Make sample/demo status persistent and distinguish fictional contacts from ready-for-use configuration.
- [ ] For saved policies show version and awaiting-review state; do not imply saving grants approval or activation.
- [ ] Explain activation blockers in user language with a destination or responsible owner. Isolation verification remains a real operational check, not a checkbox an operator can casually self-certify.
- [ ] Once activation is valid, provide the next action to invite members. Invitation creation, copy/share, expiry, acceptance, and existing membership need clear outcomes. Send no email unless a real supported feature is implemented and requested.
- [ ] Preserve entered values on validation failure; handle stale-version conflicts without silent overwrites.

Deliverable: users can see where they are, who acts next, and how to continue.

## Task 5 — Correct broken links and lifecycle recovery

Modify confirmed offenders from Task 1, `src/lib/school-path.ts`, `src/client/school-context.ts`, resolver/error templates, and route/context tests.

- [ ] For known inactive schools, authorize before choosing a status screen; show setup/review/suspension recovery to permitted users without disclosing private details to outsiders.
- [ ] Show unavailable/deleted ideas, expired invitations, permission changes, and network failures as distinct states with usable recovery.
- [ ] Maintain explicit legacy URL mappings only when a safe destination exists. Remove the catch-all behavior that disguises unknown global paths as the chooser.
- [ ] Fix server and browser URL generation together, including notification links, form actions, query strings, anchors, return paths, and direct refreshes.
- [ ] Validate all visible first-party links/forms across supported role/state combinations; no expected click should reach an accidental 404 or unrelated page.

Deliverable: reliable navigation and honest errors, with no redirect loops or cross-school paths.

## Task 6 — Whole-product interaction and visual consistency

Use the route inventory to update existing feature templates/client/CSS; avoid unrelated backend rewrites.

- [ ] Standardize primary/secondary actions, section titles, statuses, empty states, validation, toasts, confirmations, pagination, and loading indicators.
- [ ] Feed/profile: distinguish no results, no content, and failed loads. Show Load more only when more records exist. Keep saved searches and activity understandable.
- [ ] Idea/roadmap: define when clicking opens a detail page versus a drawer; retain view/filter/back state; make update and stage details purpose-specific.
- [ ] Submission: clear required fields, save/recovery feedback, upload progress/failure, and successful destination.
- [ ] Staff: distinguish initial moderation, delivery work, follow-ups, and access administration; remove redundant controls; preserve useful filters across return navigation.
- [ ] Keep animation subtle and nonblocking; ensure hover/reveal effects never obscure controls or delay navigation. Cache only appropriately scoped data and invalidate on role/school/account changes.
- [ ] Review desktop/tablet/phone layouts and dark mode; fix overflow, blocked focus, inaccessible dialogs, redundant panels, and unexplained disabled actions.

Deliverable: consistent interaction patterns across all inventoried screens, not merely the setup pages.

## Task 7 — Acceptance and rollout

- [ ] Run targeted auth, school-context, onboarding, route, and template tests; add behavior tests for new routing rules, not snapshots that mirror markup.
- [ ] Build/typecheck and run the full suite after integrated changes.
- [ ] Browser-walk the complete inventory using local visitor, member, moderator, school-admin, platform-only, and mixed-role fixtures; cover no-school, pending, active, suspended, public/private, and empty/populated states.
- [ ] Verify 320/390/768/1440px, dark mode, keyboard-only operation, reduced motion, slow/failed responses, refresh/back, and restored tabs.
- [ ] Record passes/failures per journey. Release in reviewable commits with an explicit rollback point; confirm deployed assets and safe public routes afterward.
- [ ] Keep privileged production verification distinct from local fixtures. Never claim an authenticated production journey was verified without a real authorized session.

## Definition of done

A platform account opens only platform administration; each other account reaches its appropriate workspace; every visible control has a valid destination/action; legitimate setup blocks explain what happens next; unknown resources remain safe errors; all allowed core tasks work on phone and desktop; and the route/action matrix has no unresolved critical navigation or authorization defects.

## Current limits

This is a code-backed initial audit and implementation plan, not an exhaustive executed browser audit. Live checks were anonymous and read-only. No application code, roles, memberships, data, activation gates, or deployment was changed for this planning request. Legal operator/contact configuration remains a real setup dependency rather than a UX issue that can be styled away.

## Implementation record

The user authorized implementation after the initial audit. The navigation changes use the existing `work` checkout and existing deployment authorization.

- Role resolution: implemented per-request platform authority with no session permission cache, canonical account landing, role-aware school destinations, membership-checked auth returns, and explicit supported legacy aliases.
- Platform-only experience: platform accounts are redirected away from school pages and forbidden from school mutations, including mixed-case routes. Their settings destination remains in the platform shell and still requires the existing school-admin permission for edits. No memberships or database authority were expanded or revoked.
- Navigation: separate account/setup, platform, staff, and member link sets; staff menus omit member actions, with an explicit community-view action. Setup/platform pages omit member tabs, submission dialogs, and unrelated feature scripts. Section links reflect hash navigation and open linked policy disclosures.
- Lifecycle: authorized pending-school admins return to setup; members receive a clear availability message; unknown/private registries remain undisclosed. Closed workspaces no longer offer an unusable administration entry point.
- Setup: persisted policy version and review state are separate from unsaved input. Failed saves retain form input. Setup steps explain editing, review, activation, and invitations; fictional demo content is labeled. School requests are a secondary disclosure in the chooser.
- Defects fixed: missing access-denied template, generic inactive-school 404 journeys, platform callback destinations discarded by client navigation, incorrect settings skeleton classification, and case-sensitive MFA classification for case-insensitive Express routes.
- Existing responsive staff rules were confirmed to restore the mobile workspace; no duplicate responsive rewrite was needed. Existing profile pagination, roadmap drawers, submission recovery, progress actions, notification preferences, cache namespaces, and dialog patterns were reviewed against their feature tests instead of rebuilding working features.

### Verification evidence

- Literal source inventory: 45 Eta screens/partials and 88 single-path route declarations in the companion JSON. Array-declared and dynamic routes are covered separately by route tests and source review. No literal render target refers to a missing template.
- Full test suite: 247 passed, 0 failed, including local synthetic database isolation tests. Subsequent small navigation refinements receive a final targeted regression run and build/typecheck before release.
- Browser fixtures: 15 screens at 390px and 1440px; another 7 at 320px and 768px in dark mode. All 44 renders returned 200 without document-width overflow; narrow/dark checks had no uncaught browser exceptions. Covered platform, settings, chooser, security, home, feed, profile, roadmap, updates, inbox, review queue, analytics, staff, workboard, and follow-ups.
- Browser interaction: settings section selection updates `aria-current`; account/setup menu excludes member actions; Escape closes the account menu. Existing feature tests cover idea/workflow drawers, roadmap keyboard navigation, recovery, and scoped browser state.
- Independent review found mixed-case platform guard and MFA gaps, overly broad legacy redirects, and misleading unsaved-policy status. All were corrected with regressions for the boundary and saved-state cases.

Ruling: preserve existing memberships while restricting the platform account's app experience on the server; changing database memberships was not required by the requested UI/UX separation.
Ruling: preserve the actual activation gate and explain its owner and next step; sample/demo policies cannot count as a completed real review.
Ruling: keep current working feature interactions where tests and browser review found no defect; this avoids speculative rewrites across unrelated subsystems.

### Remaining practical limits

Authenticated production journeys require a real user session; local fixture results are not claimed as signed-in production verification. Real service identity/contact configuration and operational activation sign-off remain required. Not every possible dynamic record, deep-link ID, network failure, or third-party authentication provider state can be exhaustively browser-walked; source inventory and focused feature/authorization regressions cover these boundaries.
