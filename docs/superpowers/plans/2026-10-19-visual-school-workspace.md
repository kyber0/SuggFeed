# Visual School Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simplified school preview and long customization form with a faithful, component-selectable desktop/mobile editing workspace, granted per school by a super admin.

**Architecture:** Reuse existing customization storage and publishing. Extract shared live page composition for a private fixture renderer; a dedicated parent editor manages configuration, component selection and a bounded message bridge to one preview iframe. Keep property controls out of the rendered website.

**Tech Stack:** Express, Eta, TypeScript, existing CSS bundles and Sharp; no framework migration or page-builder dependency.

**Spec:** `docs/superpowers/specs/2026-10-19-visual-school-workspace-design.md`

## Global constraints

- SuggFeed remains visible alongside school branding.
- Grant per school; only active school administrators with MFA can edit. Super admins manage grants/reviews without receiving client-editor privileges automatically.
- Reuse `editing_enabled`; no duplicate capability system or new permission model.
- Preserve existing categories, question IDs, drafts, versions, receipt idempotency, policy review, upload checks and private storage.
- Desktop/mobile edit one responsive configuration; no arbitrary CSS/HTML/script or freeform placement.
- Preview uses fictional data and cannot perform real application actions.
- Planning only in this turn. No application/database changes, deployments, tests or build commands are authorized by this plan-writing request.
- During implementation, automated tests may be added/run only after the user requests verification. The coverage below is a future verification specification, not an instruction to run tests now.

## Review focus

1. Preview/live drift: same configuration and data must produce the same components, wrappers and breakpoints, including legacy/default home rendering.
2. Revoked access in an open tab: server denies new operations while preserving unsaved local text and live published appearance.
3. Stale iframe/render messages: another frame or an older response cannot change configuration, selection, page or school.
4. Preview side effects: fixture navigation and overlays cannot reach writes, authentication sync, analytics, service workers or real student data.
5. Narrow screens, keyboard focus and text input: selection overlays and editor shortcuts must not cover controls, steal native undo or lose input.

## File responsibilities

| Area | Files | Responsibility |
|---|---|---|
| Access | `src/lib/school-customization-access.ts` (new), existing customization router/RPCs | One grant + role/MFA check reused across editor routes |
| Preview model | `src/lib/school-preview-model.ts` (new) | Validated page/scenario IDs and deterministic fictional view models |
| Preview rendering | `src/routes/school-customization-preview.ts` (new) | Authorized frame/fragment rendering, separated from the existing router |
| Shared UI | Existing page views/layout/header/mobile-nav/form/card partials; `views/partials/school-pages/` (new) | Common live/preview composition with explicit presentation data |
| Workspace shell | Existing `school-customization.eta`; `public/css/modules/school-studio.css` (new) | Toolbar, canvas, component tree, inspector and mobile sheets |
| Editor model | `src/client/school-studio-model.ts` (new) | Configuration, selection, change grouping, undo/redo and dirty state |
| Inspector | `src/client/school-studio-inspector.ts` (new), `views/partials/school-studio-properties.eta` (new) | Supported property controls and validated assets |
| Frame bridge | `src/client/school-studio-frame.ts` (new) | Selection, safe local preview demonstrations and allowlisted patches |
| Orchestration | Existing `src/client/school-customization.ts` | Parent UI, bridge, current save/publish APIs and conflicts |
| Platform | Existing customization reviews view/router and platform school cards | Grant/revoke capability and audit context |
| Build/docs | `scripts/build-styles.cjs`, script query versions, operations guide | Include scoped styles/scripts and document rollout |

Paths in the table are relative to `apps/web-express` except documentation and migrations. The application currently starts from commit `5912194`; re-read repository state before implementation.

## Shared interfaces

