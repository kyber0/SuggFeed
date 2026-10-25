# Home and Ideas implementation

## Delivered

- One Home welcome composition with school identity, published welcome text, direct submission entry, category shortcuts and secondary private tracking.
- Returning-member activity and a fictional illustrated journey for guests share the companion area. Existing private activity remains scoped to account and school.
- A collapsible tracking form preserves code handling, existing results and explicit device-save behavior. No code enters navigation URLs.
- Up to six community highlights reuse the same Eta card as Browse/Following. Progress links come only from published in-progress/completed ideas already loaded for that school; this is not a complete outcomes list or fabricated analytics.
- Existing instructional motion is retained lower on Home. Without animation initialization, all three steps remain readable in a static layout.
- Two-column desktop Ideas layout, one section navigation, topic rail, compact search/sorting, mobile topic sheet and secondary saved-view dialog. Existing filters, saved-search storage limits and deliberate pagination remain.
- Card footer contains support/undo, discussion and save. More contains sharing, lazy follow-state lookup and private reporting. Approved school category icons and labels are reused.
- Fresh account/device support snapshots hydrate initial and appended cards. These personalized responses are private/no-store. Uncertain write results offer a refresh to reconcile before another write. A snapshot failure does not claim an idea is unsupported.
- Load-more uses server-rendered card markup through `cards=1`; old JSON callers retain feed/data and metadata. Duplicate IDs remain filtered before append. Existing drawer loading, request cancellation, focus handling and return behavior are retained.
- Customization previews use actual templates; welcome defaults, live text, tracking/filter dialogs, two-column wide layouts and the optional Home progress section have been updated. Preview requests still cannot perform real student actions.

No dependency, environment or database migration is required. Submission handling, owner-only answers, workflow authority, moderation rules and feature enforcement remain unchanged.

## Verification and limits

Production build, Express type checking, existing animation lint and 95 Eta compilations passed. Synthetic layout inspection covered guest/returning Home and Browse/Following at 320, 375, 768 and 1440 pixels with no document overflow. Dark mode, empty/long content and narrow dialog layouts were also inspected. Browser interaction inspection used isolated mock responses for support/undo, filter cancellation, saved views and tracking; it did not touch hosted records.

No automated tests were added or run. These inspections do not establish production endpoint authorization, live delivery, physical-device keyboard behavior, screen-reader behavior, deployment success or measured Lighthouse equivalence. Existing standalone idea/drawer components were reused rather than replacing the reading system. Legacy customization keys for removed popularity panels remain accepted for compatibility; they do not reintroduce the right sidebar.
