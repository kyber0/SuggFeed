# Click responsiveness and loading feedback

## Navigation

Native links still start browser navigation in the original click. The current
page immediately displays the destination's heading and a responsive skeleton
instead of looking unchanged during the server wait. No artificial delay, HTML
replacement or duplicate script initialization is introduced. Keyboard links,
modified clicks, new tabs, downloads and same-page anchors retain browser behavior.
GET filter forms select the destination layout using their submitted parameters.

Skeletons use distinct page geometry: the home hero and form, the feed's three
columns, profile identity and activity, updates and preferences, private inbox
conversations, and idea details. Roadmap board, timeline, category tree and
completed outcomes each have their own template. Staff review, work board,
analytics charts, member roster, reports, clarification forms and attention queues
also have separate layouts. Legal documents, email preferences and staff sign-in
have appropriate document or form placeholders. Templates are inert until selected;
no template fetch delays navigation. Mobile layouts collapse columns and preserve
the timeline's scrollable date grid. The skeleton supports reduced motion,
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
- The profile page reuses the profile fetched during its verified identity check
  in that same request. Owner matching, role revalidation and token verification
  still run; this does not cache authentication or permissions.
- Independent token and profile reads overlap on public/self-owned page reads.
  Staff routes and mutations retain the profile check after token verification.
  There is no new authorization cache. The token must still match the session owner.
- Account bookmark hydration reads bookmark IDs only, instead of fetching all three
  activity lists and their public idea projections.
- Roadmap idea and public-progress reads run together.
- Public feed requests now also share identical pending queries, with the existing
  30-second first-page / two-minute deeper-page TTLs. Following feeds remain
  uncached and account-specific.
- Identical in-flight data reads are shared until completion. Existing cache TTLs
  are unchanged, cache invalidation detaches pending reads, and failed reads are
  removed rather than retained as cached promises.

## Navigation caches

| Data | Lifetime | Refresh rules |
| --- | --- | --- |
| Public feed | 30 seconds for page 1; 2 minutes for later pages | Existing vote, comment, submission and review invalidation |
| Public roadmap pages and recent completions | 15 seconds | Review, lifecycle actions, work-date repair, progress, vote, comment and moderation invalidation |
| Public categories and category IDs | 5 minutes | Expire and share concurrent loads; failed reads are not cached |
| Versioned JS/CSS/assets | Browser service worker cache | Change the `v` query value when changing that file |
| Other static assets | Browser cache with background revalidation | Revalidate against the network; do not retain failed/private responses |

Public home, feed and roadmap reads begin before session storage and identity
validation. Routes join the same pending cache loads, overlapping these formerly
sequential waits. Following feeds, private messages, account HTML, staff data,
permissions, authorization results and session payloads are not placed in shared
navigation caches. Roadmap detail publication checks and evidence access stay fresh.

Hover or keyboard focus on a public home/feed/roadmap link warms its data through
`GET /api/navigation-cache`. The response is empty and contains no account HTML;
the fetch sends no cookies. Only recognized public filter fields are copied.
Prefetch waits 120 ms to avoid flyovers, allows two concurrent requests and eight
attempts per document, has a four-second timeout, and is disabled offline, in
hidden tabs, on 2G connections and with Save-Data. The endpoint has its own rate
limit. Prefetch failure never blocks native navigation or the skeleton.

Static asset caching is registered after window load. The worker is compiled as a
classic script; the old `export {}` caused the `module: none` build to leave the
checked-in worker unchanged despite reporting success. Its cache holds at most 200
entries. Only recognized static paths are eligible; HTML, API results, callbacks,
private pages, redirects and no-store/private responses are never persisted.
Unversioned assets revalidate in the service worker's lifetime. Bump asset query
versions on changes and the worker cache version for a cache reset on release.

`Server-Timing` reports session loading, identity checks, and data-loading durations
on home, feed, profile and roadmap pages. Data duration now reports any remaining
wait after the public preload, not total database query time. Identity and session
verification still complete before account-aware HTML is returned. In-memory data
caches are per instance, so prefetch is best effort across serverless instances;
changes handled in another instance can take up to the relevant TTL to appear.
These caches do not remove cold starts or database network distance. Unchanged
sessions already avoid rewrites with `resave: false`; the store is unchanged.
Durations contain no tokens, account identifiers or profile data.

## Validation and release

Compilation uses the Express build and TypeScript checks. Automated tests were
not run for this refinement. These changes remove identified waits and add immediate
feedback; no measured production latency reduction is claimed. Read-only live
site/database timing attempts were blocked by this workspace’s network access, so
cold-start and regional latency remain unmeasured. Deployment is
required to publish them. Slow database requests or cold server instances can still
delay the final content, with the skeleton remaining visible during that wait.
