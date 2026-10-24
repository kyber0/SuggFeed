# SuggFeed Studio controls

Studio uses a focused interface for the existing school customization workflow.
This release changes the editor shell and controls; server permissions, school
editor grants, revision checks, policy review and publication rules still apply.
No dependency or database migration is required.

## Editor layout

- Top bar: workspace identity, draft state, undo/redo, Edit/Preview, Save and Review.
- Components panel: page selector, search, workspace and page-specific components.
- Canvas: device, zoom and preview appearance. More contains example content,
  reload and an editor-only appearance preference. Phone undo/redo also lives here.
- Properties: scoped fields grouped into Content, Appearance, Layout and Behavior;
  reset actions are in Advanced. Color controls edit either light or dark school
  appearance. Editor chrome appearance does not alter a school's theme.
- Small screens: Components and Properties open as focused panels; Escape or the
  close control returns to the canvas. Preview device width is independent of the
  administrator's actual device width.

## Progressive control API

Load the shared `controls.js` after the model/colors/design helpers and before
the inspector/controller. The existing controller calls:

```js
const controls = window.sfControls.mount(host, {
  beginGroup: () => model.beginGroup(),
  endGroup: () => model.endGroup()
});
controls.refresh(); // Immediately enhance newly rendered inspector fields.
controls.schedule(); // Coalesce refresh into the next animation frame.
controls.close(true); // Close the active surface and restore trigger focus.
controls.isOpen();
controls.destroy(); // Restore native fields/titles and dispose resources.
```

Mounting the same host twice returns the same instance. A scoped observer also
handles inserted controls and disabled-state changes. Native fields retain their
values and emit the existing `input`/`change` events. No settings schema is added.
The implementation uses the native Popover API; older browsers keep native select
and color controls. The OS file chooser remains native, behind the existing
SuggFeed upload/drop area.

### Selects

Native selects receive a labelled combobox trigger and a selected checkmark.
Lists with more than eight options include search. Arrow keys, Home/End, Enter,
Space, Escape, Tab and typeahead are supported; searching supports spaces.
`data-studio-segmented` additionally presents approved device choices as a roving
button group on wider screens. Disabled options remain unavailable.

### Colors

Native color inputs receive a swatch trigger. The custom picker supports pointer
selection, labelled hue/saturation/brightness sliders, six-digit hex input and
brand presets. Alpha is not supported. Pointer color gestures form a single undo
step, even if held for more than the normal typing coalescing interval. Existing
server contrast and schema validation remain authoritative.

### Shared feedback

Existing editable checkboxes use switch semantics and a common track treatment.
Text areas show character counts; invalid fields show local errors and open their
collapsed group before focus. Image uploads reuse the current upload protocol and
show local progress/error feedback. Hover/focus tooltips enhance toolbar titles
without removing the preview iframe's accessible title.

## Draft safety

Save requires unsaved changes. Review requires a saved draft. Publish additionally
requires explicit review confirmation; these client states supplement server
checks. Failed saves keep entered values. Stale revisions retain the conflict and
copy/reload workflow. Revoked access closes floating controls and blocks further
editing. Reset uses a confirmation dialog; it only changes the private draft.

## Checks performed locally

- Express type checking and production build.
- Chromium inspection of the real Eta editor and real preview renderer using
  fictional in-memory school data at 320, 375, 768, 1024, 1280 and 1440px.
- Current-value display, color editing, save/review gating, page switching,
  keyboard selection and live headline preview updates.
- Searchable choices, mobile sheets, reset cancellation, undo/redo, dark editor
  chrome, control teardown and native-control fallback.
- Simulated save failure, revision conflict and access revocation: entered values
  remain available and blocked actions stay disabled.

No automated test suite was added or run. Local save endpoints were disposable
fixtures; no hosted school, account, asset or publication was changed. Real iOS
Safari, Android keyboards, screen-reader interaction and live asset delivery still
need device/operational review. Existing browser support determines whether
custom popovers or native fallback controls appear.

The same controls now initialize from the main layout across student, staff,
school-admin and platform pages. See `docs/operations/shared-controls.md`.
