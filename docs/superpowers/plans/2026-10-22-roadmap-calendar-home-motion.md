# Roadmap Calendar and Home Motion Implementation Plan

> Execute natively in this session after the user reviews the plan. Do not delegate without explicit authorization. Use the executing-plans workflow and complete each task before starting the next.

**Goal:** Make the roadmap Work calendar compact and readable on desktop/mobile, and give Home a coordinated, visible motion experience.

**Architecture:** Preserve Express/Eta rendering and the existing calendar data model. Extend the shared `SfMotion` lifecycle with one Home-specific effect, reusing native Web Animations, observers and current configuration. Keep calendar presentation and home motion as independently releasable changes.

**Tech stack:** Express, Eta, TypeScript classic browser scripts, modular CSS, existing Lenis and native animation APIs. No new packages.

**Spec:** The user's request to improve the roadmap calendar UI and add home motion animations, including the clarification that visible motion is intended and the uploaded GoShuin screen recording as a motion reference. The design and acceptance criteria below are the implementation specification.

## Constraints

- Keep school themes, permissions, publication rules, school-specific paths and existing content.
- Preserve recorded-date semantics, Asia/Manila formatting, estimated-date qualifications, paging and filter URLs.
- Avoid additional fixed headers and oversized banners.
- Only transform and opacity are animated; geometry changes are immediate layout operations.
- Existing controls remain immediately usable; no preloader or delayed navigation.
- Honor reduced motion, touch, keyboard, hidden documents, browser history and editor mode.
- No database changes, fabricated deadlines, new animation library, or unrelated refactoring.
- Do not add or run automated tests unless requested. Verification tasks below describe manual UI inspection, type checking and builds; broader tests remain a separate request.

## Discovery

### Work calendar

- `views/roadmap.eta` renders `view=timeline` as a horizontal work-duration calendar.
- `src/lib/roadmap.ts:buildWorkTimeline` supplies dated rows, undated records, month geometry and today's position.
- Current styles use 160px rows, 70px month headings, a chart at least 1040px wide and absolute-positioned idea cards.
- Each card sits near its start date; this mixes the reading target with time geometry and makes narrow-screen browsing difficult.
- `src/client/roadmap.ts` owns scale, pan and Today controls; `roadmap-timeline.ts` owns the work-record dialog and history/deep links.
- The calendar is paged: it does not represent every school record simultaneously. The redesign must keep this clear.

### Home motion

- Home already uses shared word splitting, reveals and magnetic primary actions.
- `home.ts` also owns prompt typing, tab-glider positioning, filter/sort animation delays, voting effects and a hero pointer handler that reads layout on pointer movement.
- `pages.css` includes perpetual decorative orb loops and panel animations. The shared reveal system can cancel competing entrances, but animation ownership needs to be explicit.
- Shared configuration, cancellation, editor exclusion, hidden-document pause and reduced-motion handling already exist under `src/client/animations/`.

## Design A — Work calendar

### Desktop and tablet

1. Use one compact, naturally scrolling toolbar: title, scale selector, Earlier/Later and Today. Put the longer explanation under an accessible “About these dates” disclosure.
2. Target a 40–44px month ruler and 56–68px rows, with titles allowed to wrap when necessary. Avoid fixed heights that clip long names or enlarged text.
3. Separate identity from time: a compact idea-label column shows title and status; the aligned timeline shows the duration rail and short date/progress information.
4. Keep the label column visible during horizontal chart panning. Only the chart container may scroll sideways; the document must remain within the viewport.
5. Use existing stage colors plus text labels for In progress, Paused and Completed. A small legend explains the rails; do not rely on color alone.
6. Keep Today visually distinct without a large badge covering row content. Preserve one-day and zero-length records with a minimum visible marker and an accurate accessible date label.
7. Clicking a title or duration opens the existing work-record panel. Preserve `?work=...`, Escape, focus restoration and the working full-idea link.
8. Zoom changes calendar density and preserves the viewed date near the center. Earlier/Later pan the available window; they must not imply loading dates or records that were not fetched.
9. Keep page/filter context visible: use “shown on this page” for local counts. No full-school totals inferred from the loaded sample.

