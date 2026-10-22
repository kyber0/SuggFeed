# Roadmap calendar and Home motion

## Work calendar

The `timeline` roadmap view has two presentations of the same filtered, paged
records: Timeline and Agenda. Phones below 640px default to Agenda; other screens
default to Timeline. An explicit choice is retained during viewport resizing in
that document. Without JavaScript the same responsive defaults remain readable.

Timeline keeps idea identity visible while dates pan horizontally inside the
chart. Rows grow for long titles instead of overlapping; the base row is 68px.
Week/Month/Term change density while preserving the date near the viewport
center. Today centers the recorded current-day marker. Mouse panning excludes
interactive elements; touch scrolling and native keyboard scrolling remain.

Rails represent recorded starts through completion or today, never promised
completion dates. Percentages remain school estimates. Agenda groups the same
records by recorded start month. Missing/out-of-window dates remain separately
explained. Local counts are explicitly records shown on this page, not a claim
that all school history was loaded. Both presentations reuse work-record links,
server reads, evidence access and browser history.
