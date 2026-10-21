# School access controls

Super admins use **Platform dashboard → Manage school → School access & closure**.

- **Suspend school:** available for active schools; pauses workspace access and retains records and accounts.
- **Reactivate school:** available for suspended schools; requires current service setup (except the reserved fictional demo), reviewed school policies, an active school administrator and verified isolation.
- **Close school:** available for pending, active or suspended schools. Retains records and accounts. The application does not reopen closed schools or permanently delete their records. Use suspension for temporary restrictions.

Each control opens an authenticated confirmation page. A current platform-operator grant and verified MFA are required on both GET and POST. The operator types the school slug, records a reason (10–2,000 characters), and acknowledges the effect. Cancel is available without changing school status.

`manage_school_status` locks the school, checks the expected prior status and slug, validates the transition and active administrator, and commits the status and a `school_registry_events` entry together. The existing activation trigger continues to enforce reviewed policies and isolation. Changed/stale states reject the request. Initial activation also uses this RPC with expected status `pending` and an explicit initial-activation audit reason.

Apply `supabase/migrations/202610210003_school_status_management.sql` before deploying this application version. Only the server service role can execute the new RPC; anonymous, authenticated browser accounts and the tenant executor cannot. Browser writes retain the application's same-origin protection.

The migration creates an operation; it does not change any school's status. Suspension or closure does not erase downloaded content, cancel already issued signed URLs, perform data disposal or delete global sign-in accounts. Existing retention, unsubscribe and records-hold processes still apply.

Delivery checks: type checking and production build; local confirmation layouts at 320, 375, 768 and 1440 px; hosted migration registration and function grants. School status changes were not exercised against hosted school records. Automated tests were not run. Existing activation test fixtures were updated for UUID school IDs and the new RPC.
