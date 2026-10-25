# SuggFeed super-admin workspace plan

Status: implemented. See [implementation notes](../../ux/super-admin-workspace-implementation.md) for delivered scope, applied migration, inspection and remaining limitations.

## Goal

A platform operator should immediately understand what needs attention, find a school, complete one task and return to the same queue. School administration and student participation stay separate from platform authority. Preserve SuggFeed's shared brand, Express/Eta architecture, current authentication and reviewed publishing rules.

This plan improves workflow and data correctness together. It does not claim perfection without implementation and inspection.

## Source findings

| Finding | Source | Planned correction |
|---|---|---|
| Directory and application sidebar badges are lengths of loaded arrays, not global totals | `views/platform-schools.eta` | Authoritative global queue totals; independently label visible results |
| Policy reviews are loaded only for the currently visible/filtered school IDs | `src/routes/schools.ts` | An independent, paginated policy queue; directory filters cannot hide pending reviews |
| Overview fetches applications, full customization drafts, directory policies and grant history even when those panels are hidden | Same route | Query only the selected section plus compact navigation counts |
| Grant history fetches up to 1,000 events then finds the first per school | Same route | A bounded, indexed latest-event query; never imply missing history means no history |
| Studio grant controls repeat in directory accordions and Editor access | Platform template + `partials/platform-editor-access.eta` | One reusable grant-control behavior in the relevant access view |
| Application, policy and collection reviews each use a different nested-card pattern | Same templates | Shared queue/detail/review-action pattern, retaining different decisions and validation |
| Analytics include demo data and memberships are not unique people | `partials/platform-overview.eta` + analytics RPC | Explicit scope; real schools by default only after the RPC supports it; visible demo toggle |
| Global isolation sign-off is displayed alongside school readiness | Platform template | Distinguish the platform release gate from school-specific requirements |
| Platform operator status does not grant school-admin membership | `operator`, `schoolAdmin`, Studio authorization | Platform-only school details; school-client links remain permission-gated |
| Hash panels retain history, but all panels/data are initially present | `src/client/navigation.ts` | Common dashboard shell with server-addressable sections and compatible legacy links |

Paths in this table are relative to `apps/web-express` except the SQL migrations.

## 1. Navigation and screen inventory

Use one persistent platform shell. No extra Editor access header button, school banner, student navigation or school-brand overrides.

| Main section | Purpose | Contents |
|---|---|---|
| Overview | Decide what to do next | Attention queue, operational totals, compact activity, recent operator actions |
| Schools | Find and inspect a workspace | Search, status filters, directory, school detail |
| Reviews | Complete pending decisions | Applications, policies, collection/form changes, Sugi feedback |
| Studio access | Manage the per-school editor grant | Search, enabled/paused state, last change, school access details |
| Activity | Explain what changed | Paginated, authorized platform audit events and filters |
| Platform settings | Check service readiness | Operator identity/contact configuration status, release evidence status, account security |

Group sidebar links under Workspace and Administration. Use plain SVG icons, one active state, small real counts only for pending work. Do not badge every link. Account/security/sign-out remain in the account menu.

School detail stays inside this shell, with **Summary, Reviews, Access and Activity** tabs. It is a platform management record, not a school-admin dashboard. Show school name, status and slug once; a compact Back to schools link returns to the same search/filter/page.

### Addressing and history

Keep the existing `/platform/schools` entry point. Introduce an allowlisted `section` query (`overview`, `schools`, `reviews`, `editor-access`, `activity`, `setup`), defaulting to Overview for backward compatibility. Reviews also have an allowlisted `reviewType`. Each list owns its own search, filters, pagination and sort; switching sections does not leak another list's page number into the request.

Use actual GET links and normal browser navigation under the same shell. A compact client bridge maps existing `#schools`, `#applications`, `#policies`, `#assistant`, `#editor-access` and `#setup` links to their section/type. Old per-school policy anchors resolve to an authorized review detail. Without JavaScript, the landing page still offers working section links. Retain current protected POST endpoints while updating their successful return destinations.

Add a platform-only `GET /platform/schools/:id` detail route with an allowlisted tab. Do not repurpose the existing `/settings`, `/members` or Studio routes, whose school-admin authorization is intentional. Any return-to value must resolve to a validated local platform destination.

## 2. Overview: an operational landing page

