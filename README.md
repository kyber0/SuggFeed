# SuggFeed

A school suggestion and feedback system backed by Supabase.

## Applications

- `apps/web-express`: production-facing Express, Eta and TypeScript website.
- `apps/web`: separate Next.js application, retained with explicit commands.
- `supabase/functions`: Deno Edge Functions, including compatibility endpoints.
- `supabase/migrations`: immutable forward PostgreSQL migrations and policies.

The standalone Expo/React Native app is retired. The responsive website is not
removed or replaced. See [the retirement runbook](docs/expo-retirement.md) for
the separate hosted rollout. Existing database token fields are retained for
compatibility; updated functions no longer read/write Expo tokens or deliver Expo push.

## Local development

Use Node **22.x** (`.nvmrc`) and **pnpm 9.15.0**, pinned by `packageManager`.
From this repository's root:

```sh
pnpm install --frozen-lockfile
```

Copy `apps/web-express/.env.example` to `apps/web-express/.env` and configure
local values. Do not commit secrets. The Express [README](apps/web-express/README.md)
describes environment, authentication, storage, optional email jobs and deployment.

```sh
pnpm dev          # Express, default port 3001
pnpm dev:client   # second terminal: rebuild browser scripts on edits
pnpm typecheck   # both applications, including the strict browser cohort
pnpm test        # Express suite
pnpm build       # Express server, browser, service worker and API checks
pnpm start       # start the already-built Express server
```

Next.js remains independently available:

```sh
pnpm dev:next
pnpm test:next
pnpm build:next
pnpm test:coverage:next
```

Configure `apps/web/.env.local` for that app's environment, not the Express file.
All-app checks are `pnpm test:all` and `pnpm build:all`. They execute both apps;
they do not launch either website or deploy anything. There is no root lint
claim: the existing Next.js lint script is a placeholder, not a real linter.

The root workspace declarations agree on both apps. The independent Express
`package-lock.json` remains supported for Vercel/CI installing from that app
directory with `npm ci --workspaces=false --include=dev` (also configured in
Vercel/CI). Root workspace installs use only pnpm
and `pnpm-lock.yaml`; do not create an additional root npm lockfile.

## Build and maintenance boundaries

Authored Express code is TypeScript; Eta files are server-rendered views.
`dist/`, `public/js/`, and `public/sw.js` are build artifacts. Next.js builds to
`.next/`. Turbo declares both artifact sets; build/test/typecheck cache reuse
is disabled until environment and generated-file inputs have a verified cache
policy. Credentials are process environment only, never artifact outputs.

See [Express architecture](apps/web-express/docs/architecture.md) for route,
feature-service, database, browser and test ownership. This is an incremental
cleanup, not a framework rewrite or a claim of complete client strictness.

## Edge Function tests

Install Deno 2, then run the mocked security/notification suite:

```sh
deno test --allow-env --config supabase/functions/deno.json supabase/functions/_shared/security.test.ts supabase/functions/_shared/notifications.test.ts
```

Local fixture/mocked tests do not prove hosted Auth, Storage, RLS, concurrency,
mail delivery, backups or production settings.

## Release safety

`ci.yml` checks Express and Next.js independently and runs Deno tests.
`deploy.yml` requires manual dispatch from `main`, release checks and the
configured GitHub production environment approval before hosted changes.
Environment reviewers and Vercel auto-deploy settings require separate operator
verification. Do not deploy from a successful local build alone.

Use the [guided workflow rollout](apps/web-express/docs/guided-workflows.md):
inventory remote migration versions, rehearse through migration
`202610130010_guided_workflows.sql` in a separate staging project, verify staff
acceptance, deploy compatible code/database functions, then enable the central
rollout control explicitly. Preserve audit/history data during rollback. No
production migration or enforcement change is performed by local scripts.

For Vercel, select `apps/web-express` as the project root for the Express website,
not `apps/web`. Configure environment values in the hosting platform; never
place a service-role key in public browser configuration.
