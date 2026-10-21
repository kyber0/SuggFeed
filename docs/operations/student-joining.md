# Student joining: approved email lists and access requests

School administrators open **School settings → Student joining & requests**. The platform directory also links to this page for operators who hold an active school-admin membership. Both options default to off for existing schools.

## Approved email list

1. Open **Manage approved email list**.
2. Import a one-column CSV/text file or paste full emails, one per line. An optional `Email`, `Email address` or `email_address` heading, UTF-8 BOM and quoted CSV values are accepted. Other columns are rejected. Limit: 1,000 unique email addresses and a 260 KB import file.
3. Review and save the complete list; saving replaces the existing roster.
4. Enable **Let approved emails join instantly** on Student joining.
5. A student signs in with that exact confirmed email, sees the school under **Your schools**, reads its notices and selects **Agree and join school**. No separate invitation or admin approval is needed. A GET/sign-in does not create memberships silently.

Gmail and other personal addresses work through exact email matching. This does not register or verify ownership of their email provider's domain. Verified school-domain joining remains independent.

The existing **Require an enrollment roster** rule is separate. When enabled, it pauses access for students absent from the roster, including invited and manually approved students. When disabled, the roster can still authorize instant joining without becoming an ongoing eligibility requirement for all memberships. Staff roles are unaffected.

## Access requests and bulk review

Enable **Let students request access** to make the active school discoverable by name to signed-in users with confirmed emails. Students read the school's notices, explicitly request access and share their verified email with its admins. They see their request status under **Your schools**.

Admins review pending requests on Student joining, select one or up to 50, enter a real eligibility/rejection reference and choose approve or decline. Approval creates student membership only. Every selected request must belong to this school, remain pending, retain its current verified email and satisfy any required enrollment roster. Existing revoked memberships and staff roles cannot be replaced through this flow. Stale or invalid selections roll back the entire batch; after an uncertain network result, reload the queue before retrying.

Turning requests off stops new requests while retaining pending requests for review. Rejected applicants should contact the school for an invitation or other assistance; this version does not repeatedly reopen reviewed requests. An account can have five pending requests and submit at most 20 new requests per day. Lists/search results and the account's recent request history are limited to 20 entries per response; admins page through pending queues 50 at a time.

## Controls and rollout

Apply `202610210004_school_student_joining.sql` before deploying the app. It adds opt-in flags to existing enrollment rules, a private request table, and server-only RPCs. RLS and revoked direct grants protect requests; all RPCs recheck current actor/school authority. Existing MFA, same-origin browser-write protection, active-school, policy-review and isolation gates remain in force. School row locks serialize settings, roster replacement, joining and reviews. Joining never promotes staff or restores revoked memberships. Audit events record settings, requests, reviews and membership creation.

Roster imports stage text in the browser; they do not upload a file or send invitations. No invitation/approval email is sent by these flows; students check their request status in Your schools. Existing accounts, memberships and rosters are preserved during migration, and existing opt-in settings remain unchanged until an admin saves them.

Type checking, production build and local layout inspection cover the new views. Automated tests and hosted membership-changing actions have not been run. Hosted catalog checks establish migration/function grants, not end-to-end authorization or delivery verification.