Order the screen by urgency:

1. Compact title, scope and last-updated time; Refresh is secondary.
2. **Needs attention** list: pending applications, unreviewed policy versions, requested form reviews and activation blockers. Each row has one Open queue action.
3. Four concise metrics: active schools, pending school setup, pending reviews and active memberships. Definitions appear beside the metric or in an accessible disclosure.
4. Community activity chart and a small school-status breakdown.
5. Recent platform actions, linked to the relevant school or review.

Avoid oversized heroes, duplicate chart cards and a wall of setup banners. Show an actionable service blocker once with its owner and destination.

### Analytics rules

- Queue totals cover all authorized matching records, not the loaded page.
- Clearly separate current totals from time-window activity; 7/30/90 days must not misleadingly relabel all-time totals.
- Use Philippine dates and show capture time. Today is partial; comparisons must use equivalent elapsed windows or explicitly use completed days.
- Real schools should be the default scope once both current and previous-period queries exclude demo data consistently. Until then, keep the current disclosure and do not silently filter only the UI.
- Memberships are not unique students. No invented percentages, health scores, uptime or enrollment figures.
- Preserve the existing accessible chart, keyboard scrubber and exact-values table. Add no chart library.
- An unavailable query displays Unavailable with Retry, not a fabricated zero. Analytics failure does not block school management.

## 3. School directory and school detail

### Directory

Desktop: compact table-like rows with School, Status, Next step and Last updated. One primary **Open school** link, with the name linking to the same destination. Do not make an entire row a button containing other buttons.

Mobile: stacked rows with the same information and one action. Preserve complete names/emails through wrapping or accessible disclosure. Search and status filters stack; Clear filters is always predictable. Pagination remains bounded and returns to the same filter.

Do not include activation, invitations, grant toggles, suspension and closure buttons on every row.

### Summary tab

- Current access status and a concise explanation.
- Readiness checklist with **requirement, state, owner and next action**.
- Verified institutional authority/application outcome.
- Approved policy version and any replacement awaiting review.
- Institutional/privacy contact verification where an actual authoritative verification record exists.
- Active school-administrator requirement.
- Platform service configuration and isolation release gate, distinctly labelled.
- Relevant joining configuration summary without exposing a full student roster.
- One context-sensitive next action, derived from current server facts.

Missing or unverifiable checks say Not verified/Unavailable. A configured email string alone is not verified ownership. “Ready for activation” is a preflight summary; the final RPC still rechecks everything.

### Access tab

Show editor access and platform lifecycle actions in separate groups. School members, invitations and student access are handled by school admins. A platform operator who independently has school-admin permission may receive an explicit school-admin link; it must not add membership or change role silently.

### Activity tab

Only appropriate school-registry/platform audit events: actor, action, target, outcome, timestamp and permitted reason/reference. No private student discussion or content by default.

## 4. Reviews: one process, clear review types

Reviews has four labelled tabs: **Applications, Policies, Form changes, Sugi feedback**. Each queue is independently paginated, filterable and ordered oldest-first by default. Show school, submitted time/age, item type, version/revision and state. Loading one queue must not fetch unrelated full drafts.

Desktop uses a queue and a focused detail region. Narrow screens open a full-width detail with Back to queue. Preserve the selected item and queue position through refresh, submission errors and browser Back.

### Review detail pattern

- Compact heading: school, review type and exact version.
- Submitted facts/evidence and relevant prior approved version.
- Meaningful before/after changes for policy/form reviews, including collection consequences.
- A clear review-reference field with preserved input on failure.
- One primary action, plus only actions supported by the backend.
- Final submission rechecks operator permission, MFA, current pending state and exact version/revision. A stale review explains what changed and offers Reload current version.

### Decisions remain distinct

| Type | Decision and outcome |
|---|---|
| Application | Approve creates a **pending workspace**; Reject records the application decision. Neither activates a school |
| Policy | Record review for the exact policy version; keep the last approved policy live during replacement review |
| Form changes | Approve collection changes against the current approved policy and exact draft revision; cosmetic changes do not enter this queue |
| Sugi feedback | Review knowledge gaps/answer feedback using existing safe topic/version data. No invented chat transcripts or automatic publishing |

Do not add Request changes, reviewer notes, notification promises or bulk approvals until their durable backend workflow exists. Current unsupported actions remain absent, not decorative buttons. No bulk activation or mass suspension in this release.

