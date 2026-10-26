# Express maintenance boundaries

## Application ownership

Express is the active website for production features and workflows. The retired
Next.js and Expo clients have been removed. Retained Edge retirement handlers and
historical audits remain; removal of source does not change independent hosted
deployments. See [repository cleanup](../../../docs/operations/repository-cleanup.md).

## Runtime and build

The server entry is `src/server.ts`; Vercel's `api/index.ts` imports the compiled
server. Browser sources are independent classic scripts in `src/client/`,
templates are in `views/`, and the PWA worker is `src/sw.ts`. Keep script ordering
and Window contracts stable when moving browser code; do not convert everything
to modules without a bundling/loading plan.

Server output is `dist/`, browser output `public/js/`, worker output
`public/sw.js`. Regenerate them through build scripts, never hand-edit generated
JavaScript. Root commands delegate directly to the Express workspace. The app owns its
compiler and build pipeline; no separate monorepo orchestrator or Next build exists.

## HTTP, feature services and persistence

- `src/routes/`: HTTP methods, session/role preconditions, request normalization,
  response status/shape and forwarding unexpected failures to the error handler.
- `src/lib/`: feature validation, visibility/ownership checks, selected database
  fields, bounded queries and RPC adapters. Keep existing modules grouped by
  feature (`community`, `staff-board`, `workflow`, `progress`, `engagement`).
- `supabase/migrations/`: transactional lifecycle policy, optimistic concurrency,
  idempotency, publication, history and RLS. Route/service checks are not a
  replacement for database authorization or the centrally controlled rollout.
- `src/types/`: shared server/session and domain contracts. Public payloads must
  whitelist fields; do not reuse private row types as public API contracts.

Community routes now delegate report decisions, public merge history and staff
idea selection to the existing community feature library. Ownership, public
status filters, UUID validation, bounded windows and selected fields are retained.
Other legacy routes still contain direct queries; move those incrementally with
ownership/role/visibility tests rather than restructuring the entire repository.
Do not create a generic repository abstraction that hides RLS or transactional RPCs.

## Browser typing migration

The main browser config remains a compatibility config for large legacy scripts.
`tsconfig.client.strict.json` adds a full-strict, no-emit gate for `preferences`,
`theme-init`, `theme`, `toast` and global contracts. Both build and typecheck run this gate;
`predev` also reaches it. Newly migrated scripts should join the explicit cohort
only after fixing implicit parameters, nullable DOM references and unknown catch
values without blanket `any` or non-null assertions to silence errors.

Keep user-visible behavior stable. Add API response contracts and runtime field
validation before expanding strictness into network-heavy review/auth scripts.
Use small cohorts with tests, then remove permissive overrides when every script
is covered. Test TypeScript config still has legacy overrides and is not claimed
as fully strict.

## Tests and release

`tests/` owns Node HTTP/browser fixtures and PGlite database checks. Fixtures must
never be mounted by production routes. Structural tests guard workspace selection,
root command delegation and the strict cohort. Community reader tests guard authorization,
visibility and explicit selections; existing route/database tests remain required.

Run root `pnpm typecheck`, `pnpm test:all`, and the appropriate builds. CI checks
the Express application and retained Edge Functions. Hosted staging acceptance and rollout use
[guided-workflows.md](guided-workflows.md), not this document. No schema changes,
production migration, rollout switch or deployment are part of this cleanup.
