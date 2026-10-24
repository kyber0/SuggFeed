# Shared SuggFeed controls

`src/client/controls.ts` and `public/css/modules/controls.css` provide the same
selects, searchable lists, color picker and tooltips throughout SuggFeed.
Both document shells load these assets. The standalone Studio uses the same
instance API; ordinary pages initialize once against the body. Its iframe
preview also loads the controls, while retaining the existing preview action
restrictions. No dependency, database migration or server permission change is
required.

## Coverage

- All single-choice native selects, including admin filters, analytics, roadmap,
  enrollment rules, notification preferences, staff review and custom questions.
- Native color inputs wherever present; color controls do not add new settings.
- Existing titled buttons, links, summaries and keyboard-operable controls.
- Setting switches in profile, notifications, student joining and submission.
- Dynamically inserted forms/dialogs and replaced preview fragments.

Consent acknowledgements and bulk selection remain checkboxes. Multiple-choice
and expanded listbox selects keep native semantics. `data-native-control` opts a
container out of custom selects/colors if a future integration requires it.
Browsers without the Popover API retain native controls and titles.

## Form behavior

Native input names, options and values remain the submitted source of truth.
Custom triggers are non-submitting buttons. A choice emits the existing input and
change events, so current delegated handlers continue to work. Disabled controls
and disabled fieldsets stay unavailable. Search appears above eight choices;
keyboard navigation, selection checkmarks, Escape and typeahead are shared.

Programmatic value/selectedIndex assignments schedule a refresh through
reversible instance descriptors, without replacing browser prototypes or emitting
extra change events. Reset refreshes after the browser restores defaults. Added
options, fields and disabled states are observed. No per-frame polling is used.
Labels, help descriptions, required state and errors remain associated with the
trigger. Existing text-field validation is left to its current form controller.

## Appearance and lifecycle

Controls inherit the current school's published design tokens, including light
and dark mode. Studio maps the same control tokens to its independent editor
appearance. Popovers use the browser top layer and stay within the visible
viewport; those opened inside dialogs remain descendants of that dialog.

The API is `window.sfControls.mount(root, {endGroup, beginGroup})`, returning
`refresh`, `schedule`, `isOpen`, `close` and `destroy`. Repeated mounting is
idempotent. Teardown restores native fields, instance descriptors and titles,
then removes listeners, observers and pending animation frames. Studio supplies
undo grouping callbacks; ordinary pages use a no-op grouping callback.

## Delivery checks

Type checking and production build were run. Local Chromium inspection used
fictional page models and disposable forms, covering student screens and staff
work, custom question/notification selects, disabled fieldsets, searchable
choices, FormData, restored values, reset, dialogs, color input and tooltips.
No hosted content was submitted. No automated test suite was added or run.
Real-device Safari/Android keyboards and assistive-technology review remain
outstanding; native fallbacks remain available where custom popovers are absent.
