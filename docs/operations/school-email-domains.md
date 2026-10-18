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