### Phone layout

- Default to an Agenda presentation below 640px: compact stacked items, grouped by recorded start month, using the same dated records and truthful start/end labels.
- Provide a small Timeline/Agenda choice for users who need the alternate presentation. Both remain within the existing Work calendar view; existing filters and `work` links survive.
- Timeline retains a bounded horizontal region and real touch scrolling. Do not map vertical wheel events to horizontal movement or capture touch scrolling over card buttons.
- Agenda remains usable without JavaScript; CSS and server-rendered content supply the responsive default. Hide the inactive representation from focus and assistive technology.
- Touch controls are at least 44px. Body text stays readable at 14px or above; metadata may be secondary, but must not depend on hover to be read.

### Empty and uncertain records

- Empty calendar: one restrained explanation and working Clear filters action when applicable.
- Keep records without verified start dates separate under “Dates not recorded,” with their existing reason. Do not position them as planned commitments.
- Distinguish missing dates from dates outside the displayed window, preserving the model's actual reasons.
- Failed work-record loading keeps Retry and a clear destination. No endless loading animation.

## Design B — Home motion, revised from the video

### What the recording shows

Reviewed the 36.5-second recording extracted from `Screen Recording 2026-10-22 081404.zip`, including sequential transition frames.

- The main reference is GoShuin's book-like presentation: content pages turn around a vertical spine, with perspective, an apparent reverse face and a moving fold/shading layer.
- The outside header/frame stays steady while the inner content changes.
- Previous/Next controls drive the observed page changes. This is not evidence that the reference uses scroll-driven page turning.
- Supporting details include a small page-position indicator, restrained content entrances, illustrated accents and chart transitions near the end.
- The recording shows the visual result; it does not establish which libraries or rendering technology the site uses.

### Primary adaptation: a compact “how it works” story card

This becomes the signature Home motion effect, rather than making generic fades the main deliverable.

- Progressively enhance the existing three Home guidance points into a compact three-step story: choose a topic; submit anonymously or with an account; keep the code to track updates.
- Keep the existing guidance text and meaning. Add lightweight, brand-colored SVG symbols and decorative sheet layers; no fictional live idea, approval promise, or simulated submission.
- On wide screens, Previous/Next and step buttons produce a directional page-turn with perspective. Target 500–650ms; combine `rotateY`, translation and opacity, with two pre-styled faces and a shading layer whose opacity changes.
- The effect stays inside this noninteractive explainer. Do not rotate the whole page, copy a real form into an animated snapshot, or delay a real navigation/request.
- The frame and controls stay stationary. Real Share feedback and Browse ideas actions remain visible and usable outside the turning surface.
- Reserve the tallest chapter's space before motion starts. Shorten the copy presentation instead of adding a large fixed-height hero, extra banner or full-screen book.
- Use SuggFeed/school tokens and shared typography. Do not reproduce GoShuin's paper texture, Japanese illustrations, serif typography, green theme or navigation shell.
- Keep the existing customization section identity and visibility control for the Home guidance area; hiding it must remove its motion and leave the rest of Home intact.

### Responsive and accessible behavior

- On phones, the same guidance becomes compact stacked steps by default, without perspective or a forced swipe carousel.
- If a narrow-screen step transition is retained after inspection, use only a 200ms opacity/6px translation effect; native vertical scrolling must remain unchanged.
- Reduced motion: show the steps plainly, without page turns. No-JavaScript or unsupported animation APIs: all guidance remains visible.
- Label Previous/Next and chapter choices, expose the active chapter, announce user-requested changes politely and keep focus on the activated control. Inactive animated faces are inert and hidden from assistive technology; decorative layers are always aria-hidden.
- Do not autoplay, trap wheel events, pin the Home page or require a completed animation before an app action.
- Rapid requests cancel/replace the current transition and settle on the latest requested chapter. Resize, theme changes, hidden documents and teardown leave a readable stable state with no stranded overlay.

