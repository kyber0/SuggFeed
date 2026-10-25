# School staff workflow · October 25, 2026

## Destinations

- `/s/{school}/admin`: school-admin Overview, attention totals, personal review/delivery links, analytics and management. Moderators enter Review ideas instead. Overview no longer loads the whole queue and its editor.
- `/s/{school}/admin/reviews`: Awaiting review, Declined and Decision history. New decisions use a dedicated review drawer. Approve/decline use the existing guided workflow and audit; clarification uses the existing private Community flow. Decision history includes previously approved ideas, whose direct links open Work board.
- `/s/{school}/admin/board`: approved/planned, in-progress and completed work. Work detail has summary, updates/evidence, internal notes and history. Intake approval/decline actions are excluded from this interface. Server workflow authorization remains authoritative.
- Community, Safety review, People & access and School settings preserve existing permissions. People/settings links are grouped. Saved views remain private and are routed to their relevant destination.

## Handoff and recovery

A confirmed approval shows “Approved · Added to Planned” and actions to review another idea or open its Work detail. Never optimistically remove a submission before confirmation. The existing request IDs, concurrent-edit handling, validation, private/public visibility, evidence processing and partial group-save semantics remain in use. This change creates no new statuses, deletes no data and changes no role privileges or activation gates.

Old `/admin?...` queue links route through `/admin/reviews`. Delivery filters and approved idea links resolve to Work board, retaining search, assignment, priority and overdue filters. `/admin#review-workspace` resolves to the new queue when JavaScript is available. Fresh school-scoped status determines a direct idea's destination. Detail URLs retain list filters and are restored on close; the underlying list is not rebuilt merely to close a panel. A stale tab whose idea changes status keeps the current record readable, with unavailable actions removed by fresh workflow context.

Work board now supports assignment/priority/overdue filters. Mine is resolved from the authenticated school scope, never from a supplied actor ID. Mobile offers a single-stage selector; without JavaScript all stages remain available. Move menus remain the keyboard/touch alternative to dragging. Desktop retains its board; review uses a side drawer and mobile uses a full-height detail panel.

## Implementation

Review and work have separate template entry points around shared detail fields and request controllers. This avoids duplicating security-sensitive save, upload, retry and group-move logic. The controller's server-rendered detail mode filters presentation; it is not an authorization boundary. Existing APIs and database workflow checks still decide what can be saved.

## Checks and remaining checks

Production build and TypeScript compilation, modified Eta template compilation, whitespace checks and the staged secret scan are required for this release. No automated tests or browser/device checks were requested or run for this task. A real-device pass should cover narrow screens and keyboard opening, review handoff, stale edits, group moves, history/back navigation, evidence upload and failed-request recovery. Published overview statistics depend on the existing analytics service; its error fallback remains usable.
