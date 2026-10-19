# Visual school customization workspace

## Product brief

Give enabled school administrators a dedicated visual editing workspace. They select components directly on a faithful preview of their school's website and edit supported properties in an inspector. The canvas supports real desktop and mobile viewports. The experience borrows Figma's selection, canvas and inspector patterns while retaining SuggFeed's shared design system and publishing controls.

Confirmed permission model: a super admin grants the capability **per school**, giving access to that school's active administrators. Moderators and students do not receive editor access. Platform operators manage grants and reviews from their platform dashboard; this does not automatically make them school editors.

## What needs correcting

- `school-customization-preview-content.eta` currently builds a simplified page with a separate header, sample cards and partial form. It is not the live website composition.
- `school-preview.ts` currently changes an iframe width/theme; it has no selection or property editing.
- The editor is a long settings form with a small preview, rather than a dedicated visual workspace.
- Preview reads currently require administrator access but do not consistently require the school's editor grant.
- Live home rendering has a version-dependent hero branch. Live/preview rendering must share the same decision; a draft must not silently introduce a different layout simply because a version exists.
- Shared partials need explicit customization context propagation; for example feed cards currently receive `{item}` without an explicit school presentation context.

## Experience

Desktop, at least 1280 px wide:

- Top toolbar: back to school administration, school name, page selector, desktop/mobile selector, width/zoom, light/dark, undo/redo, save state, review and publish.
- Left panel, initially 224 px: **Pages / Components**, with a searchable component tree reflecting the current preview.
- Center: neutral canvas containing one active website iframe. The page itself uses the real workspace layout, typography, header, navigation, cards and responsive styles.
- Right panel, initially 320 px: **Properties** for the selected component. When nothing is selected, show school-wide appearance and a short click-to-edit hint.
- Each side panel can collapse. Keep the canvas primary; do not squeeze it into a settings sidebar.
- At 1024–1279 px, open one side panel at a time to preserve a useful canvas area.

Tablet/mobile editor:

- Compact toolbar, full-width canvas, Pages and Properties in accessible sheets/drawers.
- Selecting a component on a touch device highlights it first; an explicit **Edit properties** action opens its sheet. Desktop selection opens the inspector immediately.
- Sheets respect the software keyboard and safe areas. Closing restores focus to the selected component/tree entry.
- The preview's mobile width is independent of the device running the editor. A narrow host may pan within the canvas; the editor page itself must not overflow horizontally.

Visual language: neutral backgrounds, thin dividers, modest corners and shadows, consistent spacing, readable labels, and one blue selection outline. School accent colors remain inside the website preview. Use existing SuggFeed icons and typography. Respect reduced motion; do not animate properties in a way that changes the measured selection box.

## Selection and editing

Hover outlines an editable component and labels it. Click selects the nearest supported component, shows its breadcrumb and scrolls its property group into view. Selection does not shift page layout. Clicking a child text node selects the registered parent component, not an arbitrary DOM node.

The component tree offers the same selection and editing with a keyboard. Use named controls, visible focus and at least 44 px touch targets. Escape closes a sheet or clears selection. Undo/redo shortcuts preserve native text-field undo when an input or editable text field has focus.

Examples:

| Select on canvas | Inspector |
|---|---|
| School identity/logo | Short name, validated logo upload/removal |
| Hero/cover | Headline, introduction, welcome message, optional cover |
| Official links/help | Label, HTTPS destination, help text |
| Category control | Name, description, approved icon, ordering, active/archive |
| Submission instructions/question | Existing versioned form properties |
| Public progress stage | Public label and explanation |
| Comments/voting/sharing/roadmap region | Feature setting and its consequences |
| Locked SuggFeed identity or navigation | Read-only explanation; no publishable change |

The inspector edits existing configuration fields. Desktop and mobile share one responsive configuration. Editing on mobile does not create a separate mobile content version. Category/question/link ordering uses existing stable IDs and schema; provide drag handles **and** move-up/down controls. Arbitrary page-positioning, resizing text boxes, custom CSS, font systems and HTML are outside this release.

Include Home, Community ideas, Roadmap, an idea detail, student Profile, and Submit idea. Use fictional, deterministic student data for those views, including populated, empty and disabled-feature examples. Profile previews must never use the administrator's real account as a student. A preview-only page selector may open the roadmap example even when roadmap is disabled, with the real disabled-page rendering.