- `PreviewPage = 'home' | 'feed' | 'roadmap' | 'idea' | 'profile' | 'submit'`.
- `PreviewScenario = 'populated' | 'empty' | 'disabled'`.
- `ComponentId` is an allowlisted name such as `school.identity`, `home.hero`, `community.categories`, `submission.instructions`, `submission.question:<uuid>`, `progress.stage:<status>`; it is never a CSS selector or configuration path supplied by the iframe.
- `StudioSelection = { componentId: ComponentId; instanceId?: string }`. A stable category/question ID is separate from the visual component name.
- Browser scripts stay compatible with the current classic-script build: parent load order is model → inspector → orchestration; the frame loads only its independent frame controller. Do not introduce unresolved browser module imports.
- `StudioState = { configuration: SchoolCustomization; savedConfiguration: SchoolCustomization; serverRevision: number; selection: StudioSelection | null; page: PreviewPage; scenario: PreviewScenario; dirty: boolean }`.
- Parent → frame: `initialize`, `patch`, `select`, `set-mode`, `replace-fragment`. Frame → parent: `ready`, `select`, `navigate`, `render-complete`.
- Every bridge message contains `protocol: 1`, `instanceId`, `sequence`, `type` and a validated payload. No message can execute JavaScript, name an arbitrary DOM selector, replace a whole document with caller HTML, or persist a change.
- `window.sfSchoolStudioModel.create(initial: StudioState)` returns `{getState(): StudioState, applyChange(componentId: ComponentId, property: string, value: unknown): void, select(selection: StudioSelection | null): void, undo(): void, redo(): void, markSaved(configuration: SchoolCustomization, revision: number): void, replaceDraft(configuration: SchoolCustomization, revision: number): void, subscribe(listener: (state: StudioState) => void): () => void}`. `applyChange` resolves fields through the registry and validates their supported types; it does not accept arbitrary paths.
- `authorizeSchoolStudio(req,res)` returns `{school,user,state}` only after existing school-admin/MFA checks, enabled grant and global switch; denial is rendered HTML or structured 403/503 according to request type.
- `buildSchoolPreviewModel({school,configuration,page,scenario,theme})` returns the exact locals required by the common page composition with `renderMode: 'studio'` and fictional account/content data. It never calls production content loaders.

## Task 1 — Make the school grant authoritative

**Files:** new access helper; `src/routes/school-customization.ts`; existing platform views; additive migration only if audit metadata/back-end read grants require it.

- [x] Map every existing editor, preview, asset, draft/history, save, publish, restore and review endpoint. Preserve separate platform-review and published-branding access.
- [x] Implement `authorizeSchoolStudio` using the current administrator/MFA boundary and `editing_enabled`. Require it before reading draft/history or private editor assets as well as before writes. Keep authoritative RPC checks.
- [x] Remove the special demo access fallback when it could bypass an explicit grant; use the persisted grant seeded for demo.
- [x] Show the capability's current state and latest grant/revoke actor/time from registry audit events. Retain existing operator/MFA authorization and per-school enable/disable operation.
- [x] Add a private capability read used on window focus and every 60 seconds while visible. Revocation makes the open editor read-only with its unsaved text retained; no polling in hidden tabs.
- [ ] When verification is requested: cover grant/revoke, student/moderator rejection, removed administrator, MFA downgrade, cross-school IDs and disabled global switch across direct requests and RPCs.

**Deliverable:** permission truth is shared by all studio paths; revocation does not change published workspaces.

## Task 2 — Render the real website composition

**Files:** live `home/feed/roadmap/idea/profile.eta`, `layout.eta`, shared partials, new preview model and router; old preview content/wrapper.

- [x] Inventory each page's wrappers, data locals, responsive CSS, conditional UI and script dependencies. Include header, school band, mobile nav and full submission wizard.
- [x] Extract page bodies and shared document composition without changing their live visual structure. Pass school configuration explicitly through includes, including feed cards.
- [x] Resolve the home version-dependent branch so both live and preview use the same component decision and defaults. A version counter alone must not select a different preview layout.
- [x] Implement the six page fixtures and three scenarios with stable IDs, fixed timestamps, fictional authors and bounded lists. Render the exact page components using draft configuration.
- [x] Implement authorized `GET <base>/preview/content?page=&scenario=&theme=` and `POST <base>/preview/render` with a normalized configuration body and revision. Validate all enums, grant/role/MFA, configuration size and fields; response is private/no-store.
- [x] Remove the separate sample header/cards/form design. Keep old preview links as redirects into the new workspace's preview mode, preserving supported viewport/theme choices.
- [ ] When verification is requested: compare identical live/preview fixture renders at 320/375/768/1440 px in both themes, including legacy/default and customized home, empty cards, navigation and the complete form.

