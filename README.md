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

## Build boundaries

Authored Express code is TypeScript; Eta files are server-rendered views. `dist/`,
`public/js/`, `public/css/*.bundle.css` and `public/sw.js` are generated artifacts.
Root commands delegate directly to Express; there is no separate monorepo build
orchestrator. Server-only credentials must not enter browser bundles.

See [Express architecture](apps/web-express/docs/architecture.md) for ownership of
routes, services, database operations, browser scripts and fixtures.

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
