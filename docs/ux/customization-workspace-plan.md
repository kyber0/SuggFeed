# Customization workspace: functional redesign plan

Status: implemented foundation and functional editor improvements. See [implementation notes](customization-workspace-implementation.md) for delivered scope, inspection results and remaining limits.

## 1. Product goal

Give school administrators a visual workspace in which they can find a page, select a real component, understand its effective configuration, edit it, check the result across screen sizes, and publish with confidence.

Keep the interaction familiar to a design canvas while using SuggFeed’s actual components and controlled layout rules. Schools customize their own student and staff experience; the platform dashboard and other schools retain their own identity and permissions. SuggFeed branding remains visible.

## 2. Source review

The existing workspace already has a component tree and inspector, an iframe using real Eta page templates, desktop/tablet/mobile widths, zoom, light/dark preview, populated/empty/disabled scenarios, custom controls, undo/redo, explicit draft saving, revision conflict handling, change review, publishing and history restoration. Server operations pass through school authorization and a school-level editor grant. Cosmetic publishing, form review and protected policy controls already have separate concerns.

The visible preview list currently covers nine broad pages. It does not give a complete chooser for the current Home, Following, personal/inbox sections and staff portal states. The toolbar and inspector expose many controls, but admins need a clearer task structure, property inheritance, applicable-component selection and change comparison. New features should extend these foundations, not create a parallel builder or duplicate school settings.

## 3. Workspace structure

### Desktop

- Compact toolbar: school/context, draft status, undo/redo, Edit/Preview, Review changes.
- Left panel: Pages and Components tabs. Group pages by Student experience and Staff experience. Theme has a persistent entry distinct from page selection.
- Center: real school page canvas, width controls, fit/zoom, preview light/dark and example-state controls. Default to a desktop canvas on a desktop host and mobile on a phone, preserving the admin’s preference.
- Right: contextual properties with component name, selection breadcrumb, property scope, editable fields and relevant validation.
- Small status area: save errors, conflicts and availability. Keep routine messages out of the canvas and avoid bulky bottom banners.

### Mobile/tablet

Keep the canvas central. Pages and properties open as accessible sheets, one at a time, with clear close/return actions. Preserve selected component, entered values and scroll when switching panels. Compact the toolbar; keep save status and publication reachable without covering inputs or the virtual keyboard. Use real iframe viewport widths with canvas scaling, not a desktop screenshot pretending to be mobile.

## 4. Work by task

Provide focused starting points: Brand the school, Refine Home, Organize Ideas, Adjust submission, Review mobile, Review changes. Each selects the relevant existing page/component and properties; none creates a separate settings system.

Maintain a predictable normal flow:

Choose page → select component → edit → automatic draft save → preview → review saved changes → publish.

No student-facing change occurs before publication. Changing legal policies, publication access, enrollment, roles or retention remains outside cosmetic editing and uses the existing protected workflow.

## 5. Accurate page and state coverage

Build the chooser from an explicit preview registry aligned with actual routes, templates and roles. Expand coverage incrementally:

- Home: visitor, new member, returning member, attention needed, empty and unavailable activity.
- Ideas: Browse, Following, empty/no-match, loading/error, filters and saved views.
- Progress: existing board, category, calendar and completed views.
- Idea details: drawer and standalone, discussion/replies/editing, progress and empty states.
- Profile: My ideas, Saved/following, Account; Inbox updates, questions and decisions.
- Submission: actual steps, validation/recovery and receipt.
- Staff: overview, review, individual review panel, work board/list/calendar, progress update panel and relevant management screens.

Distinguish role presentation from permission: previewing a moderator or student view never grants that role, impersonates a real account or invokes protected actions. All sample content is fictional. Do not label a route/state as supported until its actual components are rendered and applicable controls work.

## 6. Selection and discoverability

Canvas clicks and component-tree selection stay synchronized. Highlight one selected component, show its breadcrumb, and offer Select parent. Hover outlines are lightweight and disappear appropriately. Keep selection stable across text/color updates; choose the nearest valid parent if a component is removed.

Tree search finds component names and related settings. Show only actual components for the selected screen/state. If a global component is absent from that view, explain where it is used and provide a relevant preview destination rather than displaying an inert option.

Edit mode selects; Preview mode interacts with fictional UI. Keep native controls usable and provide a keyboard alternative for every canvas operation. Use the established open-hand/closed-hand panning behavior without slow external cursor assets or excessive decorative animation. Do not claim arbitrary on-page dragging can rearrange every component.

## 7. Contextual inspector and inheritance

Every property shows its current effective value. Placeholder text is explanatory, not a substitute for a saved or inherited value. Identify scope prominently: All school screens, This page, or This component. Show Inherited from school theme or Custom override and offer Reset override per property/group.

Prioritize Content, Appearance, Layout and Behavior where applicable; move technical fields into Advanced. Show only supported controls and relevant effects. Editing a card’s layout must not accidentally change the school’s access policy or the entire color scheme.

Theme controls cover the existing semantic color roles in light/dark: primary, secondary, background, surface, raised surface, text, muted text, border and links, plus the supported cursor theme. Use actual color pickers, readable hex fields, optional validated presets, contrast feedback and shared sample components. Keep state meanings, platform branding, focus behavior and permission boundaries protected. Honor school-wide inheritance across student/staff pages.

