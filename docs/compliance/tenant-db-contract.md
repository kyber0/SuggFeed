# Tenant database contract

Staged migration `202610160002_tenant_isolation.sql` is local code, not a production cutover. It leaves `school_release_gate.isolation_verified=false`. Migration003 adds approved school policy/application/invitation handling. Applying these migrations requires a privileged database migration role able to create a restricted role and transfer function ownership; rehearse these permissions in hosted staging before cutover.

## Preserved demo ownership

Every existing school-owned row is assigned to the pending demo school `00000000-0000-4000-8000-000000000001` (`demo`). Accounts remain global. Existing profile roles become memberships only in that demo school; nobody becomes a platform operator. The migration adds non-null ownership, indexes and composite ancestry constraints without deleting records. New schools receive their own five default categories, disabled workflow rollout flags and retention settings. No runtime fallback selects the demo school.

The following tables require a trusted `school_id` in all service queries and writes:

`categories`, `submissions`, `status_history`, `attachments`, `votes`, `comments`, `bookmarks`, `shared_posts`, `reports`, `audit_log`, `retention_settings`, `submission_workflow`, `staff_internal_notes`, `staff_workflow_history`, `staff_saved_views`, `idea_updates`, `idea_update_drafts`, `idea_update_uploads`, `idea_follows`, `idea_notifications`, `idea_notification_outbox`, `idea_clarifications`, `idea_merges`, `notification_preferences`, `weekly_digest_jobs`, `workflow_rollout`, `workflow_requests`, `work_date_repairs`, `student_saved_searches`, `submission_receipts`.

`staff_submission_queue` and `staff_stale_work` include `school_id`. `school_profiles` exposes global profile columns with `school_id` and the active membership's role replacing the legacy global role. It is a service-only directory, requires a school filter, and must never be returned wholesale to public/student readers. `tenant_profiles` is a private internal compatibility view available only to the restricted execution role.

`profiles`, `auth.users` and `web_sessions` remain global. Authenticated database clients can read only their own profile and update safe profile fields. School roles cannot modify global roles. The registry, platform operators, release gate and onboarding tables use their dedicated policies/RPCs rather than the business gateway.

## Service gateway

```sql
SELECT public.tenant_rpc(
 p_school_id := '<resolved active school UUID>',
 p_actor_id := '<verified session account UUID, or NULL>',
 p_function := 'staff_workflow_context',
 p_args := '{"p_submission_id":"<submission UUID>"}'::jsonb
);
```

Only `service_role` may call this entrypoint. The server resolves school and actor; request bodies cannot supply either authority. A non-null actor must have a current active membership in the active school. The argument object uses the original RPC parameter names. The gateway injects/checks `p_actor`, `p_actor_id`, `p_staff_id`, `p_user`, and `p_user_id`. An explicit null `p_user_id` is preserved only for the three anonymous-capable submission/vote functions, so signed-in members can deliberately remain anonymous. Every non-null identity must equal the verified actor. Other unknown/missing arguments fail closed; function defaults remain supported.

JSON results preserve original shape: scalar/composite/JSON returns are scalar values/objects, SETOF/TABLE results are arrays, empty sets are `[]`, absent scalar projections remain `null`. Void returns are `null`. The gateway stores/restores transaction-local school and actor context, including restoration by transaction rollback on error. Stored function signatures use textual names rather than database-local OIDs so a dump/restore can resolve them again.

Allowed business functions (34):

- Staff: `moderate_submission`, `review_submission_transition`, `save_staff_review`, `save_staff_view`, `admin_search_students`, `staff_workflow_context`, `staff_workflow_snapshot`, `repair_work_dates`, `bind_progress_draft`, `perform_workflow_action`, `post_idea_update`.
- Evidence: `reserve_progress_upload`, `finalize_progress_upload`, `cancel_progress_upload`, `read_staff_idea_update_files`, `read_authorized_progress_file`.
- Public projections: `read_public_idea_updates`, `read_public_idea_update_files`, `read_public_submission_history`, `read_roadmap_activity`, `roadmap_category_counts`.
- Account/community: `set_idea_follow`, `mark_idea_notification_read`, `set_idea_vote`, `cast_idea_vote`, `community_action`, `save_student_search`, `create_submission_once`, `read_submission_receipt`.
- Server jobs: `claim_weekly_digests`, `claim_progress_upload_cleanup`, `finish_progress_upload_cleanup`, `list_progress_sources_to_clean`, `finish_progress_source_cleanup`.

