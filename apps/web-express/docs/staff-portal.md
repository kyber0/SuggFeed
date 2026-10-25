# Staff portal organization

## Navigation and authority

Daily work: Overview (school admins), My work, Review ideas, Work board,
Community, and Safety review (school admins). Management: People & access,
Routing & teams, School settings, Workspace editor, Sugi knowledge and Insights.
Moderators see neither school-wide analytics nor management links. Their form
responses link remains available under the existing server permissions.

The sidebar derives active states from the school-relative pathname. Desktop
navigation supports the existing collapse preference. On mobile the workspace
menu starts closed and expands without overlaying the content. Without JavaScript
the disclosure remains operable. Platform screens and owner-only form responses
do not receive the school staff shell.

No roles, database policies, memberships, workflow stages or publication gates
change. Moderator reads continue through existing assignment-filtered views;
write operations retain server/database authorization and current revision checks.

## Daily work and routing

`/s/{school}/admin/my-work` reuses the existing assignment list RPC. It groups
the current page into acknowledgement, review/safety, and delivery. Counts are
explicitly **on this page**, not school totals. Up to 50 items are shown per page.
Admin-only list views include triage, all open and overdue. An empty stale page
returns to page one with an explanation.

Opening an item never acknowledges ownership. The acknowledgement button is a
separate action; the title remains a working link. Secondary ownership/deadline,
manual reassignment and history controls use disclosures. Deadlines are shown in
Philippine time and missing dates are not invented. Suggestion links carry an
allowlisted My work view/page; closing their detail panel returns to that view.
Safety-report links open the correct submission/comment safety area.

`/admin/routing` contains Teams & availability, Routing rules, Capacity, and
Escalations & settings. It requires school-admin access and does not fetch a
work list. Existing `/admin/assignments` URLs redirect to the relevant canonical
screen with view, page and history identifiers preserved. POST actions remain at
`/admin/assignments/action`. Moderators entering `/admin` land in My work.

Overview keeps the existing analytics and adds exact past-target-date work and
open-report counts from school-scoped sources. A failed count is unavailable,
not zero. Open reports count report records across submissions and comments;
they do not claim to count distinct comments or ideas.

## Delivery views

Board and List use the same paginated stage records, filters, selections and
existing action panel. List removes fixed lane height and supports keyboard Move.
Switching views with selected ideas asks before clearing that selection.

Calendar uses **school target dates**, not actual start/completion dates or SLA
acknowledgement deadlines. It queries the complete selected month independently
of the stage-card pages, with 100 scheduled items per calendar page. Search,
assignment, priority and overdue filters use the same query construction as the
board. Months are bounded to 2000–2100; month input and previous/next links work
without JavaScript. Small screens use an agenda layout. Unscheduled ideas remain
in Board/List; no dates are fabricated. Calendar links open the existing action
panel; there is no direct drag-to-reschedule operation.

Board refresh validates the response before replacing content and refreshes the
calendar alongside its underlying metadata. Failed reads preserve existing
content. Existing receipt/revision handling and group-move review remain intact.

## Communication and safety

Community separates private clarification from delivery reminders and admin-only
duplicate handling. Clarification views are Needs your reply, Waiting for student
and Resolved. Filtering, totals and range recovery are performed on the server;
inactive views fetch counts instead of private message bodies. A successful new
question opens Waiting for student. Resolved questions have no Close action.
Duplicate merging reuses the public-idea pickers and audited existing operation.

Safety review has Submissions, Comments, Urgent alerts and History, with contacts
and safety analytics under Tools. Urgent alerts are the existing account's private
notices, not a claim to list every urgent record. History retains the submission
safety audit; resolved comment decisions remain in the Comments → Resolved tab.
The two moderation state models and their permission boundaries stay separate.
Legacy Community comment/report links redirect to safety review. Comment review
uses the existing service and shared partial; no private text enters public APIs.

## Shared management interface

Members, invitations, joining, settings and staff form responses reuse the staff
shell. People tabs connect members, staff roles, invitations and joining/rosters.
Insights links analytics and form responses; moderators see only authorized form
responses. Platform variants retain their original navigation.

Existing form handlers, publication review, activation checks, draft conflict
handling, delivery states and account protections remain authoritative. The
workspace editor retains its specialized canvas. Sugi keeps its existing data
services and permissions.

`staff-portal.ts` supplies bounded enhancements: local table scrolling, contextual
safety fields and optional Back/Forward scroll restoration. It is idempotent and
stores only scroll positions under school-scoped keys, not form drafts or private
content. Existing global interaction feedback handles request/navigation loading.
Shared tokens and reduced-motion behavior are reused; there are no new dependencies.

## Delivery checks and limits

Type checking, production compilation, assignment/moderation lint and all Eta
compile checks were performed. Synthetic design inspection covered daily work,
review, board/list/calendar, community, comment/submission safety, people, joining,
settings, invitations, roles, analytics, form responses and Sugi at narrow and
wide widths. The fixture used invented content without hosted workflow writes.

No automated tests were added or run. Real-device keyboards, live role changes,
concurrent writes, email delivery and the final hosted deployment remain
unverified. No database migration or environment change is required for this
portal release. Existing permissions, moderation audit records and legal review
gates must remain enabled during rollout.
