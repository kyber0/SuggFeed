# School Visual Customization Implementation Plan

> For implementation: use the executing-plans workflow task by task. Do not delegate without user authorization. This is planning only; no application or database changes have been made.

**Goal:** Give authorized school administrators a complete, coherent school theme and meaningful screen-specific visual editing, with a polished preview workspace.

**Architecture:** Extend the existing Express/Eta studio, immutable configuration versions, school-scoped rendering, and shared browser/server color helper. Use typed theme tokens and explicit component registries backed by the actual templates, with bounded layout choices rather than arbitrary CSS. Keep drafts private and preserve the current atomic publish, revision conflict, authorization, MFA, rollout, and restoration mechanisms.

**Tech stack:** Express, Eta, TypeScript, modular CSS, native color input, existing image pipeline, PostgreSQL configuration RPCs. No new editor framework or dependency is planned.

**Spec:** User request dated 2026-10-21: edit the whole school color scheme, provide different editable components per screen, expand customization, and improve editor UI/UX. Confirmed scope: theme applies to all student and staff/admin screens within each school; the editor supports controlled section ordering, approved layouts, spacing, card styles and visibility.

## Findings

- `school-studio-model.ts` has a small generic registry. Identity, features, email and locked navigation use an empty page list, so they repeat on every page.
- `school-studio-frame.ts` annotates a handful of generic selectors. Many page elements cannot be selected, and some selections identify a broad feature group rather than the clicked visual component.
- `school-colors.ts` supports one accent, derived contrast text, and tints. `customization.css` applies these only to selected actions, topics and welcome components.
- Schema version 1 and SQL validators explicitly allowlist the existing fields. New appearance/layout fields require coordinated validation, publication summaries, preview rendering, and backward-compatible restoration.
- The editor currently previews home, feed, roadmap, idea, profile and submission. Other client/staff screens need explicit preview models rather than pretending the six existing previews cover the whole school.
- Global and school settings must be visibly distinguished. An administrator changing an example idea or profile must never edit a real person's content through the visual editor.

## Global constraints

- Keep SuggFeed plus school branding.
- School theme changes affect only routes resolved to that school. Platform/super-admin, other schools, and account screens without a selected school keep the platform theme.
- Preserve semantic success/error/warning colors, visible focus, readable body text and supported keyboard/touch interactions.
- No arbitrary CSS, scripts, markup, URLs for remote fonts, or absolute positioning. Freeform positioning is outside the agreed scope.
- No legal-policy approval reset from cosmetic publication. Access, privacy, consent, retention, moderation, staff powers and data collection remain governed by their existing reviewed settings.
- Restore creates a draft; it never restores memberships, removed content or permissions.
- No automated tests added or run unless the user requests verification. The checks below are planned acceptance checks, not results.

## Proposed editor UX

Desktop: compact toolbar above a three-column workspace. Left: separate Workspace theme and Current page sections, page search, page outline and layers. Center: real-template preview with desktop/tablet/mobile devices, fit/100% zoom, light/dark, edit/preview and reload. Right: selected component breadcrumb and focused property groups (Content, Appearance, Layout, Behavior when relevant).

No selection: show a helpful selection prompt and current page overview, not unrelated fields. Selection: outline exactly one supported component, display whether its changes affect this page or the whole workspace, and show current resolved values. Fields inherited from the theme show their source; reset removes the override. Selection changes and page changes must not discard unsaved input.

Mobile editor: canvas-first with accessible Pages and Properties sheets, focus return and a reachable save status/action bar. Preview device sizes are real viewport layouts; the toolbar should not consume the preview space. Use existing SuggFeed visual tokens with restrained borders, clear hierarchy and consistent icon buttons.

## Theme controls

1. Start from a complete preset or existing school accent.
2. Edit primary and secondary brand colors, page background, card surface, elevated surface, heading/body text, muted text, borders and links using labeled swatches, native pickers and validated hex inputs.
3. Derive hover/pressed/selected fills, on-brand text and focus combinations from validated inputs. Show live contrast feedback and prevent publication of unreadable combinations; offer an explicit correction without silently replacing saved colors.
4. Provide light and dark variants: derive the initial counterpart, allow independent editing, and preserve both. Respect each user's theme preference.
5. Add bounded presentation choices: comfortable/compact density, three corner styles, approved border/shadow levels and a small set of existing font stacks. No arbitrary base font size, inaccessible line height or remote font loading.
6. Theme should cover school navigation, student screens, dialogs, forms, cards, tables and empty/error/loading states. Include school staff/admin screens as confirmed by the user. Emails receive only supported brand colors with readable email-safe fallbacks.
7. Theme drawer shows representative form, card, selected tab, link and primary/secondary buttons, plus contrast issues and reset-to-preset.