## Fidelity and interaction modes

Use the live page templates and extracted shared components, not a second set of preview page designs. Fixture data replaces account/content data, and draft configuration replaces published configuration. Any necessary extraction must preserve existing live markup and responsive classes.

Two modes:

- **Edit:** clicks select registered components; website buttons, links and forms do not perform their live actions.
- **Preview:** selection outlines disappear. A small preview controller permits approved local demonstrations such as opening the submission panel, switching roadmap views and moving through fixture screens. It never loads the production application action scripts or writes real data.

No preview can vote, comment, submit, invite, upload, change membership, register a service worker, sync authentication, emit product activity/analytics, or send email. Asset uploads happen only through the authorized inspector. Preview URLs are private and uncached, and contain no configuration, credentials or student records.

## Draft lifecycle

Unsaved edits update the local preview immediately. Saving remains explicit **Save draft**, with a keyboard shortcut. Clearly distinguish **Unsaved changes**, **Saving**, **Draft saved**, **Conflict**, **Review required** and **Published**.

Use existing revision-based save, publish, form-review and restore operations. A preview update is not a save or a publish. Publication requires the latest saved draft, current permission/MFA, the existing impact confirmation and protected form/policy reviews. Restoring history creates a draft and resets the local undo stack; it never restores access or moderation state.

On a save conflict, retain local edits and show changed sections against the latest server draft. Offer copying unsaved configuration and reloading the latest version; do not silently merge or overwrite. Navigating away with unsaved changes prompts before discarding.

## Access and revocation

Re-use `school_customization_state.editing_enabled` as the single per-school grant. Show **Visual customization: enabled/disabled**, grant actor and grant time in the platform controls. Require fresh platform authority and MFA to grant/revoke; record the existing registry audit event. Do not add a second entitlement flag.

All editor, preview, draft/history and private branding asset endpoints require current school administrator membership, MFA, an enabled school grant and the global editing switch. Mutation RPCs retain database enforcement. Platform policy/form review retains its separate operator permissions.

After revocation, block new workspace requests and writes. A visible editor rechecks on focus and every 60 seconds; it explains the loss of access and preserves already-entered unsaved text in memory. Published school pages and their normal branding access continue to work. Editor access does not activate a school or bypass its legal review gates.

## Efficiency and rendering

Use the existing Express/Eta/TypeScript stack and image pipeline. No React rewrite or general page-builder dependency.

- One active iframe; load other pages only when selected.
- Build a bounded fixture view model server-side; do not run school feed/database loaders for preview content.
- Keep configuration, selection, history and viewport state in the parent editor.
- Use a versioned, allowlisted message protocol to the iframe; verify exact origin, iframe window, instance ID, message shape and sequence.
- Patch text/palette/visibility without rebuilding the whole iframe. Structural edits use a debounced server-rendered fragment from the same shared partials, with latest-request-wins handling.
- No network request per text keystroke; coalesce presentation updates to animation frames. Debounce structural rendering by 250 ms.
- An iframe reload uses a private server-stored draft. Unsaved structural rendering uses a bounded POST body; never put configuration in a URL.
- Reserve image dimensions; upload/process each asset once and reuse its ID.
- Preserve canvas scroll and selection across updates; ignore superseded render results.

## Completion contract

A grant-enabled administrator can open the workspace, select the real hero/logo/category/question in either viewport, change supported properties, see the change without reloading the editor, save a draft, inspect the review and publish through the existing safeguards. An administrator without the grant cannot open or call its endpoints. A student or moderator cannot obtain editor access. Disabling the grant leaves the published website intact.

Before calling the preview faithful, compare preview and live compositions using identical fixture data at 320, 375, 768 and 1440 px in light/dark. Include the full header/navigation, overlays and responsive behavior. The renderer must not substitute custom cards or omit the submission wizard. Verification requires separate authorization for automated tests under the current session rule.

Deferred: arbitrary page layouts, new section ordering/hiding beyond existing supported configuration, breakpoint-specific overrides, freeform styles, simultaneous multiplayer editing, live student data in preview, and new public customization permissions.
