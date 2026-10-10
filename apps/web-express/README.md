# Express deployment and authentication

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
in_progress → In progress, resolved → Completed. It includes category search,
board/list layouts, mobile stage selection, keyboard-accessible detail panels,
and shareable item URLs. It does not imply an assigned team, effort estimate,
or delivery date. The board currently displays up to 100 most-supported ideas.

For local visual QA with sample data (no database writes), run
`node -r ts-node/register/transpile-only tests/support/workspace-preview.ts`
from this app folder and open `http://127.0.0.1:4317/admin`,
`/roadmap`, or `/staff-login`. The test harness is never mounted by the
production app. Its first moderation save deliberately fails to exercise retry UI.
