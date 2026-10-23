# SuggFeed Studio interface refinement

## Goal

Give the school customization workspace a coherent, minimalist SuggFeed interface.
The preview remains the visual focus. Administrators should immediately understand
what is selected, what a change affects, whether it is saved, and how to publish.
This is an interface plan; application implementation has not started.

## Source findings

- The application uses Express, Eta, browser TypeScript and modular/generated CSS.
- `school-customization.eta` has five static selects, separate toolbar actions,
  two editing panels, an iframe canvas, and review/history/conflict dialogs.
- `school-studio-inspector.ts` generates additional native selects, checkbox rows,
  text fields, color controls, repeated items and image-upload controls.
- The inspector already centralizes field generation. This is the integration
  point for shared controls rather than separate implementations for each field.
- Editor chrome contains hard-coded colors and dense breakpoint-specific overrides.
- Model subscriptions, grouped undo, revision checks and preview patches already
  exist. Interface changes must retain their data contracts and event behavior.
- The current publication flow requires saved changes. Its controls need a clear
  explanation of that state before administrators try to publish.

## 1. Visual direction

Use SuggFeed's existing blue, orange wordmark, typography and icon language.
Editor surfaces are neutral, with a single blue action/selection accent. Orange
remains a brand detail; success, warning and error colors keep their meanings.

- Flat white/soft-gray surfaces in light mode; quiet layered dark surfaces in dark mode.
- One-pixel dividers, restrained corner radii and shadows reserved for floating menus/dialogs.
- A 4/8px spacing scale; 8px control corners, approximately 12px panel corners.
- Existing application font, 14–16px editing text and clear label/value hierarchy.
- 44px touch targets, even when visual icon buttons look smaller.
- Compact headings and short, contextual guidance instead of repeated explanatory banners.
- Selected, hover, focus, disabled, loading and error appearances use shared tokens.
- Editor chrome has its own SuggFeed theme. Editing a school's colors changes the
  preview without making the editor's own controls unreadable.

## 2. Workspace layout

### Desktop, 1280px and above

Use three predictable regions: approximately 224px component sidebar, flexible
canvas, approximately 320px property inspector. Verify minimum canvas width before
showing both sidebars; permit intentional panel collapse.

**Top bar:** back, workspace/school identity, concise save status, undo/redo,
Edit/Preview toggle, Save draft, Review & publish. Only the publication action
uses the strongest visual emphasis. Keep advanced actions under a More menu.

**Left panel:** one page picker, component search, grouped component tree and a
compact footer for history/help. Retain a single source of truth for page selection.

**Canvas toolbar:** desktop/tablet/mobile segmented controls, zoom/fit, appearance
and overflow actions for sample scenario and reload. Keep controls near the object
that they affect. The canvas itself uses a quiet background and restrained outline.

**Right panel:** selection breadcrumb, selected component name and scope, followed
by grouped properties. Show whether a setting affects the entire school, this page
or this component. Keep exceptional permissions and policy messages contextual.

### Tablet

Show the canvas plus one panel at a time. Switching panels preserves the current
selection, values and scroll position. Do not squeeze three columns into the viewport.

### Phone

Keep the canvas with an obvious Edit selected component action. Pages and properties
open in accessible full-height sheets. Advanced preview controls live in a sheet/menu.
Keep Save and Review discoverable, respect the keyboard/safe areas, and use a
visible close/back control. No tiny scaled desktop inspector or horizontal toolbar.

## 3. Shared SuggFeed controls

| Control | Planned behavior |
|---|---|
| Select/combobox | Branded trigger, current value, chevron, selected checkmark, optional descriptions and bounded option list |
| Searchable select | Search only when a list is long enough to benefit; explicit no-results state |
| Segmented control | Device, Edit/Preview and short exclusive choices; visible selected state and keyboard support |
| Text field/textarea | Stable label, current value, focus ring, nearby help/error and optional count |
| Checkbox/switch | Switch for immediate feature toggles; checkbox for consent/multiple selections; native semantic inputs retained |
| Color field | Theme swatch, editable hex value, accessible custom picker and contrast result |
| Color picker | Saturation/value surface, hue control, swatch presets and hex input; only supported opaque hex colors |
| Upload | Branded drop area, choose/replace/remove, thumbnail, limits and progress/error; underlying system file dialog remains native |
| Reorder list | Compact rows with visible grip, selected/drop state, up/down keyboard alternatives and clear boundaries |
| Menu/popover | Consistent padding, rounded surface, bounded height, correct layering and outside-click/Escape dismissal |
| Dialog/sheet | Consistent header, content, footer, focus management, scroll ownership and explicit primary action |
| Tooltip | Short explanations for icons/disabled reasons, available by focus as well as hover |

### Select requirements

Enhance existing select values rather than creating an unrelated settings state.
The selected value must be visible when the field opens, after undo/redo, after
restoration and after inspector rerender. Support Arrow keys, Home/End, Enter,
Space, Escape, type-ahead and announced selection/expanded state. Tab moves onward.
Menus open upward when needed, remain within the viewport and scroll internally.
Never position a host control inside the preview iframe or under its canvas layer.

Keep a native/select fallback if enhancement fails. Preserve form submission,
validation, disabled state and existing input/change listeners. A selection should
create exactly one model update/undo transaction; merely opening a menu creates none.

### Color requirements

Reuse current school design roles and contrast validation. Distinguish light and
dark settings. Display the actual current color rather than a blank placeholder.
Support keyboard editing through hex and hue/saturation/value alternatives. A drag
updates preview in at most one animation frame and groups into one undo action.
Do not expose alpha or an eyedropper as a requirement when schema/browser support
is absent. Failed validation retains the entered value and explains the problem.

