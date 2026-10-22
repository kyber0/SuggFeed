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

## Home motion

`partials/home-story.eta` retains the three guidance steps in a self-contained
explainer. The existing optional-guidance visibility setting still controls it.
The `home-motion.ts` factory is registered in the existing `SfMotion` controller;
it introduces no library. Previous/next and chapter buttons turn guidance pages
in 600ms with transform/opacity only. Controls remain stationary and focused.
Rapid requests cancel the previous turn and settle at the latest requested step.
There is no autoplay, navigation interception or animation of submission inputs.

Below 768px and with reduced motion, all steps are presented as static content.
With JavaScript unavailable, desktop guidance can be scrolled horizontally using
native scrolling/keyboard focus; phone guidance is stacked. Desktop geometry is
reserved before enhancement to avoid initialization shift. Save-Data and studio
edit mode use the static presentation. Preview mode can demonstrate the effect.
A small fine-pointer illustration offset is clamped to the existing 4px token;
it resets on scrolling, focus, pointer exit and interruption.

The shared headline reveal now adds a bounded vertical entrance. Share/Track
panels fade without moving inputs, and newly reintroduced filtered cards fade
with bounded staggering. Sorting no longer forces synchronous layout to restart
card entrances. Existing vote/undo and submission behavior remain unchanged.

`mount`, `destroy`, media-query changes and back/forward-cache suspension use the
existing animation lifecycle. The Home factory cancels animations and frames,
disconnects its observer, aborts listeners and restores readable guidance.

## Checks performed

- Express type checking, focused animation lint and production build passed.
- Local synthetic fixtures: Home and calendar at 320, 375, 768 and 1440px, no
  document overflow or JavaScript errors observed. No hosted records were changed.
- Calendar: Timeline/Agenda defaults, scale, Today and record opening inspected;
  long-title rows measured approximately 77px, versus the prior 160px baseline.
- Home: next/previous, rapid reversal, repeated mounting, teardown, Share/Track,
  live reduced-motion change, no-JavaScript readability, edit-mode exclusion and
  back/forward-cache lifecycle events inspected in local Chromium.
- A local layout-shift observer initially caught enhancement shift. After reserving
  geometry, a repeat Home load recorded no layout-shift entries. This is a local
  observation, not an equivalent Lighthouse benchmark or guarantee across devices.

No automated test suite, five-run Lighthouse comparison, real-device Safari/
Android, live deployment, actual email or authenticated production flows were
checked. Full editor integration, 200% system zoom, all school palettes and touch
hardware still need device review. Desktop 3D rendering varies by browser; the
static fallback remains available.

## Home polish follow-up

The guide now includes layered, school-palette illustrations, a transform-driven
chapter progress line and a visible active-chapter underline. Incoming step text
settles in a bounded stagger within the 600ms page turn. Less extreme rotation
keeps the incoming text legible; the fold shade reverses with navigation.
Arrow Left/Right, Home and End work when focus is inside the enhanced guide.
They do not intercept keys from form controls or modified keyboard shortcuts.
All new animations remain owned by the same lifecycle and stop offscreen or on
interruption. Mobile and reduced-motion static guidance remains intact.

Follow-up checks: type checking, focused animation lint and production build
passed. Local Chromium inspection repeated at 320, 375, 768 and 1440px: no page
overflow or JavaScript errors observed; no layout-shift entries on the measured
load. Repeated mounting, rapid reversal, reduced motion, no-JavaScript guidance,
studio edit exclusion and simulated cache suspension remained usable. Keyboard
chapter navigation was inspected separately. Real-device and live deployment
checks remain outstanding; no new dependency or backend change was introduced.
