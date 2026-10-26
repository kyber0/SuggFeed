# Unified staff Work workspace

The school-admin Overview keeps operational attention cards and management links. Its analytics section, analytics request and analytics script have been removed. Dedicated school Insights and super-admin analytics remain available.

## Navigation

- `/s/:school/admin/work` opens Tasks: individual/team assignments, acknowledgement, assigned reviews and delivery follow-through.
- `?presentation=board` or `calendar` opens approved delivery ideas in the same Work destination.
- One sidebar entry and one shared presentation selector replace separate My work and Work board destinations.
- `/admin/my-work` and `/admin/assignments` redirect to Tasks, retaining task view, pagination and history identifiers. Configuration links still redirect to Routing & teams.
- `/admin/board` redirects to Work with a delivery presentation and retains filters, lane pages and deep-linked ideas.
- Review ideas and admin-only Safety review remain separate decision tools. Closing an idea opened from Tasks returns to the originating task scope and page.

## Scope and interaction

Existing service/database permissions are unchanged. Moderators retain their assigned/team access; school-wide task filters and routing configuration remain administrator-only. Task “My & team items” and delivery “Assigned directly to me” intentionally describe different existing queries. Task overdue uses assignment deadlines; delivery overdue uses school target dates.

The header and delivery filters use ordinary GET links/forms. Existing board refresh, drag/group review, progress forms, acknowledgements, conflict handling and database APIs are retained. Availability and ownership details are progressively disclosed. Tasks have separated cards, short page-count summaries and responsive presentation controls. Studio previews render the same shared Work header.

The original unified navigation required no migration. Subsequent delivery improvements use the read-only view described in [work-board-delivery.md](work-board-delivery.md). Legacy List links now redirect to Board.

## Checks and limits

- Full Express type checking passed.
- Assignment lint passed.
- Production build passed on the environment's Node 24 runtime (deployment targets Node 22).
- All 103 Eta templates compiled.
- Synthetic local layouts inspected for Tasks, Board, List, Calendar, Overview and moderator Tasks at 320, 375, 768 and 1440 px. No document horizontal overflow observed.
- No test suites, production writes, physical-device checks or hosted deployment verification performed.