## 4. Inspector organization

Organize the selected component into focused groups appropriate to that component:
Content, Appearance, Layout, Behavior and Advanced. Hide inapplicable groups.

- Theme: semantic color roles, presets and light/dark appearance.
- Identity: school display name, logo and cover.
- Page: supported layout, section ordering, spacing and visibility.
- Component: its actual text, appearance and supported behavior.
- Categories/questions/links: compact summaries; expand or select one item to edit.
- Progress/email/features: existing supported options, with consequences near controls.

Show current published/draft values using the existing model; never substitute a
blank input for a value that exists. Label inherited values explicitly, and offer
Reset to inherited/default only where that behavior is supported. Resetting a
section must not silently reset the whole school's design.

Avoid inspector-wide DOM replacement for ordinary keystrokes. Structural changes
may rerender with focus, selection, open menus and scroll reconciled or safely closed.

## 5. Selection and canvas experience

Use a thin hover outline and a stronger selected outline, with one concise name
chip. Clicking the page selects the corresponding editable component and reveals
its properties. Selection must remain synchronized with the component tree.

Keep the website layout stable while inspecting it. Do not inject controls into
its content flow. Respect the existing Edit/Preview protocol, iframe boundary,
fictional sample content and restrictions on real actions. Panning and selection
must not conflict with dropdowns, text selection, drag operations or nested scrolling.

Provide keyboard-accessible tree navigation and property access. Do not require
clicking tiny pieces of the preview as the only way to select a component.

## 6. Save, publish and recovery

Use a concise state vocabulary: Unsaved changes, Saving, Draft saved, Save failed,
Changes conflict, Publishing, Published. Keep technical revision details in history.

- Save draft preserves the current workflow and shows success in place.
- Review explains meaningful changes and their effects before publication.
- If saving is required, explain why Review/Publish is unavailable beside the action.
- Uploading, validation and permission errors identify the next step.
- Conflicts preserve local edits and the existing comparison/recovery choices.
- Restoring a version still creates a draft; it never silently publishes.
- Permission revocation, MFA requirements and platform review remain authoritative.

## 7. Motion and performance

Use short, finite 200ms opacity/transform transitions for menus and selection feedback.
Honor reduced motion. Avoid canvas-wide entrances, background loops, heavy blur,
animated panel widths and visual movement of focused fields.

Use delegated events, one active floating surface manager and shared positioning.
Mount new controls after inspector rendering, reconcile values after model changes,
and dispose observers/listeners when a control is removed. Do not introduce React
or another animation/component library. Use existing TypeScript and native browser APIs.

Preview color/text patches should reuse the existing message batching; avoid
iframe reloads for cosmetic changes. Structural changes retain the current guarded
render path. Scope editor CSS so published school screens are not restyled.

## 8. Implementation areas

- `views/school-customization.eta`: shell, toolbar, panels and dialogs.
- `src/client/school-studio-controls.ts` (new): shared control enhancement,
  floating surfaces, keyboard interaction and cleanup.
- `src/client/school-studio-inspector.ts`: consistent field rendering and mounting.
- `src/client/school-customization.ts`: control synchronization, panel state and feedback.
- `src/client/school-studio-frame.ts`: selection presentation only where needed.
- `public/css/modules/school-studio.css`: scoped editor tokens and layouts.
- Existing style/client build and cache references, plus generated outputs.
- Usage/maintenance documentation for the controls and editor states.

Keep the model, publication API and authorization interfaces stable. Extend a data
contract only if an actual supported interaction requires it; this visual redesign
is not authorization to introduce new customization settings or remove review gates.

## 9. Delivery sequence

1. Inventory all current editor controls and states; capture the existing layout.
2. Establish shared tokens, shell and panel hierarchy.
3. Implement custom dropdown/menu primitives and migrate toolbar/inspector selects.
4. Migrate fields, switches, color picker, uploads and reorder controls.
5. Unify review, history, conflict, empty, error and loading states.
6. Review actual preview selection, undo/redo, save/publish and responsive integration.

Keep each phase reviewable. Do not ship a partial control migration with incompatible
values, events, keyboard behavior or duplicate element IDs.

## 10. Acceptance and checks

When verification is authorized, inspect 320, 375, 768, 1024, 1280 and 1440px,
light/dark chrome, contrasting school palettes, long school names and long options.
Check keyboard-only interaction, screen-reader names, 200% zoom, phone keyboard,
viewport-edge popovers, file selection and drag alternatives.

Check existing values, rapid edits, grouped undo/redo, panel switching, selection
sync, preview patches, failed upload/save, stale revisions, restored drafts and
revoked editor access. Ensure failed publication preserves the live version.

Run type checking and production builds. Automated tests should only be added or
run when requested. Report actual checks and remaining device coverage; a planning
review is not evidence that an interaction or deployment has been verified.

## Scope and current status

This plan covers the customization workspace, its host controls and its dialogs.
School rendering, student navigation, authentication, database contents and legal
review rules are outside the visual redesign. No implementation, migration,
deployment or automated test was performed during this planning task.

## Implementation delivery

The approved interface is implemented in the existing Eta/TypeScript architecture:
custom selects and color surfaces, shared control styling, grouped inspector,
compact responsive editor shell, draft feedback and confirmation dialogs.
Operational notes and actual verification coverage are recorded in
`docs/operations/suggfeed-studio-controls.md`. No database migration or new
runtime dependency is part of this delivery.
