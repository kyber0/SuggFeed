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
| Public feed rows | 30 seconds for page 1; 2 minutes for later pages | Vote, comment, submission and review invalidation |
| Public feed exact totals | 30 seconds, shared across sorts/pages for each category/search | Publication/content, review and workflow invalidation; votes/comments preserve totals |
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

## Feed account startup

The supplied production screenshots confirm commit `28cdb89` was live, static
assets were served from the worker in roughly 4–27 ms, and `/feed` took 2.39 s:
2.11 s waiting for the server and 278.67 ms downloading. Server timings were
316.50 ms for session, 707.70 ms for identity and 741.90 ms for remaining data.
These timings show several contributors; they do not isolate cold starts or
regional latency. The document/fetch rows are the navigation and its worker fetch,
not evidence of two separate page downloads.

Feed bookmarks and saved searches now load while the request's identity is being
verified, then join the public feed loader. The results enter the private HTML
response only when the same account was verified. Each list has a 10-second
server cache keyed by owner; mutations invalidate that owner's list. Other
instances can retain a snapshot until that short TTL expires. Roles, tokens and
sessions are not cached by this mechanism. Optional section failures fall back to
the existing verified endpoints instead of failing the feed. The route waits at
most 120 ms for still-pending account metadata after identity checks, and large
bookmark snapshots use the existing endpoint instead of bloating the HTML.

Feed scripts hydrate these lists from escaped HTML attributes rather than starting
new bookmark/search requests (previously 1.99 s and 1.72 s in the screenshot).
Submission context is now fetched when the submit panel opens, not automatically
on every page (previously 2.70 s); submission, queue and receipt actions still
check fresh context before proceeding. Account snapshot wait is reported as
`account` in Server-Timing. Public preload reports `public-cache` as `hit`,
`pending` or `miss`, making instance-local cache reuse observable in the browser.
Identity timings now also separate `auth-user` from `permissions` (and a refreshed
token verification when needed) so the 708 ms aggregate can be traced further.

## Function and database placement

The supplied settings screenshots show the existing Vercel region as `iad1`
(US East / Washington, D.C.) and Supabase's primary database as
`ap-northeast-2` (Seoul), on `t4g.nano`. The database CPU indicator read 100%.
That confirms distant regions and a high CPU snapshot, not the duration or exact
cause of sustained CPU saturation.

`apps/web-express/vercel.json` now pins the function to `icn1` (Seoul). This single
region fits the current Vercel Hobby limit. It applies to a new deployment and
should be verified in that deployment's function region, not just the project's
older dashboard default. The database stays in its existing region.

Public feed rows and exact totals now use separate caches. Totals are keyed by
category/search and reused across sorts and pages for 30 seconds. The public total loads after initial HTML through `/api/feed-total`, so a slow
count does not block the first cards. Home/feed renders and current load-more
requests use cached totals when available, otherwise show the number of ideas
actually loaded. Following feeds keep fresh private totals. The scalar public
endpoint runs before session I/O, sends no account fields or cookies, rejects
following scope, and permits browser/CDN caching only for the remaining server
count TTL, avoiding stacked cache lifetimes. Legacy API callers still get an
exact total unless explicitly opting out with `total=skip`. Count reads
select only the parent IDs (an inner category join is used only for the filter
fallback); row reads avoid an exact count and use 16 rows to return 15 plus a
reliable `hasMore`. Row and count reads run concurrently for callers that require an exact total. Following feeds retain their
fresh owner-filtered exact count and never enter public caches. A deterministic
ID tie-breaker stabilizes equal-date/vote pagination. Totals are not authoritative
for pagination and may reflect their short cache window.

Content/publication changes invalidate total caches on the handling instance;
votes/comments refresh row/ranking caches without repeating unchanged totals.
Other instances refresh at expiry. Moving the function should reduce network
round trips, while total reuse reduces redundant queries; neither is a measured
post-deployment latency or CPU result.

