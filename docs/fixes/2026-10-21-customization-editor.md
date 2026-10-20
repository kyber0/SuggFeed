# Customization editor — 21 October 2026 (Asia/Manila)

## Corrections

- Home now uses the same hero structure for default and customized text. Editing copy does not switch the entire hero into another card design. Heading spans and their accent styling are preserved in live patches.
- Fragment updates reconcile same-origin `/css/` stylesheets, await shared in-flight loads, preserve the latest received configuration, and copy body style tokens. A failed style load leaves existing content intact and reports a recoverable error. Reload preview retains the unsaved model.
- The school name, headline and introduction fields show the currently displayed default text when no override is stored. This does not silently create a new stored override. Optional additional paragraphs stay empty until added.

## Color controls

- Six existing preset swatches, native color picker, matching six-digit hex input and Reset accent.
- Shared deterministic color code is compiled once for browsers and also exported through CommonJS for server rendering. It supplies the same initial, live, preview and published colors.
- Primary school actions use the selected accent with black/white text chosen for at least 4.5:1 contrast. Text accents are adjusted separately for light/dark backgrounds. SuggFeed identity, security/status colors, layout and shared fonts remain controlled by the app.
- Existing `palette` stores either an existing preset name or a strictly validated `#rrggbb`; no arbitrary style, CSS, HTML or script is accepted. Existing saved presets continue working.
- Migration `202610200002_school_custom_colors` extends only the existing validator's palette syntax. The hosted function body was compared with the prior migration before replacement. The migration and its version record were applied transactionally; no account, draft or published configuration was edited. All existing schema, tenant, publication and collection-review checks remain.

## Verification and limits

Node 22 type checking and production build passed. A fictional local editor was inspected through actual typing, structural name changes, color selection, save/reload, page switching and mobile properties at 375 px. A separate 320 px dark preview also matched the viewport width and applied the selected accent. Current fields were populated; heading font/size and hero class stayed the same after editing; yellow primary buttons used black text; custom hex survived a local draft reload; profile-specific CSS loaded; mobile document width matched the viewport. Desktop/mobile screenshots were visually reviewed. These local saves did not use hosted records.

No automated tests were added or run for this follow-up. Hosted publication, physical devices and actual browser-native picker dialogs remain unverified. Optional extra text is intentionally blank when nothing is displayed. Logo/cover upload availability still follows the service's existing setup and cleanup requirements.

Existing controls also cover logos/covers, welcome text, official links, categories, submission questions, feature switches, progress labels and email content. Arbitrary typography, custom scripts and wholesale layout editing are not introduced by this change.
