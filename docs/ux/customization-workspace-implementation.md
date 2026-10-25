# Functional SuggFeed Studio

## Delivered

- A Figma-style sidebar: collapsible Pages, nested Layers for the current page, and a separate Assets tab for shared school settings. The shortcut-card grid and duplicate page selector were removed.
- Nested sections, content, categories and questions have distinct icons, expand/collapse controls, search and a visible selection. Canvas selection reveals the matching layer; current-page scrolling stays synchronized. Page-state controls live in preview options. Only existing per-page sections are listed.
- Real-template previews for 37 page states, including visitor/member Home, Ideas, roadmap views, detail drawer/page, profile, form steps/recovery/receipt and staff queues/work views. Preview interactions use fictional content and cannot submit, publish decisions or invite members.
- Inspector scope, inherited-value hints, effective content defaults and supported reset controls. Light/dark color samples update alongside the preview; incomplete hex values survive selection changes and block saving until corrected or undone.
- A preset/question-type change is one undo operation. No custom CSS, arbitrary HTML or free-position layout was introduced.
- Draft autosave after one second of inactivity, explicit Save now, revision conflict handling, offline/resume states and unload protection. Edits made during a save remain dirty and save afterward. Unsaved state remains in memory, not persistent browser storage.
- Draft/Published comparison switches both preview and inspector. Published properties are read-only; the server selects the canonical published configuration.
- Publication review shows concrete before/after values, scope, consequences and links to settings. Publication remains explicit and requires the exact reviewed draft revision.
- History can compare an immutable version with the draft. Restoration still uses the existing restricted RPC and creates a draft.
- Compact mobile toolbar, independent panel scrolling, native dialogs centered in the viewport, and cache-busted Studio assets.

## Code map

- `apps/web-express/src/client/school-customization.ts`: editor orchestration, autosave, source comparison, recovery and review.
- `src/client/school-studio-model.ts`: grouped undo and safe state updates.
- `src/client/school-studio-inspector.ts`: effective values, validation and resets.
- `src/client/school-studio-tools.ts`: human-readable change comparisons using text-only DOM output.
- `src/client/school-studio-frame.ts`: fictional state preparation and selection.
- `src/lib/school-preview-model.ts`: shared state registry and synthetic data.
- `src/routes/school-customization*.ts`: authorized previews, save metadata and school-scoped history reads.
- `views/school-customization.eta`, `public/css/modules/school-studio*.css`: workspace interface.
- Build wiring, strict client declarations and generated Studio JS/CSS accompany the source.

Paths under `src`, `views` and `public` above are relative to `apps/web-express`.

## Access and data

No migration, dependency or environment-variable change. Existing per-school editor grants, school-admin/MFA checks, tenant-scoped assets, expected revisions, publication transactions and protected form/policy review remain authoritative. Cosmetic draft changes do not change policy approval. There are no hosted data writes in the implementation inspection.

## Checks performed

- Full Express production build and full TypeScript check, including strict browser compilation.
- All 95 Eta templates compiled; all 37 preview variants rendered through the real preview renderer.
- Synthetic local Chromium inspection: all 37 state selections loaded without page errors; autosave, Draft/Published content and inspector separation, publication comparison, invalid-color retention/undo.
- Concurrent-admin simulation: local input retained, meaningful conflict comparison shown, cancel preserved edits, confirmed loading replaced local differences.
- Offline simulation: edits stayed local and automatically saved after reconnection.
- Editor document widths inspected at 320, 375, 768 and 1280 pixels, plus a 1440-pixel desktop screenshot. No horizontal document overflow observed. A vertical overflow caused by replaced controls escaping their scroll panel was fixed at the containing block.

## Limits and follow-up

- Automated test suites were not added or run for this task. There is no dedicated Studio lint command; TypeScript and the production compiler checked the changed subsystem.
- Local fixtures simulate APIs and use real templates; they do not establish production database authorization, concurrent RPC behavior or hosted delivery health.
- Preview state content is fictional. It does not impersonate users or reproduce every live async state. No route or unsupported component is made editable merely by including its preview.
- Some broad plan examples remain outside this bounded release: every management screen, live notification workflows, arbitrary layout editing and full application end-to-end coverage.
- Reloading or closing a tab while offline can lose unsaved memory; the unload warning and explicit private-copy recovery reduce that risk. No automatic merging of competing drafts.
- Physical iPhone/Android keyboards, assistive technology and production deployment behavior still need real-device/live checks.

## Sidebar refinement

The follow-up redesign replaces the earlier Pages/Components/task-card arrangement. Desktop uses compact rows and a 256px sidebar; mobile retains the existing modal sheet with larger touch controls. Local Chromium inspection covered page changes, Assets-to-form navigation, collapse/search and 320/375px sheets without page errors or document overflow. The production build and TypeScript checks were repeated. No automated tests or live database checks were run for this refinement.

## Canvas content editing

- Click existing school-owned text in the preview to type in place. Bindings cover the school display name, welcome headline/introduction/message/help, official-link labels, category names/descriptions, question wording/help, form instructions/examples and public roadmap stage labels where rendered.
- Press Enter for a short field, Ctrl/Command+Enter for multiline text, or use the unscaled canvas Done action. Escape/Cancel restores the original configuration value, including inherited defaults. Selecting and leaving an inherited field does not create an override.
- Structured settings (links, categories, questions, images, email content and participation switches) use a floating content editor on the canvas. The right inspector maps selection to its page/section design controls; colors, spacing, alignment, surfaces and layouts stay there.
- Inline edits share the current model, expected revisions, undo grouping, draft autosave, review and publication gates. Autosave/publication pause during a typing session; preview fragments are deferred so an update cannot remove the caret. Plain-text paste, field-length limits and an explicit property allowlist prevent arbitrary JSON/HTML or user-content mutations.
- The real submission panel's centering transform is preserved in Edit mode; the old broad hover reset moved the panel away from clicks.
- These controls edit the existing school-owned schema, not every application's fixed word or a student's proposal/comment. Other selectable sections retain their supported design controls. No new copy-override schema, arbitrary CSS/HTML, database migration, dependency or permission change was introduced.
- Local browser inspection covered inline editing, autosave, cancel, Published read-only behavior, floating content, physical category clicks and 320/375px document bounds. Full production build and TypeScript checks were run; automated test suites, production database writes and real-device keyboards were not exercised.
