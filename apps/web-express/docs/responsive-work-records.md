# Responsive screens and roadmap work records

Calendar cards show the stage, title, estimate and recorded dates in a 122px row
(previously 160px). Completed outcome cards show a short outcome excerpt and a
completion label. Full titles remain in the buttons' accessible labels.

Both use the dedicated native `work-record-dialog`, separate from the full idea
workspace. Calendar selections open a work record; completed outcome selections
open a completion record. The panel provides the current stage, recorded start
and completion, school estimate, latest public update, expandable history and
evidence links. Completed ideas include the school outcome. The original idea
is a disclosure; the discussion is an explicit destination.

The panel appears immediately with the selected page's public snapshot and
refreshes through the existing public `/roadmap/idea/:id` endpoint. Missing
records use a panel skeleton. Request cancellation and timeouts protect against
late responses and indefinite loading. Failures show a retry action; errors do
not leave the previous item's content visible. Escape, close, backdrop clicks,
focus restoration and browser history are supported. `work=<id>` links restore
the record; `item=<id>` continues to select the normal idea workspace.

Only public school updates and evidence use this view. Dates use Asia/Manila;
unknown dates remain unknown, and school estimates do not imply completion.
The idea workspace also labels its current stage and distinguishes earlier
stages. Paused work retains its actual stage and shows a published blocker when
available.

## Responsive layouts

| Area | Refinement |
| --- | --- |
| Profile | Compact hero, wrapping identity and stats, shortcuts to school updates/messages/following, readable activity tab labels, keyboard tab navigation, and retry feedback |
| Profile settings | Button disclosure with synchronized expanded state; removes the fixed height cap; single column below 1100px |
| Roadmap | Compact records, local calendar scrolling, wrapping filters and pagination; dedicated record drawer becomes full width below 600px |
| Staff workspace | Available below 800px with a collapsible workspace menu, compact queue rows, wrapping filters, larger touch targets and local board scrolling |
| Staff login, analytics and staff management | Single column forms and content on smaller screens; tables scroll inside their container |
| Updates and private follow-ups | Single column update layout, wrapping content and flexible form fields |
| Auth callback, saved searches and legal pages | Smaller page gutters, controls sized for touch and mobile text inputs at 16px |
| Shared shell | Wrapping action groups, constrained fields, safe-area footer spacing and visible focus treatment |

The existing navigation skeletons remain specific to the destination. The
profile skeleton includes its new shortcut row. Native navigation and public
data caching are preserved. This UI refinement adds no database migrations or
automatic database polling.

Validation uses the Express build and Eta template compilation. Automated tests
and browser viewport checks were not run. Live deployment appearance remains
to be confirmed after release.
