# Retired web client cleanup

The active application is `apps/web-express`. The old `apps/web` Next.js client
already returned HTTP 410 from its middleware before its source was removed.

## Removed

- The retired Next app, its components, tests, PWA assets and Sentry configuration.
- Root Next configuration and instrumentation used only by that app.
- Next workspace commands, CI job and unused deployment environment mappings.
- Turbo and its configuration, plus duplicate root TypeScript tooling. The remaining
  app already owns its compiler; root commands delegate directly to it.
- Unreferenced `packages/shared/src/submission.ts` (legacy Zod schema), old
  `resources/suggfeed-logo.png` and unused root attachment fixture.
- The stale root Deno lockfile containing retired Expo/Next dependencies. Retained
  Edge Functions use the lockfile next to their own Deno configuration.
- Dependencies reachable only through the deleted workspace, pruned from the pnpm lockfile.
- Accidentally tracked Turbo cache archives and the pnpm cache database. Package-manager
  caches are ignored; they are not application source.

## Updated

Root workspace configuration describes Express only. The Express brand
asset generator no longer recreates `apps/web`. Existing structural/branding
fixtures reflect the remaining application; retirement-handler checks remain.
Current READMEs describe the supported commands. Historical audits and plans are
kept as records, with historical notes where they described the removed client.

## Preserved

Express source and delivery assets, original branding artwork, database migrations,
authentication email templates, legacy Edge retirement handlers, security workflows,
operational documents and developer tooling. No database records or hosted
configuration were deleted. An old, independently hosted Next deployment must stay
retired or be removed separately; deleting repository files does not change it.

Vercel must continue using `apps/web-express` as its project Root Directory. Root
pnpm commands use pnpm 9.15.0; direct Express installs use its npm lockfile.

## Checks and limits

The root build passed using pinned pnpm 9.15.0, Express type checking passed, and
the pruned lockfile passed an offline frozen-lockfile check. Active Express direct
dependency versions are unchanged (783 to 292 lockfile package entries). Workflow
YAML and package JSON parsed successfully. Checks used Node 24; deployment targets
Node 22. No test suite, hosted deployment, database write or email delivery check
was performed.