### Supporting motion

| Area | Motion | Bounds and fallback |
| --- | --- | --- |
| Story chapters | Localized directional sheet/page turn inspired by the video | 500–650ms on wide screens; static guidance on phones/reduced motion; stable frame and controls |
| Hero arrival | Badge, existing word headline, subtitle and actions enter in one sequence | Whole sequence <=720ms; shared word/reveal effects own text and controls, so no duplicate entrance on the same node |
| Hero atmosphere | Decorative layers settle into place, then respond gently to the mouse | Transform only, maximum 4px; fine pointer only; input-driven animation frames; no perpetual idle loop |
| Section entrances | Action hub, guidance and idea groups enter as they approach the viewport | 320–400ms; 12px desktop/6px mobile; bounded 40ms stagger, maximum extra delay 160ms |
| Share/Track tabs | Glider movement and a brief incoming-panel fade/slide | 200–240ms; ARIA state updates immediately; no height animation or outgoing panel covering active controls |
| Category/filter changes | Newly displayed cards enter as a bounded group | Existing cards do not replay on hover; sorting does not double-run generic reveals; preserve focus, selected filters and counts |
| Card interaction | Subtle lift and press feedback | At most 2px hover movement; separate ownership from the reveal transform, no 3D tilt or moving click target |
| Vote/undo feedback | Press feedback, then a short confirmation pulse after success | 200ms; no success animation before server confirmation; failure/timeout and current undo behavior remain authoritative |

### Motion ownership and accessibility

- Add `animations/home-motion.ts` only for Home-specific choreography, the localized story page turn, decorative motion and panel coordination. Keep generic reveal, split-text and magnetic behavior in their existing factories.
- Use shared configuration for any new durations/distances. Remove or replace the superseded hero pointer listener, perpetual orb loops and per-card manual animation delays.
- Observe visibility once; use one pending frame for pointer work and cache geometry until resize/scroll invalidation. No forced layout per pointer event.
- Cancel entrances on focus, input or drag using the current controller behavior. Restore transforms when interrupted; content must remain readable if JavaScript fails.
- Reduced motion: no orb movement, magnetic attraction, typewriter loop or sliding entrances. State changes remain immediate; optional opacity feedback stays short.
- Stop work offscreen or in a hidden document. Cleanup through the shared lifetime on teardown and reinitialize without duplicate listeners.
- No Home motion in studio edit mode. Preview mode can demonstrate it through the existing controller, without enabling real submissions or votes.

## Files and responsibilities

| File | Planned changes |
| --- | --- |
| `apps/web-express/views/roadmap.eta` | Compact toolbar, date explanation, identity/rail rows, responsive agenda and accurate counts |
| `apps/web-express/src/lib/roadmap.ts` | Only add presentation fields needed to reuse recorded dates/grouping; preserve chronology and eligibility logic |
| `apps/web-express/src/client/roadmap.ts` | Calendar presentation choice, scale anchoring and safe panning; preserve voting/filter handling |
| `apps/web-express/src/client/roadmap-timeline.ts` | Only adapt shared record triggers if markup requires it; retain dialog/history behavior |
| `apps/web-express/public/css/modules/roadmap.css` | Compact calendar, agenda, label column, responsive controls and state styles |
| `apps/web-express/views/home.eta` | Motion hooks and integrate the progressively enhanced existing guidance area |
| `apps/web-express/views/partials/home-story.eta` (new) | Existing three guidance points, decorative sheet layers, accessible chapter controls and static fallback |
| `apps/web-express/src/client/animations/home-motion.ts` (new) | Story state and directional transforms, geometry/visibility handling and Home-specific lifecycle-managed motion |
| `apps/web-express/src/client/animations/config.ts` | Centralized additional motion values where current tokens are insufficient |
| `apps/web-express/src/client/home.ts` | Remove overlapping motion logic, coordinate tabs/filters with shared effects, preserve all actions |
| `apps/web-express/public/css/modules/pages.css` and `animations.css` | Replace conflicting entrances/idle loops and define stable motion layers |
| `apps/web-express/scripts/build-animations.cjs` | Include the new factory before controller initialization |
| Shared layout/view asset references and generated assets | Regenerate relevant outputs and update only affected cache versions |
| `docs/operations/roadmap-calendar-home-motion.md` (new) | Interaction behavior, dates, motion controls and limitations |