## Screen-specific editing matrix

| Screen | Selectable/editable elements | Bounded choices |
|---|---|---|
| Home | School identity, cover, welcome heading/body, links/help, welcome actions, optional information sections | Cover crop/focal point, hero alignment/layout, section visibility/order, content width |
| Idea feed | Page introduction, topics/filter area, idea cards, supporting sidebar blocks, empty state | Comfortable/compact cards, metadata emphasis, approved sidebar placement/visibility, display of existing optional blocks |
| Idea detail | Panel header/tags, proposal section, progress presentation, support block, discussion empty state | Approved split ratios, section emphasis, metadata density; Back and accessible discussion remain available |
| Roadmap | Summary, category/stage filters, board/list/timeline presentation, stage labels, empty state | Default supported view, card density, bounded optional metadata and explanatory copy |
| Profile | School-managed page guidance, activity layout, activity tabs, school-updates section | Approved layouts/density; user name, biography, avatar and personal records remain user-owned |
| Submission | Instructions/examples, category presentation, question order/help, attachment instructions, success guidance | Existing supported fields; required questions/new collection still use review and submission handling |
| Updates/inbox | Page guidance, update cards, empty-state help | Supported density and labels; never edit actual messages, notifications or delivery consent |
| Staff workspace | Dashboard blocks, queue/table presentation, board cards, school-owned help | Bounded density, visible optional columns, card metadata and saved layout defaults; required actions/audit fields remain available |
| School settings/access | School-managed help and general theme | Functional policies, enrollment, invitations and legal fields stay in dedicated settings with existing validation |

All new screen controls are included only after their template/render path is implemented. Informational locked elements explain why. Behavior switches live in Workspace settings, not repeated as if they were visual properties of every card.

## Data and files

Modify:
- `apps/web-express/src/lib/school-customization.ts`: versioned appearance/page schema, defaults, normalization and allowed values.
- `apps/web-express/src/client/school-colors.ts` and server adapter `src/lib/school-colors.ts`: one deterministic semantic token engine for both modes.
- `apps/web-express/src/client/school-studio-model.ts`: change paths, undo grouping, global/page separation and registry integration.
- `apps/web-express/src/client/school-studio-inspector.ts`: shared current-value fields and context-specific property groups; split focused theme inspector if needed.
- `apps/web-express/src/client/school-studio-frame.ts`: explicit markers, supported selection/visibility, live theme patches and safe selection retention.
- `apps/web-express/src/client/school-customization.ts`: shell state, page switching, device controls, dirty status, save/publish and preview error handling.
- `apps/web-express/views/school-customization.eta`, `public/css/modules/school-studio.css`: polished editor shell and responsive panels.
- `apps/web-express/src/lib/school-preview-model.ts`, `src/routes/school-customization-preview.ts`: additional read-only fixtures and authentic screen rendering.
- `apps/web-express/src/lib/school-context.ts` (confirm exact resolved context module at implementation), `views/layout.eta`, `public/css/modules/customization.css`: scoped published theme application.
- Actual relevant school templates and shared partials: stable component markers and approved configuration consumption.
- Build outputs generated by the existing scripts and browser declarations/strict cohort as required.

Create focused modules only where needed:
- `src/client/school-studio-registry.ts`: page-aware manifest; component ID, label, template marker, permitted property paths, scope and availability.
- `src/client/school-studio-theme.ts`: theme inspector and contrast presentation.
- `src/lib/school-presentation.ts`: allowlisted page presentation defaults, validation and normalized render values if the existing configuration module becomes too broad.
- Ordered additive migration under `supabase/migrations/`: revised JSON validator, default normalization, publication summary and backward-compatible reads/restores. Name it for its actual implementation date/order.

Do not split modules just to match this list; retain existing conventions and keep one owner per responsibility.

## Implementation tasks

### Task 1: Resolve scope and lock the editor specification

- [x] Scope confirmed: all screens within each school, including staff/admin; controlled layouts, section ordering, spacing, card styles and visibility.
- [ ] Inventory all routes/templates/components, CSS variables and hard-coded brand colors; distinguish semantic/status colors.
- [ ] Produce the exact component/property manifest per screen. Each control must have a real render target and a clear scope badge.
- [ ] Define which existing content can be reordered/hidden without disabling a required action. Use ordering arrays of stable IDs and a finite layout enum.
- [ ] Acceptance: no generic component is presented as page-specific; no unsupported screen is listed as editable.

