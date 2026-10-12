# Express deployment and authentication

## Community care upgrade (October 12)

New screens: `/admin/community` (reports, private clarification, duplicate merges,
30-day stale-work and 14-day continuous-blocker reminders), `/admin/board` (confirmed stage moves and bulk
assignment), `/inbox` (private replies and report decisions), `/feed?scope=following`,
and notification preferences on `/notifications`. Staff queue shortcuts are `/`
for search and `J`/`K` for Review buttons. Response starters remain editable drafts.
The board pages every stage independently, with exact matching totals and 6,
12 or 24 cards per stage. Search and oldest/newest order apply before pagination;
there is no 200-submission cutoff. Previous/next and page-jump controls preserve
the other columns' pages. Cards and column scroll areas are compact; bulk tools
only appear when something is selected. Selection survives inline page changes
in memory (not browser storage), including the original review version; changing
filters or leaving the page clears it. Bulk assignment supports 1–25 selected
ideas, rolls back completely if any version is stale, and does not change public
responses or stages. Community-care sections show the oldest 50
open records each, not fabricated school-wide totals.

The composer suggests up to five related public titles using bounded keyword
matches, not an AI score or automatic duplicate rejection. Timeline week/month/
term options change scale only, not school term dates or project deadlines.
Mouse background panning, native touch scrolling, arrows, sticky month labels,
optimistic support with rollback, and reduced-motion feedback are included.
Evidence thumbnails are local previews, not validation results. Started/completed
comparisons appear only when both public updates have approved images. Update
dates are not claimed as photo capture times or matching viewpoints.

### Migration and release requirements

Apply pending migrations in order through `202610120009_weekly_digests.sql` in a
separate staging project **before deploying this build**. New pages depend on
the new tables/functions. Back up production and validate hosted Auth/Storage,
existing retention policies and old-code compatibility before production changes.
Local builds do not apply hosted migrations or deploy anything.

Merging accepts two independent published ideas. The source leaves public lists,
while its original owner, tracking record, clarification and votes remain intact.
Followers move without duplicates; votes are deliberately not summed. The source
idea URL redirects only while the destination remains public. Public merge
history includes only the source title and staff-written public reason, not actor
identities or private content. No self-service unmerge is available; recovery
requires reviewing the audit and an explicit operator change.

Reports require sign-in and human staff review. Removal hides a comment through
RLS or withdraws an idea; report counts never automatically hide content. Decisions
and reasons are private to the reporter. Private clarification requires the
verified owner session or full anonymous tracking-code capability, is sent in
POST bodies, and is never stored in browser storage or appended to a URL. It
inherits submission deletion via foreign-key cascades. Do not copy private
clarification into public updates or email.

### Optional weekly email digest

Disabled by default. Configure server-only `RESEND_API_KEY`, a verified-domain
`RESEND_FROM_EMAIL`, `DIGEST_UNSUBSCRIBE_SECRET` (32+ random characters),
`CRON_SECRET` (32+ random characters), a correct HTTPS `APP_ORIGIN`, and explicitly
set `WEEKLY_DIGEST_ENABLED=true`. Then schedule authenticated
`GET /internal/weekly-digests` with `Authorization: Bearer <CRON_SECRET>` after
Monday 00:00 Asia/Manila. Each call claims up to 10 accounts for the previous
Monday–Sunday window. Repeat until no jobs remain, respecting provider quotas.
No scheduler is configured automatically; tests never send real email. Only
enable email opt-in after sender verification and scheduling work.

Delivery uses verified Auth email, explicit account opt-in, current follows and
public/nondeleted event filters. Up to 100 public notification summaries are
included. No private messages, evidence, tracking-code fields or account/actor
identity fields are selected; staff must still keep sensitive details out of
approved public titles and school attribution.
Following is in-app only unless an account separately opts into the digest.
Signed unsubscribe links authorize only disabling the weekly digest; GET displays
a confirmation and POST disables delivery. Keep the signing secret stable. This
is not a one-click-unsubscribe API.

