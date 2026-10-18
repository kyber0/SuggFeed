# Empty-state inventory

The shared Eta partial (`views/partials/empty-state.eta`), browser renderer
(`src/client/empty-state.ts`) and global `empty-states.css` provide matching
icons, headings, readable copy and responsive actions. Existing feed, home,
profile, comment and roadmap markup keeps its IDs and receives the shared
visual treatment. Loading and failed requests remain separate from empty results.

## Coverage

| Area | Empty conditions | Next step |
| --- | --- | --- |
| Schools | Signed out, no memberships, no applications | Sign in / create account; invitation guidance; application availability |
| Platform | No schools, filtered schools, no applications, no policies | Clear filters; review applications; directory |
| Invitations | No invitations, activation unavailable | Use invitation form when ready; explain activation requirement |
| Home | No published ideas; client filters hide all cards | Share an idea; clear filters |
| Feed | Initial, search/category, following, paged results | Share; reset filters; roadmap; first-page navigation |
| Roadmap | Empty stage, stage page exhausted, tree, completed outcomes, work calendar | Stage-specific explanation; clear filters; first stage page |
| Work detail | No public work history/evidence | Explain when published updates become available |
| Profile | No submissions, bookmarks, shares or support; public rows absent but later activity exists | Share / explore ideas; retain continuation only when a cursor exists |
| School updates | Signed out, no notification entries | Sign in; find ideas to follow |
| Private inbox | Signed out, no clarification requests, no report history | Sign in or tracking code; explain private replies and reporting |
| Idea detail / drawer | No comments, public history, merged ideas | Composer guidance; explain recorded changes and merges |
| Saved searches | No saved views | Explain the existing save-current-search control |
| Submission recovery | No queued ideas | Explain device queue vs successfully submitted records |
| Review queue | Initial, pending queue clear, filtered results | View all submissions; adjust filters |
| Work board | Empty stage, page changed | Stage explanation; refresh guidance |
| Staff review | No internal notes, review history, progress updates | Existing note/update forms; explain visibility |
| Community care | No reminders, reports, clarification requests; last row removed | Quiet-queue explanation; existing clarification form |
| Staff access | No roster, filtered roster, initial student search, no matching students | Invitations; reset staff filters; revise student search |
| Analytics | No chart samples, pipeline, categories or table rows | Date-range guidance; valid spanning table cell |
| Saved staff views | No personal saved filters | Existing compact sidebar hint explains saving a view |

## Intentionally inline or absent

- Picker selection/search status remains next to its input, rather than adding a
  large panel inside a form. Loading and lookup failure text is preserved.
- No similar public idea matches hides optional recommendations so drafting can
  continue. No attachments hides optional evidence controls; it is not a missing page.
- Zero-valued analytics rows remain valid data. They are not removed to create
  an empty-state card.
- Missing legal configuration, invitations that cannot be accepted, auth failures
  and 403/404/500 pages retain their distinct recovery/error semantics. Existing
  designed invitation status cards remain; error-page typography is aligned and
  recovery links use role-aware `/account/home`.
- Hidden legacy desktop-only notices stay hidden; no new device restrictions.

## Review evidence (18 October 2026)

Production build and TypeScript checks passed. Local fixture pages were rendered
at 390 and 1440px (18 routes at each size), with additional 320px review of school
onboarding, profile activity, roadmap, staff and platform screens. No document
horizontal overflow was observed in those previews. The work board intentionally
scrolls within its own lane region. Reviewed light/dark school welcome, profile
activity and platform icons visually; verified the inline sign-in action opens the
auth dialog, all activity tabs show their distinct state, and reviewed pages
reported no browser exceptions. Fixtures never used hosted records.

Automated test suites were not run for this UI change. The existing VM harnesses
were updated to load the new shared browser renderer. Authenticated production
states and real invitation delivery were not exercised as part of this change.