### Task 2: Complete school theme with safe compatibility

- [ ] Add a schema version strategy supporting existing version-1 snapshots, translating old palette values into the new normalized theme while preserving appearance until publication.
- [ ] Implement semantic light/dark tokens and map school UI components to them. Remove conflicting school-specific accent overrides only where replaced.
- [ ] Update server and SQL validators together: strict colors/enums, bounded lengths/object size, unknown-key rejection, preserved tenant authorization and publication transaction.
- [ ] Update draft save, review summary, restoration and cache versioning for appearance/page changes. Cosmetic changes leave policy approval untouched.
- [ ] Acceptance: old schools render as before, independent light/dark schemes work across school routes, unrelated scopes remain unchanged, and draft theme never leaks into published views.

### Task 3: Page-aware component selection

- [ ] Split Workspace theme/settings from the Current page tree. Move email/access/feature configuration out of the repeated page outline.
- [ ] Drive outline, preview markers, allowed property editing and inspector selection from consistent stable IDs.
- [ ] Use closest selectable component with a parent breadcrumb; distinguish selectable, shared and locked elements. Keep keyboard outline navigation usable.
- [ ] On page change, clear an invalid selection and render a page-specific prompt. Do not retain the prior inspector accidentally.
- [ ] Acceptance: each page has its own meaningful components; every listed component selects a visible target or explains its conditional visibility.

### Task 4: Editor design and first page controls

- [ ] Implement toolbar, panels, scope badges, search, device/theme controls, no-selection state and mobile sheets.
- [ ] Bind current resolved values, inheritance indicators and reset actions. Preserve fields/focus while typing and avoid recreating the inspector on every keystroke.
- [ ] Implement complete home, feed and idea-detail property sets first, including allowed layouts and metadata density.
- [ ] Patch appearance locally without rerendering the entire page. Debounce server-rendered structural updates, cancel superseded requests and reconcile actual styles before replacement.
- [ ] Acceptance: quick edits keep latest values, CSS remains loaded after page/section changes, private answers/navigation and composer remain usable, and preview never sends real actions.

### Task 5: Complete the remaining screen controls

- [ ] Add roadmap, profile and submission controls, followed by school updates/inbox and staff previews.
- [ ] Keep custom form changes tied to form versioning, receipts, existing submission validation and policy-review rules.
- [ ] Provide fictional populated/empty/long-content scenarios for each supported screen; expand disabled-feature scenarios only where relevant.
- [ ] Acceptance: page controls affect the actual published renderer and preview equally; no sample-content edits can mutate user submissions, profiles or messages.

### Task 6: Accessibility, publication and rollout review

- [ ] Inspect at 320, 375, 768 and 1440px, plus short laptop height, light/dark, reduced motion, keyboard-only and zoomed text.
- [ ] Check contrast on text/buttons/links, visible focus, selection hit targets, dialogs, native file drop controls, internal scrolling and device preview behavior.
- [ ] Verify stale revisions, revoked administrators, disabled editor, cross-school requests, preview isolation, rollback and failed publication.
- [ ] Run type checking and production build; only add/run automated checks when requested. If verification is requested, cover token contrast, schema compatibility, registry/property authorization, distinct screen trees, preview/published parity and tenant isolation.
- [ ] Measure changes in preview requests and generated asset weight. Cache compact published theme by school/version, keep draft previews out of shared caches, and avoid new runtime dependencies.
- [ ] Roll out to fictional demo school, inspect a published version, then enable other schools through the existing super-admin school-level grant.

## Release gates and risks

- A component is complete only when its control, validation, saved draft, real preview, published screen and restore behavior agree.
- Full-scheme coverage requires replacing hard-coded brand styling carefully; semantic colors and contrast must be reviewed in both modes.
- Version-1 snapshots must remain restorable after the schema expansion; do not destructively rewrite historical versions.
- Freeform positioning would add collision management, separate device layouts, responsive rules and substantial accessibility constraints. It needs a different approved design, not a hidden expansion of this plan.
- No application/database changes or automated checks were made for this planning task. The scope answers above are confirmed; implementation remains a separate task.

## Implementation record

Implemented after user approval. See `docs/features/school-visual-editor.md` for supported controls and `docs/fixes/2026-10-21-school-visual-editor.md` for observed verification and limitations. Both additive validator migrations are recorded on the connected project; existing drafts and published configurations were not rewritten. No automated tests were requested or run.
