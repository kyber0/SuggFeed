# Recovery rehearsal and request diagnosis

## Local database evidence

From `apps/web-express`, with Node 22 and the managed local Docker daemon available:

```sh
npm ci --workspaces=false --include=dev
npm run check:postgres
```

This command creates an owned, uniquely named container with no network, published
ports or host data mounts. Its synthetic database uses temporary storage. A pinned
PostgreSQL 16 image makes the engine repeatable. Trust authentication is confined
to this isolated fixture; it is not a production configuration.

The script reuses the SQL bootstrap from `tests/support/tenant-db.ts` and
`submission-safety-db.ts`. It then:

1. Replays the ordered migration fixture and synthetic seed records.
2. Runs the existing real-PostgreSQL assignment concurrency test: ten simultaneous
   inserts must respect capacity; concurrent jobs must not duplicate notifications.
3. Dumps the fixture and restores it into a second database in the same container.
4. Compares row counts and content hashes for every public/auth/storage base table.
5. Compares table owners, effective privileges, RLS flags/policies and function
   ownership/security settings/effective privileges.
6. Confirms an administrator read succeeds and a student receives SQLSTATE 42501.
7. Removes the owned container and temporary database storage, including on failure.

The auth and storage schemas are test fixtures, not the managed Supabase schemas.
Both databases reuse the same cluster roles. This demonstrates application schema,
concurrency and fixture restoration; it does not certify hosted backup scheduling,
managed identity recovery, offsite retention or a production recovery-time objective.
The native bootstrap intentionally supports its fixture INSERT queries only;
additional returned-row queries must be implemented explicitly. PGlite retains the
existing non-superuser migration-role checks.

Do not apply the fixture bootstrap or its archive to a real project. CI runs the
check separately from the standard suite, and the manual production release job
requires it before hosted migrations.

## Before a hosted recovery

An operator must record the actual project, backup owner, restore mechanism,
retention, recovery target and approved maintenance window. Rehearse against a
separate project with provider-supported role/auth/storage handling. Preserve
accounts, memberships, policy approval and the assignment audit trail. Verify
school separation and revoked access before reopening workspaces. Record elapsed
recovery time rather than infer it from the local fixture.

No hosted restore, deployment or backup-policy change was performed by this
remediation. The local evidence is saved in the audit remediation artifacts.

## Request diagnosis

A response includes a server-generated `X-Request-ID`. Search runtime logs for that
ID to connect the access record with a `request_failed` JSON record. Error records
contain a stable code, method, sanitized path and bounded error type; they exclude
raw exception messages, query strings, bodies and known tracking/invitation tokens.

- `SERVICE_UNAVAILABLE`: inspect provider availability and admission/session checks.
- `INVALID_REQUEST` or `BODY_TOO_LARGE`: inspect the request shape and size without
  copying private input into logs or tickets.
- `INTERNAL_ERROR`: use the request ID and deployed revision to reproduce locally
  with synthetic input; do not enable body or credential logging to investigate.

`/health/live` reports process liveness without database/session work. `/health`
and `/api/health` retain database readiness and 503 failure responses; their probe
has a 3-second deadline, while preceding middleware can add time. Supabase HTTP
operations have a 20-second bound and preserve caller cancellation; multi-operation
workflows do not thereby gain an end-to-end 20-second guarantee.

Configure external alerts against the appropriate signal and verify delivery in
an approved nonproduction environment. Publishing these endpoints or structured
logs does not prove that monitoring or alert routing is enabled.
