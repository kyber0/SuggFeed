# Express deployment and authentication

This app runs Express, Eta and TypeScript. Vercel invokes `api/index.js`, which
loads the compiled `dist/server.js`. Use `apps/web-express` as the project root.

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