## Implementation sequence

### Task 1 — Calendar structure

- [x] Inspect current desktop, phone, dark-mode and empty calendar fixtures; record the current layout and scroll ownership.
- [x] Refactor the calendar into compact identity/rail rows, keeping the model's date meanings.
- [x] Add the explanation disclosure and compact toolbar without another sticky page header.
- [x] Manually inspect long titles, missing dates and one-day rails. Run Express type checking and production build; fix errors.

### Task 2 — Responsive agenda and controls

- [x] Render the agenda from the same dated/undated data and define the responsive default.
- [x] Add the optional presentation choice and preserve date position through scale changes.
- [x] Check keyboard pan, native touch scroll, Today, page/filter links and work-record deep links.
- [x] Inspect 320, 375, 768 and 1440px; confirm horizontal scrolling is bounded to the chart. Run type checking and build.

### Task 3 — Reference-inspired story and hero choreography

- [ ] Register one Home-specific factory before controller initialization; reuse current duration/easing tokens.
- [ ] Build the progressive three-chapter story from the current guidance, preserving its customization visibility and static fallback.
- [ ] Implement directional page turns inside the explainer, with stationary controls and bounded geometry.
- [ ] Coordinate the existing headline/reveal effects with finite decorative entrances.
- [ ] Move hero pointer behavior out of `home.ts`, remove superseded orb loops and add complete cancellation/cleanup.
- [ ] Inspect first load, mid-scroll reload, reduced motion, coarse pointer, hidden page and studio edit/preview behavior. Run type checking and build.

### Task 4 — Section and state motion

- [ ] Apply section-level entrances and bounded card staggering through the current shared observer.
- [ ] Consolidate tab-glider/panel transitions and remove competing filter/sort delays.
- [ ] Preserve immediate voting/undo, errors, tracking inputs, search, links and action-hub keyboard behavior.
- [ ] Inspect rapid tab/filter changes and reveal-then-hover release for jumps. Run focused animation lint, type checking and build.

### Task 5 — Integration and delivery

- [ ] Inspect both areas in light/dark and a customized school palette, with long names and empty/populated states.
- [ ] Check responsive widths above, 200% zoom, keyboard focus, dialog return focus, browser back/forward and no-JavaScript content.
- [ ] Inspect layout shift and interaction responsiveness locally. Do not claim a Lighthouse score without actual equivalent measurements.
- [ ] Document behavior and any browser limitations; review the diff and secret scan before committing/pushing the implementation.
- [ ] Report actual checks and skipped tests/device coverage. Keep calendar and Home changes in separate reviewable commits.

## Acceptance and limits

- Desktop calendar rows are materially shorter than the current 160px baseline without clipping accessible text.
- No page-level horizontal overflow from 320px upward; only the optional timeline pans horizontally.
- The calendar and agenda open the same correct work record and preserve public dates and history.
- No extra fixed banners, fake schedules, or misleading complete-school counts.
- Home includes a recognizable, localized page-turn sequence inspired by the recording, in addition to hero arrival, section entrances and state changes.
- The whole application remains a normal scrolling site; no book navigation replaces real forms, feeds, routes or the roadmap.
- Each animated property has one owner, and static/mobile/reduced-motion guidance remains readable.
- Motion never delays a request, steals focus, hides a failure or changes a saved vote state.
- No new persistent background animation loop or dependency. Fallback content remains readable.
- Real-device iPhone keyboard/touch behavior and low-end Android smoothness still need device inspection; local browser emulation cannot prove them.

## Review checkpoint

Planning only. No app, database, dependency or deployment change is authorized by this document itself. Review the proposed calendar presentation and motion direction before implementation. Execution is native in this session unless the user explicitly chooses another approach.
