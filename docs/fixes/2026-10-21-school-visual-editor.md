# School-wide theme and contextual visual editing

Implemented the agreed school scope and controlled layouts in the existing Express/Eta editor. Added a shared deterministic schema/token/section helper used by server normalization, real-page runtime and isolated preview. Kept version 1 compatible through an optional `design` extension. Published configuration, category IDs, form versions, authorization, MFA, school-level rollout and review gates retain their existing owners.

The editor separates global settings from the current screen, offers full light/dark colors and contrast feedback, shows real page-specific components, and supplies page/component layouts, surfaces, spacing, alignment, optional visibility and bounded ordering. Added actual-template previews for updates, messages and staff work. Emails use only supported button branding.

Verification evidence:
- Node 22 full Express type checking and production build passed.
- Local Chromium inspected all nine previews and distinct page trees without page errors during the recorded inspection.
- Primary `#315c45` reached the feed action as `rgb(49,92,69)` with white text.
- Home sibling order changed to hub → hero → ideas; centered/raised hero applied and saved in a local fictional draft.
- Hidden feed promo was `display:none` in Preview mode; saved theme restored after reload.
- Dark preview used background `rgb(15,23,42)` and text `rgb(241,245,249)`.
- Updates, inbox and staff showed their fictional content with theme attributes.
- Undo removed the new theme and restored legacy accent `#0b3857`; redo restored `#315c45`.
- Editor width stayed within 768px, 375px and 320px viewports; desktop/mobile/dark screenshots inspected.
- Both additive migrations were applied and recorded transactionally. The second migration initially rolled back because the function-definition terminator differed; its corrected transaction succeeded. Existing school drafts/publications were not modified.

No automated test suite was added or run. No real invitation, digest, private message or submission was sent. Live authenticated publication and post-deployment rendering remain unverified. Component and layout choices are intentionally bounded; user-owned records and arbitrary CSS/positioning are outside the editor.