Server jobs require actor null and an active school; authorized cron handlers iterate schools explicitly. Job functions cannot claim/delete/update another school's rows. Anonymous public projections, anonymous submissions/votes/receipt recovery, authorized public file lookup and anonymous community reply require an active school whose approved settings deliberately permit publication. `community_action` retains its own per-action actor/ownership validation. Missing/unapproved/private policy denies anonymous access. Members may read their school's public projection regardless of the school's internet publication choice.

## Defense inside functions

Every allowlisted legacy function executes as `tenant_executor`, a locked role with no login, superuser status, schema creation or RLS bypass. It owns functions, never the underlying tables. All table reads, aggregates, writes and nested calls obey the school RLS predicate. Trigger functions run with this same restricted role and derive their transaction school from the actual trigger row. This covers notification/digest joins, evidence cleanup, mixed-school batches and nested workflow operations; membership projections replace global role decisions. Revoked followers/members are excluded from notification fanout and digest claims.

API roles have no direct access to school-owned base tables or the legacy business RPC signatures. Raw RPC grants are revoked even from `service_role`; the service uses the gateway. Public HTTP handlers must select approved columns and published records under the server's trusted school/publication context. Direct service table access still bypasses RLS and remains a server authorization boundary: scope every reader/update/delete by trusted school and put school ownership on every insert/upsert. Composite FKs also reject cross-school categories, parents, assignees, users, merge targets, draft/update files and receipt links; school ownership cannot be changed after creation. Additional service credentials/SQL owners remain operationally privileged and must not be exposed to clients.

Evidence reservations produce `school UUID/file UUID/source` and `school UUID/file UUID/final.ext`; finalization accepts only the stored reserved final path. Existing demo paths are preserved for bounded migration compatibility. Retired clients cannot access raw database business data. Storage signing/download and service cron authorization are separate server controls, covered by their integration tests.

## Verification and remaining acceptance

`tests/support/tenant-db.ts` applies the complete historical migration sequence in PGlite, with Auth/Storage stubs, initial hosted-style anon/authenticated table grants, and the real pg_trgm extension. Only CONCURRENTLY index-build locking is replaced for the single-process harness. `tests/tenant-isolation-db.test.ts` exercises preserved demo rows; all 30 ownership columns; all parent FK scope; denied raw REST/RPC grants; member/global-role separation; forged actors; revoked/suspended access; cross-school resource IDs, aggregate reads and atomic mixed batches; receipts/searches/preferences/digest keys; upload paths/finalization/cleanup; notifications; and workflow/review/date operations. Gateway tests assert both returned data and absence of unrelated side effects.

PGlite does not prove hosted Supabase grants, PostgREST role selection, concurrent locks, Storage enforcement or backup/restore behavior. Hosted staging must rehearse privileged role creation/function transfer, two-school negative HTTP/REST/RPC/Storage cases, migration row counts, concurrent revocation/idempotency behavior, representative query plans/load, and restore before any release-gate approval. No production SQL, migration push or activation is authorized by these local results.

Local execution recorded 16 October 2026: all 16 tenant database scenarios passed with the final migration (42.7 seconds); test TypeScript compilation passed. The suite also applies the complete history as a separate NOSUPERUSER/NOBYPASSRLS migration owner with CREATEROLE and schema ownership, verifies all 34 business functions transfer to the restricted executor, and confirms it cannot create schema objects afterward. A 3,000-row two-school fixture selects `submissions_school_status_page_idx` for the tenant/status page query. These are local evidence only; no hosted migration was executed.

Review follow-up: bookmark/share upserts use `(school_id,user_id,submission_id)` as their conflict target; matching unique indexes replace the old global pair constraints. A subsequent focused database test proves own-school replay, independent A/B rows and composite-FK rejection of a foreign-school parent with no extra side effects. That scenario and the non-superuser migration scenario both passed (2/2); the test file now contains 17 scenarios.
