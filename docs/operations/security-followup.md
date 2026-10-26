# Security review follow-up — 26 October 2026

## Changes

- Private form responses and submission images use one explicit authorization
  helper: submitting owner/original receipt, active school admin, or assigned/team
  moderator. Staff assignment is checked in the database rather than inferred
  from the URL prefix. Owner access remains independent of staff assignment.
- Private progress evidence obeys assignment restrictions in the database.
  A separate public-audience RPC is attempted first; private staff access requires
  verified MFA before a private URL can be issued. Existing routes remain valid.
- Idle expiry is stored by verified provider-session identity independently of
  the web cookie. Cookie loss and refreshed tokens cannot revive that session.
  Signout revokes its application record; another device has its own deadline.
- The shared assistant document extractor validates actual Buffer and MIME-value
  types before inspecting length, supplementing the existing HTTP upload guard.
  CodeQL alert #31 needs a new scanner run; local checks do not close GitHub alerts.
- The inactivity controller observes trusted activity inside the same-origin
  Studio iframe, so inline editing counts as activity too.

## Deployment order — required

1. Establish a usable production backup and a recovery owner first. The hosted API
   review returned no listed backups or physical restore metadata; WAL-G being
   enabled alone does not demonstrate a restore point.
2. Review/apply `202610260003_private_file_authorization.sql` and then
   `202610260004_provider_idle_sessions.sql` through the normal migration workflow.
   Both are forward migrations. Historical migrations are unchanged.
3. Deploy the matching application build only after the RPCs exist. The new
   session guard fails closed when its database operation is unavailable.
4. Run the role, MFA, public-download, idle and explicit reauthentication checks
   against approved disposable accounts. Rerun CodeQL, including alert #31, and
   triage the other open alerts against their data-flow traces.
5. Confirm an Active ruleset targeting main and completed required CI/security
   checks. Confirm Vercel Git/deployment settings through read-only operator access.

No hosted migration, deployment, real-account creation or hosted restore was
performed in this follow-up. Hosted permission inspection was catalog-only and
read-only. Six public Sugi requests consumed ordinary application rate/log counters;
no school content, membership or published document was changed.

## Rollback and limits

The schema additions can remain when reverting presentation code. Do not deploy a
server version that stops checking the persistent session guard while relying on
its stronger logout guarantee. Old code may still have the private-read/MFA gaps;
rolling back security changes is not equivalent to a secure recovery plan.

Guard records are security metadata. Account deletion cascades to them. Do not
remove expired records until provider invalidation/token lifetime makes it safe;
otherwise the same provider credential could establish a new guard record.

A validated citation ID is not proof that generated prose is semantically supported.
The review's local adversarial-output check demonstrated this limitation. Existing
source isolation, disabled tools and output escaping reduce other risks, but no
live poisoned-school-document test or factual-accuracy guarantee is claimed.

Local fixture restoration does not certify managed Auth/Storage recovery, production
RPO/RTO, backup retention or a hosted rollback drill. Hosted catalog inspection is
not a complete live two-school negative access test. The detailed private review
artifacts are supplied separately from this repository.