**Deliverable:** the preview is the actual responsive website composition supplied with fictional data.

## Task 3 — Make the real composition safe to preview

**Files:** shared layout script manifest, preview route, new frame client, existing server CSP handling.

- [x] Introduce explicit `renderMode: 'live' | 'studio'`. The studio branch loads only presentation/preview controllers and required CSS. It includes no authentication configuration or real account identifiers.
- [x] Exclude live events, auth sync, analytics/activity, service-worker registration, draft recovery, upload, vote, comment, invite and submission handlers from studio documents.
- [x] Use restrictive preview CSP: scripts/assets self, connect/frame/form destinations restricted to what this preview needs; `form-action 'none'`, `base-uri 'none'`, same-origin framing only. Parent checks remain active; do not relax other application pages.
- [x] Provide a small allowlisted preview controller for page switching, menus, roadmap views and opening/advancing a fixture submission panel. Disabled features show their actual disabled state.
- [x] Give studio anchors safe local destinations, including middle-click/context-menu behavior; remove real form destinations and disable native file inputs in the frame. Do not rely only on a click handler to block native navigation/submission.
- [x] Use preview-specific controls/inert action regions for operations without a local demonstration. Never make a generic live submit handler work in preview.
- [ ] When verification is requested: inspect requests while exercising every preview action; no production writes, account sync, email or student-content reads may occur. Cover a malformed preview request and malicious messages.

**Deliverable:** real visual components are interactive enough to review without possessing real application side effects.

## Task 4 — Build the dedicated canvas shell

**Files:** workspace view, scoped studio CSS, parent orchestration, shared build scripts.

- [x] Replace the long primary settings form with the dedicated toolbar/left tree/canvas/right inspector composition specified in the design. Retain existing policy/contact/invitation screens as destinations.
- [x] Implement page/scenario, edit/preview mode, width presets 320/375/768/1440, fit/50/75/100% zoom and light/dark controls. Zoom changes visual scale only; iframe CSS viewport width remains the selected real width.
- [x] Keep one iframe, lazy page switching, independent canvas scrolling and collapsible side panels. At 1024–1279 px use one side panel at a time; below 1024 px use sheets/drawers.
- [x] Use editor-specific CSS scoped to the shell; preview website CSS stays inside the frame. Reserve canvas/image geometry and disable decorative entry animations inside edit mode.
- [x] Show clear saved/unsaved/saving/conflict/review/published status and persistent save/review access. Keep buttons and focused fields above the mobile keyboard/safe area without covering the canvas selection.
- [ ] When verification is requested: cover host widths 320/375/768/1024/1440, 200% text/zoom, dark/light, keyboard-only operation, sheet focus restoration and reduced motion.

**Deliverable:** a focused, responsive visual workspace with useful canvas space.

## Task 5 — Connect selection and property editing

**Files:** studio model/inspector/frame clients; shared component attributes; property partial.

