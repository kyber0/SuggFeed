# SuggFeed

A school suggestion and feedback system built with Express, Eta, TypeScript and Supabase.

## Repository layout

- `apps/web-express/`: the active responsive website, browser scripts and server API.
- `supabase/migrations/`: forward PostgreSQL migrations, policies and database functions.
- `supabase/functions/`: retained Deno Edge Functions, including retirement responses for legacy endpoints.
- `supabase/templates/`: authentication email templates.
- `assets/branding/`: original branding artwork used to generate Express delivery assets.
- `docs/`: architecture, operations, security reviews and historical plans.

The Next.js and standalone Expo apps are retired and removed. Older audits and
plans may mention them as historical evidence. They are not supported build or
deployment targets. See [repository cleanup](docs/operations/repository-cleanup.md)
and the [Expo retirement runbook](docs/expo-retirement.md).

## Local development

Use Node **22.x** (`.nvmrc`) and **pnpm 9.15.0** (pinned in `package.json`).
From the repository root:

```sh
corepack pnpm install --frozen-lockfile
```

Copy `apps/web-express/.env.example` to `apps/web-express/.env` and configure local
values. Never commit secrets. See the [Express README](apps/web-express/README.md)
for authentication, storage, email jobs and deployment configuration.

```sh
pnpm dev          # Express, default port 3001
pnpm dev:client   # second terminal: rebuild browser scripts on edits
pnpm typecheck    # Express server, API, workers and browser checks
pnpm test         # Express test suite, when verification is requested
pnpm build        # Express production build
pnpm start        # start the already-built Express server
```

`build:all` and `test:all` remain compatibility aliases for the remaining workspace.
There are no Next.js commands or dependencies. Root workspace installs use pnpm and
`pnpm-lock.yaml`; do not create a root npm lockfile. Vercel and CI use the independent
Express lockfile with `npm ci --workspaces=false --include=dev` in `apps/web-express`.

## Verification and dependency updates

The deployment verification path is the standalone npm install in
`apps/web-express`; root pnpm commands remain supported for local development.
When updating runtime dependencies, refresh both lockfiles and compare resolved
versions rather than assuming that matching manifest ranges produce the same tree.
Do not copy an environment file into a clean verification checkout.

In `apps/web-express`, run all four scoped lint checks before type checking,
tests and the production build:

```sh
npm run lint:animations
npm run lint:moderation
npm run lint:assistant
npm run lint:assignments
npm run check:boundaries
npm run typecheck
npm test
npm run build
npm audit --workspaces=false
```

Also run `pnpm audit` from the root when updating the pnpm lock. The standard test command skips the real PostgreSQL concurrency test unless a
local fixture is supplied. Run `npm run check:postgres` on a Docker-capable host:
it prepares a pinned, network-isolated PostgreSQL instance, replays migrations,
runs the concurrency test and verifies a local backup restore before cleanup.
CI runs this separately; production release checks require it too. It does not
connect to a hosted project. See the [recovery rehearsal](docs/operations/recovery-rehearsal.md).

The original [audit](audit/REPORT.md) is a historical baseline. Current fixes,
verification scope and remaining work are tracked in
[remediation status](audit/REMEDIATION-STATUS.md).

## Build boundaries

Authored Express code is TypeScript; Eta files are server-rendered views. `dist/`,
`public/js/`, `public/css/*.bundle.css` and `public/sw.js` are generated artifacts.
Root commands delegate directly to Express; there is no separate monorepo build
orchestrator. Server-only credentials must not enter browser bundles.

See [Express architecture](apps/web-express/docs/architecture.md) for ownership of
routes, services, database operations, browser scripts and fixtures.

## Shared presentation contracts

School color and design rules live in `apps/web-express/src/contracts/`.
The server imports these TypeScript modules directly. Browser-only DOM application
lives in `src/client/school-colors-dom.ts` and `school-design-dom.ts`.
`npm run build:contracts` produces the classic browser helpers and their ignored
global declaration file from those sources using the existing TypeScript compiler.
It runs automatically for normal builds, tests, type checks and client-watch startup.
After editing a contract or DOM adapter during a watch session, rerun
`npm run build:contracts` to refresh the browser helper; the plain client watcher
does not bundle those sources. Never edit the generated declaration or helper files.

## Health and request diagnostics

- `/health/live` checks process liveness without accessing sessions or a database.
- `/health` and `/api/health` retain database readiness responses and a three-second
  deadline on their database probe. Admission/session middleware can add time.
- Supabase HTTP operations use a 20-second network deadline and preserve caller
  cancellation. This is a per-operation bound, not an end-to-end workflow deadline.
  There is no new automatic retry for writes.
- Responses carry a server-generated `X-Request-ID`. Access logs include that ID;
  centralized error records use it with stable codes and sanitized paths. They
  exclude exception messages, request bodies, tokens and query strings.

Static import boundary checks start as warnings with `npm run check:boundaries`;
`--strict` makes the CLI fail. The regression suite rejects a new violation against
the current zero-violation baseline. Checks cover explicit local imports/requires,
not browser globals, dynamic module names or SQL dependencies.

Optional browser characterization checks use an externally installed Playwright:

```sh
node scripts/check-school-contracts.cjs
node scripts/check-studio-inspector.cjs
```

Set `CHROMIUM_PATH` if using a system Chromium. The inspector check compares 144
reviewed cases at 320/1440px, plus focus, scroll, draft color and read-only behavior.
Use its `--record` mode only after reviewing an intentional UI change; do not update
snapshots just to silence a failure. These checks do not modify hosted content.

Health and logging controls do not prove that hosted alerts or backup restoration
have been configured. Those require separate operational verification.

## Edge Functions

The retained functions use `supabase/functions/deno.json` and its adjacent lockfile.
For explicit verification with Deno 2:

```sh
deno test --allow-env --config supabase/functions/deno.json supabase/functions/_shared/security.test.ts supabase/functions/_shared/notifications.test.ts
```

Retirement handlers must remain available for previously deployed client addresses.
Removing the Next.js source does not retire or delete a separate hosted deployment.

## Release

CI checks Express and retained Edge Functions. The manual deployment workflow keeps
its release checks, migration sequence and GitHub production-environment approval.
Vercel auto-deploy settings and environment reviewers are configured separately.

For the current Vercel project, keep **Root Directory = `apps/web-express`**. The
repository-root deployment command relies on that project setting. Hosting secrets
belong in Vercel; never put service-role credentials in public configuration.

Follow the [guided workflow rollout](apps/web-express/docs/guided-workflows.md) and
[persistent workflow runbook](apps/web-express/docs/persistent-workflows.md). Preserve
migration and audit history. Local builds do not prove hosted authentication,
mail delivery, tenant isolation, backups or production settings.

Audit remediation source ownership and remaining operational decisions are documented in [application boundaries](docs/operations/remediation-boundaries.md) and [recovery rehearsal](docs/operations/recovery-rehearsal.md).
