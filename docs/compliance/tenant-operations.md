# Shared school operations

This is staged code and a deployment runbook. It does not record a hosted deployment, production migration, successful provider configuration, or release approval.

## Cron workers

The Express `/internal/weekly-digests` and `/internal/progress-evidence-cleanup` handlers require an exact bearer `CRON_SECRET` of at least 32 characters. Configure HTTPS at the approved canonical `APP_ORIGIN`. Digest delivery additionally requires `WEEKLY_DIGEST_ENABLED=true`, Resend sender/key and a separate signing secret of at least 32 characters; missing configuration leaves delivery disabled.

Each authenticated run pages active registry schools with approved school settings in batches of 100 and executes each job inside a separate trusted school context, with no user or staff role. School activation is guarded by the database release gate and institutional approval. Scoped RPCs claim only the current school's jobs; database claims remain bounded (50 evidence uploads/sources per school and the digest claim limit). A school failure increments the response failure count and processing continues with other schools. A registry outage fails the request rather than reporting an empty successful run. Monitor non-200 responses and aggregate counts; do not log email addresses, content, unsubscribe capabilities or signed URLs.

Digest preferences, notifications, follows, completion records and provider idempotency keys include school scope. Only public updates on still-followed ideas qualify. Verified global Auth supplies the destination email; current consent, active school membership, school active status and current policy approval are checked immediately before delivery. Account email verification alone does not confer school membership. Network uncertainty is marked `uncertain`, never automatically resent. A failure recording one completion does not abort later jobs; the database expiry policy makes abandoned `processing` jobs uncertain rather than retrying potentially accepted emails.

Links target `/s/:slug/notifications` and the issuing school's unsubscribe page. Unsubscribe signatures bind school ID and user ID. Another school's path, forged token and legacy account-only token cannot change preferences. Links in historical emails with the old unscoped signatures stop working; users can manage preferences after choosing a school. Preserve `DIGEST_UNSUBSCRIBE_SECRET` for current email links when rotating deployment infrastructure, or communicate planned invalidation.

## Evidence

New objects use `<school UUID>/<upload UUID>/source` and `<school UUID>/<upload UUID>/final.<extension>`. The database verifies the record's school and parent ownership; the server validates the returned path before upload signing, downloads, finalization and cleanup. Preserved unprefixed `<upload UUID>/...` paths are permitted only in the explicitly mapped `demo` school. Do not copy, rename or purge those existing objects as an implicit migration step.

Download links expire after 60 seconds. Upload tokens can remain usable until provider expiry; source cleanup repeats after that expiry. Signed downloads already issued remain usable until their expiry after a membership is revoked. Storage policies, provider bucket privacy, database authorization and path validation are all required. Storage failures leave cleanup records unfinished for retry; unsafe paths are counted as failures without deleting objects.

## Legacy client cutover

The legacy Next application now returns HTTP 410 for every path through middleware, including its health/data entrypoints and static assets. The native app was previously removed; installed copies and cached web code can still call old APIs. Database grants and tenant RLS must deny their old unscoped REST/RPC access.

All ten legacy Edge deployments must be updated during the maintenance cutover:

- `add-comment`
- `archive-old-submissions`
- `get-attachments`
- `invite-staff`
- `lookup-by-tracking-code`
- `my-activity`
- `register-push-token`
- `review-submission`
- `submit-feedback`
- `vote-submission`

Nine entrypoints unconditionally return 410 `SCHOOL_CLIENT_RETIRED` before parsing bodies, reading credentials, constructing service clients, querying Auth, or sending mail. `register-push-token` retains its existing 410 `PUSH_CHANNEL_RETIRED` contract. OPTIONS remains available for CORS preflight. There is no environment switch or supplied `school_id` that re-enables them. Retiring the archive endpoint also disables legacy destructive retention; a later reviewed per-school retention worker must account for holds and records duties before deletion resumes.

Repository edits do not replace already deployed functions. Before approving shared service activation: deploy every tombstone and the retired Next application; verify 410 responses with old valid credentials and malformed/forged school bodies; disable obsolete archive cron schedules; revoke old database RPC signatures; verify direct REST/storage denial; invalidate old service-worker caches through the approved deployment; and rehearse two-school jobs in synthetic staging. Retain the tombstones so older clients fail explicitly. Never restore a previous service-role Edge implementation as a rollback after multiple schools exist.

## Support, exports and recovery

School removal is not global account deletion. Fulfill exports, deletion/return and restoration only after verifying the requested school and authority, checking records holds and deletion suppression, and redacting unrelated identities. Provider dashboards, service-role credentials and backups bypass application authorization: restrict operator access separately and record school, justification, access expiry and outcome without exporting content into operational logs. Rehearse restore with two schools and preserved deletion suppression before release. These provider controls and restore/deletion drills remain release evidence, not claims made by local tests.

## Local evidence

`tests/school-jobs.test.ts` checks registry pagination, separate school scopes and continuation after failures. Digest/evidence tests cover token school binding, consent/membership rechecks, delivery uncertainty, bounded failure handling, unsafe object rejection and short-lived signatures. `tests/legacy-clients.test.ts` executes the compiled retirement handlers with mocked runtime dependencies and inventories every Edge entrypoint. Deno/provider integration and hosted middleware/deployment behavior require staging verification.