Read-only Management API diagnostics succeeded after using Node's workspace
proxy and system CA settings (`--use-env-proxy --use-system-ca`). Historical
`pg_stat_statements` showed 4,498 calls for the feed rows-plus-count query at
924.32 ms mean / 2,864.35 ms maximum, and 1,113 calls for a status-filtered exact
count at 4,293.10 ms mean / 7,989.15 ms maximum. These cumulative measurements
confirm expensive application queries, but do not identify the current CPU spike
by themselves. Three live activity samples over approximately 20 seconds caught
no sustained running query (one connection was briefly waiting for client input).
During that interval, the PostgREST request-context `set_config` statement gained
45,754 calls and 721.41 ms of cumulative execution time. That indicates frequent
request-context setup, but its own execution time does not explain a continuously
saturated CPU; traffic sources and unsampled work still need investigation. The
sampled tables showed little dead-row accumulation. No production
schema changes, compute changes or test records were made during that preliminary diagnosis.
If CPU remains high, inspect query plans and activity over time before selecting
a database change or compute upgrade.

## Database retry incident: 13 October 2026

The subsequent API usage screenshot showed only 2,878 gateway requests over
approximately 24 hours. The PostgreSQL log screenshot showed 2.6 million entries,
repeatedly reporting SQLSTATE `40001` with "Submission changed" and "Review has
changed". All 1,000 entries in the supplied CSV had that code: 435 submission
conflicts and 565 review conflicts. A live database sample recorded 23,416
additional transaction rollbacks in 9.58 seconds (about 2,400 per second).
Aborted PostgREST statements called `save_staff_review` and `post_idea_update`;
the request setup statements ran as `service_role`.

The application used `40001` for optimistic concurrency conflicts, although
that SQLSTATE means a retryable serialization failure. The deployed PostgREST
14.5 transaction runner uses Hasql transactions, which retry `40001` without a
limit. Repeating the original stale input cannot satisfy these checks. The
database consequently retried inside a small number of HTTP requests, explaining
why the gateway request count was much smaller than the database failure count.
The source checks are
[PostgREST MainTx](https://github.com/PostgREST/postgrest/blob/v14.5/src/PostgREST/MainTx.hs)
and
[Hasql transaction retries](https://github.com/nikita-volkov/hasql-transaction/blob/1.1.0.1/library/Hasql/Transaction/Private/Sessions.hs).

Migration `202610130015_nonretryable_application_conflicts.sql` changes explicit
application conflict exceptions in six existing functions to `PT409`. PostgREST
returns HTTP 409 for that code instead of retrying the transaction. The migration
preserves the existing function bodies except for those exception assignments,
as well as signatures, ownership, grants, and security settings. The Express
review, progress, workflow, and community handlers accept `PT409` and retain
compatibility with the older code, preserving the refresh instructions and drafts.
True PostgreSQL serialization failures are unaffected.

The migration was applied to production and recorded in migration history.
Before/after catalog comparison confirmed the six definitions differed only in
the intended error code replacements, with ownership, grants, and settings
unchanged. Three post-migration samples over 19.29 seconds recorded **zero**
additional rollbacks, **zero** additional request setup calls, and **zero**
aborted PostgREST connections. A further check approximately two minutes after
the first sample still showed the same rollback count, no aborted connections,
no remaining explicit application `40001` exceptions, and one migration history
entry. Direct database Prometheus CPU counter deltas showed approximately **1.3%
busy CPU** after the fix (idle and I/O wait excluded). The metrics endpoint caches
scrapes, so that percentage describes its counter refresh interval rather than
an instantaneous nine-second sample or the dashboard's chart. These observations
confirm the sampled retry storm stopped; signed-in navigation speed remains
unmeasured. No disposable production records or compute upgrade were used.

## Validation and release

Compilation uses the Express build and TypeScript checks. Automated tests were
not run for this refinement. These changes remove identified waits and add immediate
feedback; no measured production latency reduction is claimed. Read-only live
site/database timing attempts initially failed; Management API query statistics
are now accessible through the workspace proxy. Cold-start and post-change
regional latency remain unmeasured. The supplied browser screenshots
provide the production timings documented above. Deployment is
required to publish them. Slow database requests or cold server instances can still
delay the final content, with the skeleton remaining visible during that wait.