- [x] Build a fixed component registry mapping each `ComponentId` to its label, pages, supported configuration fields and locked/editable state. Do not turn arbitrary DOM attributes into write authority.
- [x] Add stable `data-studio-component` / `data-studio-instance` markers to shared components in studio mode only. Use category/question IDs, never array indices.
- [x] Draw hover/selection overlays in the frame without changing component layout. Compute geometry using requestAnimationFrame; update on frame scroll/resize and relevant ResizeObserver events.
- [x] Wire canvas and keyboard tree selection bidirectionally. Validate exact origin, frame window, instance ID, sequence, message size and payload on both ends. Rotate the instance ID on every frame page/scenario navigation, so messages queued by its previous document are ignored. Bounds and scroll data never authorize a configuration update.
- [x] Reuse existing text, image, palette, category, question, label and feature controls in the inspector. Locked SuggFeed/nav/status semantics get an explanation. Keep image readiness and platform form review gates.
- [x] Coalesce simple property updates per animation frame. Debounce structural server rendering 250 ms, abort superseded requests and ignore older results. Apply trusted server fragments to allowlisted page regions, never caller-selected arbitrary HTML targets. Preserve current scroll/selection and recover when an archived/removed instance disappears.
- [x] Implement category/question/link reordering with keyboard move buttons and optional drag handles; write existing stable-ID arrays. Do not add arbitrary page section ordering.
- [ ] When verification is requested: cover spoofed/stale messages, nested text selection, removed components, archived categories, slow/out-of-order renders and preview/live parity after edits.

**Deliverable:** clicking a real component edits its supported properties and updates the canvas immediately.

## Task 6 — Preserve drafts, undo and publishing

**Files:** studio model/orchestration; existing customization save/publish/restore routes and views.

- [x] Maintain one parent `StudioState` and a 50-entry bounded undo/redo history, with a 2 MB aggregate serialized budget. Group consecutive typing in the same field until blur or 500 ms inactivity; trim oldest history entries before exceeding the budget. Store asset IDs rather than image bytes.
- [x] Support Ctrl/Cmd+S for explicit draft save, undo/redo outside text inputs, and native text undo inside fields. Drafts are not automatically persisted to shared-device browser storage.
- [x] Reuse existing revision-save and publication endpoints. Unsaved changes stay visible in preview; publish operates only on the latest saved draft after meaningful impact confirmation and any protected form/policy review.
- [x] On 409 preserve all local edits, read the latest authorized state, show section differences and offer copy/reload. Do not automatically rebase, overwrite or discard.
- [x] Restoring a version creates a draft through existing RPCs, reloads current state and clears local undo. Warn before replacing unsaved changes. Keep category-history conflict explanations.
- [x] Keep dirty navigation warnings, field-local validation, accessible save errors and actionable upload setup failures. Gate late save/render responses by current school, instance and local edit sequence.
- [ ] When verification is requested: cover undo across pages/viewports, native textarea undo, simultaneous administrators, save failure/offline, revocation while saving, publish failure and policy/form-review changes.

**Deliverable:** the visual UI uses the existing safe draft lifecycle without losing work or publishing implicitly.

## Task 7 — Integrate navigation and release gradually

**Files:** school settings/staff navigation, platform controls, operations guide, compiled client assets; migrations only where required above.

- [x] Expose **Customize workspace** to eligible school administrators. Keep platform grant controls on the platform dashboard; a super admin without school-admin membership receives no client-editor shortcut.
- [x] Preserve existing customization URLs or redirect to the dedicated workspace. Remove the duplicated small preview UI and obsolete preview controller only after all entry points reach the new flow.
- [x] Compile scripts/styles through existing build commands and bump asset query versions. Preserve private preview cache/CSP boundaries.
- [x] Document grants/revocation, the six fixture pages, supported property boundaries, conflict recovery, image setup and existing publication/review requirements.
- [x] If implementation is approved, run build/typecheck and compile Eta templates; these do not replace requested functional verification. Do not add/run automated tests without that separate request.
- [x] Enable the new UI for the already-granted demo first. Obtain the verification evidence specified above before expanding. Rollback changes editor routing/availability and keeps published configuration live.

**Deliverable:** the dedicated visual editor replaces the current editor without breaking published schools or existing links.

## Implementation order and completion gates

1. Access enforcement and common renderer.
2. Preview safety, desktop shell and Home selection as an integrated vertical slice.
3. Remaining page compositions, inspector types and responsive sheets.
4. Undo/conflicts/review/publish integration.
5. Requested verification, demo review and controlled rollout.

