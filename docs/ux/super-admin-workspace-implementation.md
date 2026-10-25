# Super-admin workspace implementation

## Delivered

- One shared platform shell with Overview, Schools, Reviews, Studio access, Activity and Platform settings. Sections are ordinary server-addressable GET destinations; selected-section reads replace the old hidden-panel preload.
- Compact directory rows with one Open school action. Platform-only school records have Summary, Reviews, Access and Activity tabs. Existing school-admin links still require an independent active school-admin membership.
- Authoritative queue counts, independent oldest-first application/policy/form lists, individual review details, version/revision checks and preserved review-reference input after failures. Initial blank school-policy records are setup work, not reviewable policy submissions.
- Policy comparisons show current approved versus submitted values. Form review compares published questions/collection with the requested draft. Existing restricted review RPCs remain authoritative; approving an application creates pending, not active.
- School readiness identifies the requirement, responsible role and next step. Configured contacts do not claim mailbox ownership verification. The platform isolation release gate is labelled separately from school requirements.
- A single reusable grant control in school Access, reached from the Studio access list. Enable/Pause affects the school admins' editor grant, not school activation, membership or published appearance.
- Expired MFA on platform HTML forms opens a verification destination instead of a raw JSON page. Review references/lifecycle reasons can be recovered once from an actor-bound, ten-minute server-session record; no evidence is stored in browser localStorage. API responses and assurance requirements remain unchanged. New school-detail URLs are valid security return destinations.
- Lifecycle confirmations remain under the platform shell, retaining exact-slug confirmation, reasons, expected-state checks and atomic status RPCs. A stale/unavailable transition preserves the reason and disables an invalid resubmission.
- Operator-restricted activity projects only permitted lifecycle/grant/form-review/publication events and selected detail fields. Student membership events/conversations are excluded. This is committed-change history, not a record of failed attempts.
- Analytics use one consistent demo scope for school totals, memberships, ideas, trend and the previous equal elapsed period. Directory drill-down preserves that scope. Only the canonical fictional demo ID is excluded; other records are not automatically classified as fictional or verified real institutions.
- Native POST forms block duplicate submissions at form level without disabling the successful submit button before its decision value is serialized. Pending state resets after browser Back/forward restoration.
- Native scrolling and ordinary pointer behavior for platform operations; shared global decorative motion is omitted on platform pages. Existing accessible analytics animation/chart interaction remains.
- Legacy section bookmarks and the standalone customization destination lead into the new shell. Independent query state and bounded return destinations preserve list context without accepting external redirects.

## Data and migration

`supabase/migrations/202610250004_platform_workspace.sql` adds five read functions and two event-query indexes:

- `platform_dashboard_counts`
- `platform_review_queue`
- `platform_editor_schools`
- `platform_activity`
- `platform_insights`

Every function checks the actor's active platform-operator authority; execute is granted only to service_role. The server retains operator and MFA guards. The access list pages school records before looking up their latest grant events.

The migration was applied to the configured Supabase project and recorded in its migration history. Existing records, school statuses, memberships, release gates and write-function definitions were unchanged by this migration. No credentials, environment variables, new library or notification delivery was added.

## Code map

- `apps/web-express/src/lib/platform-dashboard.ts`: validated section/filter parsing, safe destinations, selective read models, readiness and review data.
- `src/routes/platform-dashboard.ts`: authenticated dashboard/detail routes and focused review/grant form handlers using the existing write RPCs.
- `src/routes/schools.ts`: removes the old combined dashboard read; retains lifecycle and legacy onboarding behavior.
- `src/routes/school-customization.ts`: canonical compatibility destination.
- `views/platform-schools.eta`, `platform-school.eta`, `school-status.eta` and platform partials: shared shell, lists, focused decisions, comparisons and lifecycle tasks.
- `src/client/platform-dashboard.ts`: bounded legacy-fragment bridge.
- `public/css/modules/platform.css`, build output, layout assets and strict client configuration: presentation and integration.

Unqualified paths are relative to `apps/web-express`.

## Inspection

- Full production build and full TypeScript check, including strict client compilation.
- Synthetic local real-template browser inspection of 20 states: main sections, all review types, school tabs, three lifecycle confirmations, empty/unavailable data, an unavailable-review reference recovery view and a stale-review presentation.
- Inspected 320, 360, 375, 390, 412, 430, 768 and desktop widths, plus 667×375 landscape. No horizontal document overflow or browser page errors observed in that inspection. Selected mobile reviews show the detail directly, with Back to queue.
- Read-only database inspection confirmed object-shaped results from all five new read functions using an existing enabled operator. No real review/grant/lifecycle action was exercised.
- Scoped source/diff checks and staged secret scan accompany release.

## Limits

No unit/integration test suite was added or run. Real production mutations, role revocation/concurrent-write exercises, live deployment, assistive technology, physical mobile keyboards, Lighthouse and Node 22 runtime parity were not verified. The execution host uses Node 24 while the application targets Node 22; the changes use existing supported APIs.

Sugi's existing safe review flow remains; feedback does not publish knowledge automatically. Request changes, bulk approvals, hard deletion, operator impersonation and global account bans remain outside this release. Pagination is bounded and manual refresh is used; no real-time subscription framework or new monitoring system was added.