## 5. Activation and lifecycle

Make this sequence explicit:

**Application → verified authority → pending school → reviewed policies/contacts + active admin + service/release checks → activation → active school.**

Approving an application ends on the school Summary tab with the remaining checklist, not a generic success page. Each requirement identifies who must complete it. The super admin does not fill school facts with invented information.

Reuse existing lifecycle meanings:

- Pending: setup is incomplete; students cannot use an unactivated workspace.
- Active: eligible members may access it.
- Suspended: access paused; records retained; reactivation rechecks requirements.
- Closed: records retained; reopening is unavailable through existing controls.

Use Suspend for temporary restrictions. Put Close school in a collapsed danger section, never as a routine row action. Preserve exact-slug confirmation, reason, expected current status and server-side transition checks. A status conflict preserves the typed reason and asks the operator to review the new state. This plan does not introduce hard deletion, reset data or account bans.

## 6. Studio access

A compact global grant list and a school's Access tab share the same control and existing `set_school_customization_rollout` operation. Show **Enabled/Paused**, the affected school, last recorded actor/time and a single action.

Before applying, explain: the grant affects all active school admins; pausing stops editing, not the published appearance. It grants neither school membership nor platform access. Keep form approvals in Reviews, with a link from the grant row when applicable.

An operator cannot use the visual editor merely because they granted it. Existing school-admin/MFA/grant checks remain in force. Remove redundant standalone navigation while preserving the current compatibility redirect.

## 7. Visual system and interaction

- Preserve navy/orange SuggFeed branding; neutral surfaces, quiet separators and restrained shadows.
- A compact page heading and one primary action per task. Cards group information, not button collections.
- Use 4/8px spacing, readable 14px+ operational body text and consistent status chips with text labels.
- Fixed chrome reserves content space; avoid stacked bulky sticky headers. Tables scroll within their region only when necessary; mobile uses stacked rows.
- At 320–430px, use a clear dashboard section selector/drawer, full-width detail and 44px touch actions. Do not add another bottom navigation over student navigation.
- Buttons show pending feedback immediately; prevent duplicate submission. Show success at the affected item with changed state. Do not delay navigation for decorative effects.
- Reuse current motion tokens for restrained opacity/transform entrances and selection feedback. Respect reduced motion; no cursor follower, magnetic destructive buttons, marquee or inertial scrolling in operational lists.
- Preserve keyboard focus, visible focus indicators, screen-reader headings, native history and no-JavaScript navigation.
- Every screen has explicit empty, no-results, unavailable, forbidden, stale and success states, with a working destination. Never route ordinary errors to raw JSON pages.

## 8. Data and performance design

Reuse the existing tables/RPCs and add focused read operations where necessary. Do not grow `schools.ts` into a larger monolithic dashboard controller.

Proposed server responsibilities:

- `getPlatformNavigationCounts(actorId)`: authoritative pending totals, independent of pagination; deny non-operators.
- `getPlatformSchoolSummary(actorId, schoolId)`: authorized platform metadata/readiness only, without student content or granting membership.
- `listPlatformReviews(actorId, {type, page, search})`: only one queue's bounded summaries; policy queue independent of directory IDs.
- `getPlatformReview(actorId, type, itemId)`: exact saved review source and version, read only after authorization.
- `listPlatformActivity(actorId, {schoolId?, page, action?})`: a bounded allowlisted audit projection.

Use existing operator + strong-auth checks at every read and mutation. Fetch current permissions at action time. Counts cannot become an authorization shortcut. Keep existing restricted write RPCs and status/version guards.

Add ordered migrations only for required operator-scoped read RPCs/indexes or analytics scope support. Do not create duplicate school settings, review records or grant tables. Match indexes to actual query predicates/order; no speculative tuning.

Fetch only selected-section content, counts and minimal context. A failed optional panel has a local retry. Keep private responses out of shared caches; any short server aggregate cache must still reauthorize each request and expose capture time. No Supabase service keys or private drafts in browser storage. No real-time subscription framework is needed for the first release.

## 9. Concrete implementation map

Modify existing:

