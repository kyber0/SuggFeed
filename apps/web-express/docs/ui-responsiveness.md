# Click responsiveness and loading feedback

## Navigation

Native links still start browser navigation in the original click. The current
page immediately displays the destination's heading and a responsive skeleton
instead of looking unchanged during the server wait. No artificial delay, HTML
replacement or duplicate script initialization is introduced. Keyboard links,
modified clicks, new tabs, downloads and same-page anchors retain browser behavior.
GET filter forms use the same loading state. The skeleton supports reduced motion,
announces loading, and offers Cancel loading. Browser back/forward and cancelled
unsaved-work navigation restore the original page; draft inputs are not cleared.

Idea drawers open with their existing skeleton immediately. A new selection or
closing the drawer aborts the previous request. Out-of-order responses cannot
replace the selected idea, and loading has a timeout.

## Removed shared waits

- Browser scripts defer execution while preserving their existing order. Theme
  initialization stays early to avoid flashing the wrong theme.
- Supabase's browser SDK is served locally, generated from the installed dependency
  by `scripts/build-vendor.cjs` on client builds. Version/hash and license accompany
  it. This removes the blocking CDN dependency and floating browser SDK version.
- Inter's Latin variable WOFF2 font is served locally with its OFL license and
  source-package/hash metadata. The external Google stylesheet imports are removed.
- Independent token and profile reads overlap on public/self-owned page reads.
  Staff routes and mutations retain the profile check after token verification.
  There is no new authorization cache. The token must still match the session owner.
- Account bookmark hydration reads bookmark IDs only, instead of fetching all three
  activity lists and their public idea projections.
- Roadmap idea and public-progress reads run together.
- Identical in-flight data reads are shared until completion. Existing cache TTLs
  are unchanged, cache invalidation detaches pending reads, and failed reads are
  removed rather than retained as cached promises.

`Server-Timing` reports session loading and identity-check durations, so future
network traces can distinguish backend waits from UI rendering. Durations contain
no tokens, account identifiers or profile data.

## Validation and release

Compilation uses the Express build and TypeScript checks. Automated tests were
not run for this refinement. These changes remove identified waits and add immediate
feedback; no measured production latency reduction is claimed. Deployment is
required to publish them. Slow database requests or cold server instances can still
delay the final content, with the skeleton remaining visible during that wait.
