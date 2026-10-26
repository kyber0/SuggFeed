# Work board delivery improvements

## Screens and navigation

Work has three presentations: Tasks, Board and Calendar. List is removed from the shared selector, staff preview variants and CSS. Old `/admin/work?presentation=list` and `/admin/board?presentation=list` links redirect to Board, preserving string filters, page parameters and idea IDs.

Review ideas and Safety review retain their existing separate decisions and access rules. Board contains approved delivery work only.

## Functionality

- Search and ownership stay visible; ordering/page size and priority/overdue options use disclosures. Removable filter chips describe the active scope.
- School admins can select all school work, direct ownership, their own teams, or no individual owner. Moderators see only their existing authorized direct/team work, with additional filters narrowing that set.
- Filters refresh in place. Current cards and selection survive failed requests; changed filters clear selection only after a successful response, including retries. Board/Calendar links preserve compatible delivery filters and warn before discarding a selection.
- Refresh keeps each lane's scroll offset. Lane headings and pagination are outside the independently scrolling card regions. Mobile shows one selected stage with counts and supports Move without dragging.
- Cards show target dates, overdue wording, blocked state and progress where available. Date-only values use Philippine school dates and UTC formatting without local-time shifts.
- The selection toolbar offers destinations supported by every selected card. Existing stacked dragging and per-idea review remain. A single selected card also works after paging it out of the loaded set. Blocked work cannot offer completion through Move.
- Server-confirmed saves refresh cards/counts; failures preserve the prior display. Closing a refreshed detail restores focus to its replacement card or a visible heading and restores page scroll.
- Administrators click a card's owner to change its named owner with a required reason. The existing team is preserved. The existing assignment endpoint enforces current school-admin permission, eligibility, urgent restrictions, assignment version conflicts and audit history. Completed cards do not offer reassignment. Errors retain the entered reason; a confirmed save cannot be resubmitted from that panel.
- Initial read failures show a retry destination with current filters. Draft progress, review, evidence, duplicate-save and safety checks remain in the existing workflow services.

## Database and rollout

Apply `supabase/migrations/202610260001_staff_work_board.sql` and `202610260002_staff_work_team_metadata.sql` in order before deploying the updated app. It adds the read-only `staff_work_queue` view, using the existing safety-filtered queue and joining workflow/team metadata by school and idea ID. The view is restricted to service-role SELECT. A service-only security-definer helper reads team names/membership without granting the service role direct access to the private assignment tables. The server wrapper always adds school scope and, for moderators, the existing `assignment_staff_ids` restriction. Team filtering separately matches `team_staff_ids`; an administrator's broad read permission does not imply membership in every team.

Both migrations were applied to the configured Supabase project. No school, idea, membership or assignment records were changed during implementation.

## Evidence and limits

- The new view was read successfully under the database service role.
- Full type checking and production build passed on Node 24; deployment targets Node 22.
- Existing board mock expectations were updated for the read source and canonical route; no test suite was run or added.
- All 104 Eta templates compiled. Local synthetic layouts at 320, 375, 768 and 1440 px had no document horizontal overflow.
- Synthetic browser inspection covered incompatible group destinations, a single selected move, failed/successful filtering, and a mocked reassignment conflict retaining the reason. No browser exceptions were observed in that isolated inspection.
- Hosted assignment saves, real-device dragging and keyboard behavior, deployment and performance profiling remain unverified. The server remains authoritative when an older card snapshot offers a move that is no longer valid.

## Maximize and progressive loading

The board's Maximize/Restore toggle expands the application workspace without requesting browser fullscreen. It hides surrounding navigation, collapses filters behind Show filters, and fits lane height to the available viewport. Escape restores the workspace unless a drag, dialog or custom control handles it first. Selection and lane nodes remain in the same document; progress and assignment dialogs continue to use their normal safeguards. Normal workspace scroll is restored on exit. No preference is stored across separate documents.

Each lane has an independently observed Load more link. Near the bottom, the client requests `lazyStage` for that authorized delivery stage only. The server grows that lane's requested window by the configured page size, up to 72 cards, and returns a rendered lane plus fresh metadata. Existing rows in that window are refreshed too, keeping status/version snapshots coherent. Full refreshes preserve requested window sizes and lane scroll offsets. Requests serialize to avoid racing updates; a failed lane keeps its current cards and offers retry without repeatedly requesting on its own. Dragging, open dialogs and background tabs pause automatic loading.

The 72-card cap bounds DOM size and server range queries. Pagination continues beyond that window; without JavaScript, Load more follows its ordinary next-page URL. No dependency or migration is needed for this increment.

Local synthetic inspection confirmed maximize/restore, Show filters, Escape, selection preservation, one-column lazy requests, and retention of 12 loaded cards after refresh. No browser exceptions or document horizontal overflow were observed at 320, 375, 768 and 1440 px. Build/type checks and template compilation were used; no test suite, hosted write or physical-device check was run.