Page/component controls cover approved layout variants, density/spacing, supported section ordering, supported visibility, card treatments, bounded content and existing progress labels. Require valid reordering targets and supply Move up/down. No absolute free placement, arbitrary CSS/HTML/scripts, hidden primary recovery controls or invented workflow states.

## 8. Content and feature management

Expose existing categories, welcome text, official links, custom questions, bounded emails and community feature switches through coherent contextual entry points. Reuse canonical records and validation. Categories retain IDs, archive semantics and at least one active category. Questions retain historical wording/form-version behavior. Existing records are not deleted by visual resets.

Show consequences beside feature switches and in publication review: disabling new comments retains existing discussion; disabling voting blocks new writes without deleting records; sharing controls cannot prevent copying a public URL. Changes expanding collection or disclosure retain platform/policy review gates.

## 9. Assets

Use the shared drop zone with file selection as an equal alternative. Show current image, actual limits, uploading/processing/ready/failed states, replacement and removal. Use existing server validation, metadata stripping, derivatives, school ownership and cleanup. Publish only finalized usable assets; replacing a draft logo cannot break the published logo. Never imply an upload succeeded before server confirmation.

## 10. Draft saving, undo and recovery

Introduce debounced server-side draft autosave, retaining Save now and Ctrl/Cmd+S. Label states accurately: Unsaved, Saving, Saved with timestamp, Offline, Save failed or Conflict. Save only a valid coherent configuration; invalid fields remain editable with nearby errors and the last confirmed server draft stays intact.

Group typing and picker drags into useful undo steps. Saving does not publish or erase meaningful undo history. Undoing a saved customization creates another draft change. Review/publish uses a confirmed saved revision; never publish a different snapshot while an autosave is pending.

Keep edits in memory on transient failure; warn before leaving with unsaved changes. Prefer server-confirmed recovery on reopening. Persist harmless editor preferences separately; do not silently put school draft content or private user data in shared browser storage. When two admins edit, show meaningful conflicting groups, preserve local edits and offer an explicit comparison/reload workflow. No blind overwrites or automatic whole-JSON merge. Keep raw configuration export as a secondary recovery option.

## 11. Preview comparison and publishing

Offer Draft / Published comparison at the same page, viewport, appearance and scenario. Start with a toggle; add side-by-side only where viewport space allows. Both use actual shared templates. Draft data stays out of shared caches. Do not send invitations, submit ideas, cast votes, modify memberships, upload student files or send emails from preview.

Review shows changes grouped by page/global scope and understandable consequences. Link each issue back to its property. Separate blocking validation/review requirements from informational warnings. Show draft revision, last published version and live workspace destination. Only publish after fresh authorization/MFA and revision checks; failed publication leaves the previous version live.

History supports comparing published versions and restoring one into a new draft. Show category/form conflicts before losing work. Restoration cannot revert memberships, moderation, legal approvals or historical submission data.

## 12. Access and platform control

Keep the agreed per-school editor grant: the super admin enables it for a school’s active school administrators. Moderators and students do not gain editing rights. Platform operators retain an explicit platform context for service/review tasks, not a silently created client membership.

Recheck access for preview, assets, save, publish and restore. Grant revocation or removal stops pending editing operations and offers a clear permitted destination; do not expose drafts through a read-only fallback after access is revoked. Published pages remain available subject to their normal school access rules.

## 13. Responsiveness, motion and efficiency

Reuse existing controls, tokens and motion. Selection feedback is immediate and subtle. Batch text/theme patches, debounce structural renders, cancel stale requests, and retain field focus, caret, selection and canvas position. Reuse the iframe and styles; do not reload the page for every keystroke. Keep render sequencing independent from saved revision state. Preserve the origin/instance/message sequence checks around the preview.

Do not add an editor framework or animation dependency by default. Measure preview response and layout changes before considering one. Support 320px hosts, keyboard use, visible focus, reduced motion and light/dark editor chrome independently of the school preview theme.

## 14. Implementation order

1. Navigation and contextual properties: tasks, registry, scope and current values.
2. Reliable editing: effective values, resets, validation, autosave, undo and conflicts.
3. Accurate preview: expanded actual-page states, stable selection, comparison and safe interactions.
4. Layout/assets: approved reorder controls, spacing, visibility and asset handling.
5. Publication/history: meaningful diffs, blockers, restoration and permission expiry.
6. Visual refinement and rollout: compact chrome, mobile sheets, feedback and demo-school-first availability.

## 15. Planned acceptance criteria

An admin can change a welcome headline and see/save/publish that exact text; alter a school-wide color and understand its reach; override/reset one component; change a permitted order with pointer or keyboard; compare mobile/desktop and published/draft; recover a failed save without lost input; and understand any publication blocker.

One school cannot access another school’s drafts/assets/history. Revoked admins cannot publish from an old tab. Cosmetic changes do not clear policy approval. Preview actions cannot reach real mutation endpoints. No horizontal host-page overflow, clipped properties or obscured keyboard focus at supported widths. Actual preview components remain consistent with live components.

These are planned criteria, not completed checks. No tests were added or run for planning. Automated verification requires a separate request; live permissions, concurrent saves, physical devices, assistive technology and performance need evaluation during an authorized verification phase.
