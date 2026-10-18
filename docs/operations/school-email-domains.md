# Student joining by school email

## Administrator setup

1. Open **School settings → Email domains** as a school administrator with MFA.
2. Add the exact student mailbox domain, for example `my.cspc.edu.ph`.
3. Ask the domain's DNS administrator to publish the displayed **TXT** host and value. This is a new verification record; leave MX, SPF and DKIM unchanged. If the DNS provider appends its zone automatically, enter only the host portion within that zone.
4. After DNS propagation, choose **Verify DNS**.
5. Choose **Enable student joining**. The school must be active with its current policies reviewed. The service isolation release gate must also be verified for students to join.

Keep the TXT record published. DNS proof is checked when verifying, enabling, and joining. DNS lookup failure stops the join; an invitation remains the fallback. Disable joining or remove the domain to stop new joins; existing memberships remain unchanged.

Only one school can verify an exact domain. Pending domain requests do not reserve it globally. Different mailbox subdomains can belong to different schools. Personal mailbox providers, including Gmail, cannot be used for domain joining.

## Student flow

Sign in with a confirmed school email, open **Your schools**, review the matched school's privacy notice and terms, then choose **Join your school**. The server rechecks the confirmed account email, exact domain, DNS proof, school readiness and membership before creating student access. No school search or typed email claim grants membership.

Only student access can be created through this flow. Existing staff roles are preserved, revoked memberships cannot be restored this way, and platform operator accounts stay in platform administration. Staff and personal email accounts continue using invitations.

## Deployment

Apply `202610180002_school_email_domains.sql` before deploying the app. The domain registry has RLS and no anonymous/authenticated privileges. The service role can read registrations; only the narrowly scoped service RPCs can change them or enroll students. Domain changes and new memberships are recorded in school registry events.

No school domain is pre-verified or enabled by this migration. CSPC requires its own DNS ownership proof; its mailbox suffix alone is not verification.

## Optional enrollment roster

Open **School settings → Student enrollment**. The default **School email or invitation** rule preserves existing behavior. To restrict students to current enrollment:

1. Copy the approved email column from the school's enrollment list, one address per line (no heading or other columns).
2. Paste the complete list, up to 1,000 unique emails. Addresses are normalized to lowercase; blank lines and duplicates are ignored.
3. Select **Require a match on the enrollment roster**, review the impact, check the confirmation, and save.

Every save replaces the complete roster atomically. Invalid lists change nothing; stale versions are rejected. An empty roster in required mode pauses all students. Missing students see a paused-access explanation; matching nonmembers can join through the existing verified-domain flow. Adding an address to a roster does not itself create an account or membership. Invitations cannot bypass required roster eligibility, including for personal email addresses.

Eligibility is checked against the account's confirmed email in `auth.users`, not a browser-supplied address or stale session email. School routes, shared database membership/role checks, joining, invitations and account navigation honor the rule. Staff roles are exempt. A membership's explicit revoked status remains authoritative after an email returns to the roster. Existing submissions, accounts and memberships are retained.

Only MFA-authenticated school administrators can read or replace their own school's roster. The new tables have RLS and no app-role direct privileges; service RPCs authorize the actor and school. Audit records contain version, mode and counts, not the address list. The school must keep this roster current; there is no enrollment-provider synchronization. SSO integration remains deferred.

Apply `202610180003_school_enrollment_rosters.sql` before deploying the roster UI. No existing school is switched to roster mode during deployment. The first release supports 1,000 unique emails per school; use paged roster administration before increasing this limit.
