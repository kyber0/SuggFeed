# School-admin overview and platform editor access

## School overview

Administrators opening their school dashboard see **Overview** first. Queue links and existing filter URLs continue to open the review queue; moderators keep the review queue as their default.

The overview reuses the existing tenant-scoped analytics summary with 7-, 30- and 90-day periods:

- Ideas received in the period, with a comparison only when the previous equal period contains records.
- Current support votes on those ideas; these are not votes cast during the period.
- Completed ideas among the ideas received during the period; this is not a count of status transitions during the period.
- Current awaiting-review count across the school.
- Daily idea/support chart with mouse exploration, a native touch/keyboard range control and a daily-values table.
- Current workflow counts across all school ideas, linking to their queue or work-board lane.
- Top categories by idea volume, linking to filtered detailed analytics.

Period analytics retain the existing limit of the latest 2,000 available records. The page states this limit; current workflow counts are independently queried school totals. An analytics-query failure displays a retry state while leaving queue access available. No new database storage, tracking, chart dependency or polling is introduced.

Motion uses transform and opacity, runs once when the overview first opens, and respects reduced-motion preferences. Charts and exact-value tables remain readable if JavaScript fails.

## Platform editor-access tab

**Super-admin dashboard → Editor access** contains the existing rollout controls, grant history and submission-form review controls. School rows expand individually. MFA and platform authority checks and the existing protected RPCs remain in place.

`/platform/customization` redirects to `/platform/schools?editorPage=…#editor-access`. Saved grants/reviews and editor pagination return to this tab. Its separate header-navigation link has been removed.

## Checks and limitations

Typechecking and the production build were run. Synthetic local views were inspected at 320, 375, 768 and 1440 px, including populated/empty overview and editor access. No automated suites, real-device checks or live permission changes were run. Period charts are submission cohorts, not an event history for votes or completions.
