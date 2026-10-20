# SuggFeed motion

The Express/Eta application keeps full-document routing. Native browser APIs implement motion; Lenis **1.3.23** is the only animation dependency. Development lint tooling: ESLint **10.13.0**, typescript-eslint **8.72.0**. No React, Motion, GSAP, SPA router or bundler was added.

## Lifecycle

`/js/animations.js` is generated from `src/client/animations/` in dependency order. The shared layout loads it once; the standalone studio loads it without activating effects in edit mode. The self-hosted Lenis vendor loads lazily on eligible desktop pointers. Vendor failure preserves native scrolling.

```ts
window.sfMotion?.mount(document); // Idempotent, current document only.
window.sfMotion?.refresh(container); // Register newly inserted elements without replay.
window.sfMotion?.destroy(); // Remove listeners, observers, RAFs, generated text/layers/copies.
```

One body-scoped mutation observer discovers inserted/removed content and relevant control-state changes. Effects share one configuration and independent abortable lifetimes. Hidden documents and BFCache entries suspend work; restored documents resume it. Runtime changes to pointer and reduced-motion preferences rebuild eligible effects with completed entrances remembered.

`src/client/animations/config.ts` owns durations, easing, distances and thresholds, exported to CSS variables by the controller. CSS fallbacks keep controls usable before JavaScript. Transitions are 200–800 ms; the explicitly opt-in continuous marquee is the approved exception.

## Declarative components

| Component | Usage and options | Behavior |
|---|---|---|
| SmoothScroll | Automatic on eligible documents; `data-sf-native-scroll` or `data-lenis-prevent` on a nested scroller | 650 ms eased wheel scrolling. Touch, keyboard and anchors remain native. Browser Find or keyboard scrolling disables the adapter for that mount so ongoing wheel inertia cannot override native navigation. Dialogs, tables, textareas and nested scrolling regions are excluded. |
| Reveal | `<section data-sf-reveal="slide-up">…</section>` | Once per element, 400 ms, 12 px desktop / 6 px mobile, opacity floor .85. Existing cards/panels are registered centrally; table rows are excluded. Account, legal and empty containers use a 240 ms opacity entrance. Focus, pointer interaction and drag cancel pending movement. |
| Stagger | `<div data-sf-stagger>…marked reveal children…</div>` | First five entering siblings receive 0/40/80/120/160 ms delay; remaining siblings have no added delay. Automatic card groups use their parent. |
| SplitText | `<h1 data-sf-split-text="words">Existing <span>accent</span> text</h1>` | Uses opacity-only inline word spans to preserve native multilingual/hyphen wrapping, text nodes, whitespace, nested accents and accessible heading content. 400 ms words, entire sequence ≤720 ms, readable opacity floor .9. Only home/welcome headlines opt in. Original nodes are restored on teardown. |
| PageTransition | Automatic for eligible same-origin GET navigation | Progressive native cross-document View Transitions, 240 ms incoming page, stable header. Skeleton feedback and ordinary navigation continue immediately. Authentication/recovery, downloads, POST submissions, editor routes and reduced motion skip transitions. |
| Cursor | Automatic for fine mouse pointers | Native cursor remains; decorative follower has default/action/drag context. Hides for keyboard, text entry/selection, scrolling, dragging, dialogs and hidden documents. No event interception. RAF runs only while converging on a changed pointer position. |
| MagneticButton | `<button data-sf-magnetic>Existing label</button>` | Moves a generated inner visual layer ≤4 px; outer hit target/focus stay fixed. Only selected prominent home/welcome actions opt in. Pointer leave, focus, press, disablement, scrolling and teardown reset it. Do not use on destructive actions, editor controls, nested inputs or dense toolbars. |
| Marquee | `<section data-sf-marquee data-sf-marquee-speed="24">Existing strip content</section>` | **No production placement.** Wraps the original strip, creates inert `aria-hidden` copies with duplicate IDs removed, adds a keyboard pause/resume button. Speed is px/sec, defaults 24, bounded to 100. CSS `--sf-marquee-gap` defaults 24px. Pauses offscreen, on hover/focus, hidden document and explicit pause. Reduced motion shows original stationary content. |
| Microinteractions | Existing button/link/card/switch classes | Shared transform/opacity feedback; existing static colors, shadows and focus indicators retain their appearance. Additive reveal transforms compose with hover instead of restarting after pointer leave. |

Use `data-sf-motion="off"` on a subtree to exclude it. Never mark form labels, legal paragraphs or table cells as split text. Avoid nested reveal groups; one parent entrance is sufficient. Marquees requiring more than 32 visual copies remain stationary; use meaningful-width strip content.

## Studio isolation

Private previews start with `data-studio-mode="edit"`: transitions and animations are disabled, while selection overlays remain stable. The existing validated frame message handler destroys motion before replacing fragments and mounts it only in preview mode. The preview still strips live application scripts and prevents real submissions, invitations and navigation. Motion cannot grant permissions or change the backend.

## Build and checks

```sh
cd apps/web-express
npm run lint:animations
npm run typecheck
npm run build
npm test
# Terminal 1: fictional local fixture, never mount in production
node -r ts-node/register/transpile-only tests/support/motion-preview.ts
# Terminal 2: Playwright must be available in your external browser tooling
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check-motion.cjs
```

The browser suite uses Chromium, local fictional fixtures and widths 320/375/768/1440. It checks native nested scrolling/history/anchors, headline restoration/no-JS readability, independent magnetic hit targets, cursor keyboard fallback, marquee pause/copies, touch/Save-Data/reduced-motion, preview isolation and explicit observer/listener/RAF teardown. No hosted accounts or data writes are used. `MOTION_BASE_URL` and `CHROME_PATH` can override local tooling locations.

Development watch: the existing TypeScript watcher compiles individual classic scripts. Run `npm run build:animations` after animation source changes (or use `npm run build:client`) to regenerate the ordered bundle. CI runs focused lint plus the existing typecheck/test/build gates.

## Limitations

Native cross-document transitions depend on browser support; unsupported browsers keep ordinary navigation. Smooth scrolling, cursor and magnetism deliberately disappear under accessibility/device/Save-Data conditions. Marquee is opt-in, not a new page feature. Baseline measurements use synthetic local fixtures and do not establish hosted production performance or real-device Safari behavior. Measurements and final verification are recorded in `verification.md`.