The worker combines unique account/week claims with provider idempotency keys
([Resend API](https://resend.com/docs/api-reference/emails/send-email)). Failed or
uncertain sends are not blindly retried. Reconcile provider logs before an
operator resends anything, especially outside the provider's 24-hour idempotency
window. Monitor endpoint failures and aggregate job states without logging
addresses or message bodies. Claim calls remove job metadata older than 90 days;
notification and clarification retention still follows the school's policy and
existing submission/event retention jobs.

Run build, typecheck, tests and dependency audit before release. In-memory
PostgreSQL, local HTTP fixtures and mocked email tests do not verify hosted
Supabase services or concurrent hosted sessions. Staging acceptance must include
private-code ownership, role revocation, hidden-comment RLS, stale bulk rollback,
merge redirects, follow transfer, and one opted-in digest plus unsubscribe.

This app runs Express, Eta and TypeScript. Vercel invokes `api/index.ts`, which
loads the compiled `dist/server.js`. Use `apps/web-express` as the project root.

All authored application scripts live in TypeScript: server code in `src/`,
browser code in `src/client/`, the worker in `src/sw.ts`, Vercel entry in `api/`,
and tests in `tests/*.test.ts`. `npm run build` compiles the server to `dist/`,
browser scripts to `public/js/`, and the worker to `public/sw.js`. These JavaScript
files are generated runtime assets; browsers do not execute TypeScript directly.
`npm run typecheck` checks the server, browser, worker, Vercel entry and tests.

Eta templates contain markup and server-side template expressions, with page
data passed through HTML attributes or a non-executable JSON script. UI event
bindings are in `src/client/events.ts`, including newly loaded feed cards.
The migrated browser code retains permissive parameter/null settings while DOM,
Supabase and auth contracts are checked; server and Vercel code use strict checks.
Before starting development, run `npm run build:client` (or
`npx tsc -p tsconfig.client.json --watch` in another terminal when editing UI code).

## Production setup for suggfeed.me

1. Apply `supabase/migrations/202610100001_web_sessions.sql` and
   `supabase/migrations/202610100002_staff_feedback.sql` to the same Supabase
   project used by this app. Run these migrations in the SQL Editor if older
   migrations have already been applied. The new table stores encrypted sessions,
   is protected by RLS, and has no browser-role permissions. The second migration
   adds public staff notes and a server-only transactional moderation function,
   so status, reviewer and status-history entries commit together.
2. Set Vercel production variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV=production`,
   `APP_ORIGIN=https://www.suggfeed.me`, and a stable random `SESSION_SECRET`.
   Generate the secret with
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   Keep the secret consistent across deployments. Changing it logs users out;
   clear existing rows in `web_sessions` before rotating it.
3. In Supabase Dashboard → Authentication → URL Configuration, set **Site URL**
   to `https://www.suggfeed.me` and add these exact **Redirect URLs**:
   - `https://www.suggfeed.me/auth/callback`
   - `https://suggfeed.me/auth/callback` if you serve the bare domain
   - `http://localhost:3001/auth/callback` for development
   The checked-in `supabase/config.toml` reflects this, but editing it does not
   update the hosted project's dashboard settings automatically.
4. Enable Google in Supabase Auth providers. Google's authorized redirect URI
   stays `https://<project-ref>.supabase.co/auth/v1/callback`, not the website's
   `/auth/callback`. Add `suggfeed.me` to the Google consent screen's authorized
   domains and configure the app's publishing/test-user settings as needed.
5. Set Vercel build command to `npm run build` and redeploy. Ensure both custom
   domains resolve to this Vercel project, with `www.suggfeed.me` as the preferred
   domain. Do not use the old Vercel hostname as the Supabase Site URL.

## Verification

Run `npm ci`, `npm run build`, `npm test`, then `npm start`. Tests mock the auth
provider/database and require no account credentials. On the deployed custom
domain, test Google login, password login, refresh, a second tab and logout.
Login should return to the originating domain and page. A failed code exchange
or blocked cookie shows a retry message instead of repeatedly reloading.

The browser owns the PKCE verifier and code exchange. The server verifies the
access token, reloads role permissions from the database, saves an encrypted
shared session before responding, and confirms the cookie on a subsequent
request. Public Supabase clients never retain user sessions on the server.

Sessions expire after seven days. Schedule this server-only SQL daily in your
database operations job: `delete from public.web_sessions where expires_at < now();`.
Expired sessions are also deleted on access. Back up the database through your
Supabase plan. The migration is additive; rolling back code does not require
dropping the session table. Older code using MemoryStore will require login again.

Mobile navigation exposes community features only; staff entry links are hidden
at widths of 800px or less. Backend staff permissions are still enforced by role
for every request; viewport width is not an authorization boundary.

## Staff workspace and campus roadmap

### Phase 1 workflow deployment

Apply `supabase/migrations/202610100003_staff_workspace.sql` after the existing
migrations, **before deploying this version of the web app**. Review the pending
remote migration list first (`npx supabase migration list`), then apply approved
migrations using your normal Supabase deployment workflow. No remote migrations
are applied by the local build. A missing workspace migration will prevent the
staff queue from loading; public feed and roadmap do not use the private tables.

The migration adds server-only workflow, internal-note, history, and per-user
saved-view tables and a private queue view. RLS is enabled with no browser access;
only the service role can access them. Do not grant these tables or the view to
`anon` or `authenticated`. Keep the service key on the server. Existing submissions
start unassigned with normal priority and no target date. Assignment choices come
from current moderator/admin profiles, not newly created accounts or auth metadata.

Queue filters (assignment, priority, overdue, status, and search) run before
pagination. Overdue means a target date before today in Asia/Manila, excluding
completed and declined work. Target dates, assignments, and priorities are private.
Public response and internal notes have separate forms and storage. Reviews save
atomically with optimistic conflict detection; conflicting edits retain the draft.
History shows the latest 100 workflow events, 100 status changes, and 100 private
notes. Internal notes are append-only; correct mistakes with a follow-up note.
Private records cascade when their submission is deleted through retention.

Review, Internal notes, and History have separate keyboard-accessible tabs. Save
controls stay visible while the drawer body scrolls. "Assign to me" selects the
current staff profile. Saving refreshes the queue and school-wide counts without
reloading the page. "Save & next" advances through remaining unreviewed items on
the current page; it requires saving or clearing a private-note draft first.
If saving succeeds but refreshing fails, the drawer explicitly reports that
distinction rather than presenting the saved review as a failed save.

Saved views store the currently applied URL filters (not unsent filter edits),
belong only to their creator, and have a ten-view limit. Removing a view requires
a second click; it does not delete submissions. Views can be recreated from their
filters. Roll back application code if needed while retaining the additive tables.
Test the migration and privileges in a staging Supabase project before production.

The staff portal opens the oldest pending submissions first. Dashboard counts
cover all submissions, while search, status filters, and pagination apply to
the queue. CSV exports contain only the displayed page and protect against
spreadsheet formula execution. Staff review the full suggestion before saving
a status and public response. Failed saves retain the draft; leaving an unsaved
review asks for confirmation. The portal UI is desktop-only at widths above 800px.

The public roadmap uses actual database statuses: approved → Planned,
in_progress → In progress, resolved → Completed. Board loads eight ideas per
stage; By category uses exact category totals with eight-item previews and
category drill-down pages. Timeline and Completed have independent twenty-item
pages. Timeline is a horizontal work calendar with Manila month labels, a Today
marker, actual recorded starts/completions, and separately labelled school
percentage estimates. It does not invent future deadlines or dependency links.
Undated ideas remain in a labelled unscheduled list. Completed is a separate
monthly outcomes view; inferred completion dates say "around". Legacy `view=list`
maps to By category, and `view=outcomes` maps to Completed. `view=timeline` now
opens the work calendar. Filters, layout and page are shareable URL state;
changing layout navigates to page one. Public JSON excludes private workflow,
author IDs and tracking-code fields and is never service-worker cached.

### Progress, evidence and notification rollout

Use Node **22.x**. From `apps/web-express`, run `npm ci --include=dev`,
`npm run typecheck`, `npm test`, and `npm run build`. The development server uses
Node's built-in watcher (`npm run dev`); run `npm run dev:client` separately when
editing browser TypeScript. The native Sharp package must be installed for the
deployment platform, not copied from Windows to Linux. Do not omit development
dependencies during the build, because TypeScript is a build dependency.

Apply the reviewed migrations through `202610120007_engagement_consistency.sql`
in order **before deploying these application changes**. In particular:

- `202610110001`: original completion-date support.
- `202610110002`: completion provenance, all-writer consistency and exact Tree aggregates.
- `202610110003`: immutable staff progress events and public projections.
- `202610110004`: private evidence bucket and reservation lifecycle.
- `202610110005`: follows, in-app notifications and held external-delivery outbox.
- `202610120006`: upload capability, cleanup and authorization hardening.
- `202610120007`: authoritative atomic vote counts and legacy vote toggles.

Migration 004 contains a minimal parser correction: its CASE comparison operands
are parenthesized so PostgreSQL can execute the function definition. No other
historical behavior was rewritten. Inspect `npx supabase migration list` against
staging/production before applying anything; if a remote project already records
004, compare its installed function definition rather than blindly repairing its
migration history. No local test/build applies migrations to a hosted project.

Staff select **Progress** in the submission drawer to publish a Started, Update,
Milestone, Blocked, Completed or Correction event. They must save unsent Review
changes first. Updates have explicit Public/Staff-only audiences, literal-text
previews, conflict protection and retry-safe request IDs. Staff-only events do
not alter public progress, stage or follower notifications. Public events are
immutable; append a Correction rather than rewriting history. Decreasing an
estimate requires Correction; completed work must be explicitly reopened in
Review. Backdated state changes cannot overwrite newer recorded progress.
`SCHOOL_OFFICE_LABEL` controls public attribution (default: School administration).

Evidence supports up to five JPEG/PNG/WebP/PDF files per update, each up to 10 MB.
Images require descriptive alternative text. Uploads go directly to private
Supabase Storage using short-lived signed upload capabilities; Express receives
metadata only. Finalization validates byte signatures/size, decodes bounded
images and re-encodes metadata-free WebP up to 1600px. PDFs receive framing checks
and are download-only, **not malware-scanned**. Do not upload student names,
faces or other personal information without the school's approved privacy process.
Files remain private until a public event is committed. Every download rechecks
parent publication/audience/ready state and uses a 60-second signed read URL.
Revoking publication blocks new links; a previously issued link may work until
its short expiry. Pending/failed uploads block publication and can be discarded.

Configure a scheduler to call `GET /internal/progress-evidence-cleanup` with
`Authorization: Bearer <CRON_SECRET>`. Set a separate strong secret in server env.
The route is disabled if unset; it is not automatically scheduled by this repo.
The bounded cleanup job retries orphaned/cancelled files and delays source-object
deletion until upload capabilities have expired. Monitor failures/503 responses
and run enough batches for actual upload volume. Public evidence retention beyond
the submission lifecycle remains an operational school policy; this job is not a
blanket one-year deletion policy.

Students can Follow an idea in its roadmap detail panel and read updates at
`/notifications` (also in the account menu). Public milestone/stage/block/completion
events notify followers by default; plain updates require staff opt-in. Following
does **not** opt the student into email/push. External outbox rows stay held until
an explicit opt-in and delivery worker are implemented. Notifications are scoped
to the signed-in user and hide unpublished/private events; pagination and unread
counts use those same visibility rules. Unfollowing prevents future fanout.

Tests include mocked HTTP/browser flows, real Sharp processing, and in-memory
PostgreSQL (PGlite) execution of migrations 002–007/RPC/RLS lifecycle cases.
They do not verify hosted Storage URLs, Supabase extensions or a live deployment.
Before release, test signed uploads/download expiry, role revocation, concurrent
staff edits, follow/unfollow, notification ownership and cleanup against a separate
staging Supabase project. Back up production first. Roll back code by redeploying
the prior application build; retain additive tables and test old-code/RPC
compatibility. Do not drop public history or files as a rollback shortcut.

For local visual QA with sample data (no database writes), run
`node -r ts-node/register/transpile-only tests/support/workspace-preview.ts`
from this app folder and open `http://127.0.0.1:4317/admin`,
`/roadmap`, or `/staff-login`. The test harness is never mounted by the
production app. Its first moderation save deliberately fails to exercise retry UI.