- `apps/web-express/src/routes/schools.ts`: delegate dashboard reads; preserve existing mutation/access checks.
- `src/routes/school-customization.ts`: reuse grant/review mutations and canonical return destinations.
- `src/client/navigation.ts`: preserve legacy platform deep links without affecting school settings navigation.
- `views/platform-schools.eta`: compact common shell and selected-section rendering.
- `views/partials/platform-overview.eta`, `platform-editor-access.eta`: shared counts, presentation and grant controls.
- `src/client/admin-overview.ts`: retain chart accessibility and supported interaction.
- `public/css/modules/platform.css`, existing platform style/build wiring, header navigation and generated assets.

Add focused files, following current route conventions:

- `src/lib/platform-dashboard.ts`: read-model/query orchestration and readiness summaries.
- `src/routes/platform-dashboard.ts`: section and school-detail GET routes, registered before generic school routes as needed.
- `views/platform-school.eta`: platform-only school detail.
- `views/partials/platform-review-list.eta`, `platform-review-detail.eta`, `platform-activity.eta`: focused shared UI.
- A dedicated platform client script only for enhancement that existing helpers cannot provide.
- Ordered SQL migration(s) if the read projections/analytics require them; update the existing build/fixture documentation.

All unqualified paths above are relative to `apps/web-express`. Extend the existing platform stylesheet rather than adding a competing style system.

## 10. Delivery phases and completion conditions

| Phase | Deliverable | Required result |
|---|---|---|
| 1 | Shared shell, navigation and correct counts | Existing URLs remain usable; loaded-page counts cannot masquerade as totals |
| 2 | Directory and platform school detail | One clear next step; no implicit school membership; useful return navigation |
| 3 | Independent review queues/details | Directory filters never hide policy work; exact-version decisions and preserved form input |
| 4 | Studio access and lifecycle integration | One grant behavior; clear activation/suspension/closure effects; stale actions rejected |
| 5 | Actionable overview, activity and settings | Scope-correct aggregates, real audit data, no invented health/verification |
| 6 | Responsive/accessibility/error review | All target screens and cross-section journeys meet the checklist below |

Each phase uses local fictional fixtures, type checking and a production build before the next phase. Automated tests should be added/run only when separately requested. No production mutation is needed to inspect the interface.

## 11. Acceptance and review checklist

Planned requirements, not claims of completed verification:

- Overview/Schools/each review type/Studio access/Activity/Settings/each school-detail tab/lifecycle confirmation: inspect at 320, 360, 375, 390, 412, 430, 768 and 1440px; include short landscape height.
- No document horizontal overflow, overlapping actions or fixed chrome covering focused controls. Large text, 200% zoom, keyboard and reduced motion remain usable.
- Search/pagination/queue position survive Back and failed submissions. Existing bookmarked anchors reach the right authorized destination.
- More than 24 schools/12 applications/20 editor records still yield correct global counts and complete independent queues.
- Non-operators and stale sessions cannot read platform details or mutate records. A platform operator without school membership cannot enter school-admin tools.
- An old policy/form revision cannot be approved after a concurrent change. Reviewed live policies stay intact while replacements are pending.
- Approving an application creates pending, not active. An enabled editor does not activate a school. Pausing editing does not remove published branding.
- Activation checks expose actual blockers and recheck them server-side. Global release evidence is never presented as proof of every school check.
- Suspension/reactivation/closure follow existing valid transitions. A stale expected status fails without losing the submitted reason.
- Demo scope is consistent in chart, totals, previous period and links. Missing data is not reported as zero.
- Optional analytics/Sugi/history failures leave independent school management available.
- Audit event output contains only allowed fields; student messages, credentials and private conversations stay out.

## Review focus: likely failure cases

1. A directory search hides a pending policy elsewhere: independent review query must still return it.
2. A reviewer approves revision N after revision N+1 saves: keep the existing RPC rejection and explain the conflict.
3. A suspended school's editor remains granted: separate grant state from effective access and do not bypass school access rules.
4. A platform-only operator clicks school administration: offer the platform record; no automatic membership or impersonation.
5. Analytics exclude demo in current counts but not comparisons: apply one scope to every query or retain the honest current disclosure.

## Deferred

Hard deletion, account-wide bans, bulk lifecycle actions, automatic policy approval, operator impersonation, new messaging/notification promises, arbitrary school-data access and a new frontend framework. These are independent product/security changes.

The initial planning pass changed no application or database behavior. Current implementation, migration status and remaining checks are recorded in the linked implementation notes.