Do not release a shell whose canvas still uses the simplified sample template. The first usable demo must select and edit the actual shared Home hero/logo, render both viewports, preserve draft/publish separation and enforce the school grant.

## Planning evidence / unresolved items

- Confirmed user choice: enable per school for its active school administrators.
- Read existing preview/editor routes, template composition, configuration types, role helper usage and existing grant operations. Reviewed UI UX Pro Max accessibility/interaction/layout guidance.
- This plan introduces no new configurable page layout or client role. A future request for freeform positioning requires a separate design and persistence model.
- No application/database changes, tests, builds, migrations, commits or deployments were performed for this planning request. Only this plan and its design specification were written.

## Plan self-review

- Permission choice is confirmed and represented in Task 1; no account-specific grant table is introduced.
- Real-page fidelity and full submission composition belong to Task 2; preview write/native-navigation isolation belongs to Task 3.
- Desktop/mobile layout, selection and supported properties belong to Tasks 4–5; version/conflict/access-loss behavior belongs to Task 6.
- All five review-focus conditions have explicitly assigned future verification coverage. No such checks have run during planning.
- Parent/frame message names, configuration type and model API are shared across the tasks; implementation remains within the existing browser script build.
- Rollout depends on rendering fidelity and safe editing, not just completion of the shell. Implementation can proceed inline using the existing execution workflow after plan review.


## Implementation ledger — 19 October 2026

Base: `5912194`. Tasks 1–7 implemented in the visual workspace change. Deferred verification checklist items remain unchecked intentionally.

- Task 1: shared authorization covers studio reads, assets and writes; requires persisted per-school grant, active school admin and existing MFA. Focus/visible polling and platform audit display connected. No database migration required.
- Task 2: six fixture models render actual Eta pages/layout with explicit configuration propagation. Legacy preview URLs redirect; independent miniature preview removed.
- Task 3: studio output contains only the allowlisted frame controller; anchors/form targets are neutralized and preview CSP blocks native submission. Fixture navigation and wizard stay local.
- Task 4: full-width editor, one real-viewport iframe, independent canvas/panels, zoom/theme presets and mobile sheets implemented.
- Task 5: fixed component registry, stable category/question IDs, selection overlays, typed inspector properties, keyboard/drag reordering, local patches and debounced trusted rendering implemented.
- Task 6: bounded in-memory undo, explicit revision save, conflicts/copy, publication confirmation, fresh history and restore implemented. Responses preserve newer local edits.
- Task 7: granted-admin settings entry, platform grant management, operations guide, versioned compiled assets and demo-only existing grant retained. No new school grants, publication, invitations or emails performed.

### Decisions and review

- Ruling: reuse the complete existing Eta page/layout instead of extracting identical wrapper partials. This keeps live composition shared with less duplication; the renderer strips trusted layout scripts before adding its own controller. Cost if wrong: future live script/markup changes require preview-safety review.
- Ruling: keep tests unrun and unmodified, following the host instruction and approved plan. Build, typecheck, Eta compilation and local fictional visual inspection provide limited evidence, not functional authorization proof. Cost if wrong: runtime permission/concurrency defects may remain; keep rollout limited pending requested verification.
- Fresh whole-branch reviewer `studio_review` found status patches destroying timeline containers, missing description refreshes, HTML access-denial handling and late publish/restore data loss. All four corrected: patch only dedicated labels, structurally render descriptions/labels, check denied status before JSON, preserve newer edits when responses return. No second reviewer or automated tests run.
- No minor findings deferred by that review.

### Evidence

- `npm --prefix apps/web-express run build`: passed.
- `npm --prefix apps/web-express run typecheck`: passed (type compilation includes existing test source; no test execution).
- Eta compilation: 56 templates compiled.
- Fictional localhost browser rendering: all six pages rendered; only studio frame script loaded; headline edit updated real Home composition; 320 px host had scrollWidth 320. Desktop/mobile screenshots inspected. This does not establish authenticated production behavior.
- Existing production schema/grants reused; no migration applied and no hosted application records changed during implementation.
