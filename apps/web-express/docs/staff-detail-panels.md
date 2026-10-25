# Staff detail panels

Review keeps the original idea beside its available decisions. Work detail separates the summary, progress composer, private team notes, and history. Actions still follow the server-provided workflow and assignment permissions.

The compact header, tabs, and footer surround one scrolling content region. The full title scrolls with the content. Progress publishing uses the existing form through its `form` attribute; its button stays disabled while loading, saving, or when the current action is unavailable. Optional timing fields open once when the selected action needs them, rather than reopening while typing.

On narrow screens the editor and preview stack, the fixed footer respects the safe area, and Close remains available in the header. Tab entrances honor reduced motion. Cosmetic styles are scoped to `#staff-review-dialog[data-detail-mode]`; older full-detail rules apply only to legacy dialogs without a detail mode.

Validation for this change: production compilation and Eta template compilation; synthetic desktop and mobile visual inspection. No automated tests or live workflow writes were performed. Physical-device keyboard behavior remains to be checked.
