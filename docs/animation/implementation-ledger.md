# SDD ledger — plan: SuggFeed Animation System (user-approved, 2026-10-20)

Pre-flight: classic browser scripts require one ordered namespace bundle; Lenis must load before its adapter constructs an instance. Existing reveals/CSS entrances and hover must have separate transform ownership. Preview renderer strips application scripts, so animation initialization is explicitly included only behind preview mode.

Ruling: Preserve all pre-existing security changes in this worktree; no deployment, credential changes, database writes or push are part of this animation implementation.
Ruling: Native browser capability checks provide progressive enhancement. A failed vendor load leaves native scrolling and visible content.

## Verification
- Baseline: local synthetic Eta fixtures on port 4319; browser/measurement artifacts in /tmp/sf-motion-baseline.
- Tasks: tooling/baseline, smooth scroll, reveals/stagger, split text, navigation, cursor, magnet, marquee, microinteractions, final review.
- Smooth scrolling gate: lint, complete type check, production build, responsive/lifecycle browser checks passed at 320/375/768/1440.
- Reveal/stagger gate: failing ownership check observed before implementation; shared observer, bounded sibling staggering, additive transform and removed-node cleanup passed the same gates.
- Headline gate: failing word enhancement check observed, then exact text restoration and responsive checks passed.
- Page transition gate: auth/cross-origin eligibility failed before implementation, then unit and responsive checks passed; native routing and skeleton handling unchanged.
- Baseline five Lighthouse runs: performance median 66, CLS 0, TBT 0 (raw artifacts outside repo). Local tool runtime is Node 24; application target remains Node 22. Browser and fixture runtime kept identical for comparison.
- Cursor, magnetic and marquee gates: failing dedicated browser checks observed before implementation; typecheck/build/lint and 4-width browser gates passed after each.
- Microinteraction gate: transform-only assertion failed against legacy color/shadow transitions, then passed after consolidation. Removed home card tilt listeners to avoid per-pointer layout reads and overlapping transform ownership.
- Ruling: use inline opacity-only word reveals — preserves native wrapping for school-controlled CJK, hyphenated and long headlines without changing typography or layout.
- Ruling: navigation skeleton is a fixed overlay over inert, layout-preserved outgoing content — previous hidden content collapsed document height and lost native history positions. Browser regression now preserves position.
- Ruling: cross-document names are emitted by Eta before first snapshot — Chromium pagereveal precedes deferred script initialization. Confirmed actual sf-page-in 240ms animation and stable named header, with UA geometry animations disabled.
- Ruling: browser Find permanently selects native scrolling for that mount, including an in-flight vendor load. Dedicated delayed-load regression failed, then passed.
- Runtime preference verification: synchronize initial MQL evaluation before emulation; retain/remove preference listeners explicitly and perform one first-frame preference checkpoint. No persistent polling. Teardown checks cover manual listeners, abort signals, observers and owned frames.
- Dependency audit initially found high-severity braces transitive issues in old lint tools. Updated to ESLint 10.13.0 / typescript-eslint 8.72.0; fresh npm audit reports zero vulnerabilities at every severity.
- Full Node 24 regression: 273 passed. Updated the explicit service-worker cache-version expectation after bumping the static cache generation; no application assertion weakened.
- Final extended browser suite passed at 320/375/768/1440 plus native anchors/nested scrolling/history, preview action isolation, marquee controls, no-JS/vendor-failure readability and device/accessibility fallbacks. Native cross-document incoming animation separately confirmed in Chromium.
- Final keyboard regression: PageDown during a live eased wheel scroll was pulled back to the wheel target (105px → 300px). New keyboard-navigation fallback destroys the adapter without preventing native events; typing inputs are excluded. Browser regression verifies PageDown advances beyond 600px. Native scrolling stays selected for that document mount.
- Final Node 22.23.3 acceptance: lint, complete type check, production build and 273/273 tests passed after the keyboard fix.
- Fresh whole-change reviewer: no remaining confirmed important findings after delayed-vendor, reduced-motion and word-wrapping fixes; final lifecycle/browser verification performed by the implementer.
- Final pointer regression: held press previously scaled the outer magnetic button, shrinking its hit target. The stationary outer control now keeps hover/press feedback on its generated inner layer; bounding-box assertions pass during hover and held press.
- Final Chromium browser acceptance passed all four widths and extended interactions after the keyboard/press fixes. History checks now wait for native restoration and report actual position/document metrics on failure, rather than relying on one fixed sample.
- Push preparation: integrated animation-only changes onto current main efef66f in an isolated worktree; preserved the newer UI refresh and all original uncommitted security changes. Node 22 lint/typecheck/build and 273 tests passed; complete four-width Chromium regression passed. No environment files staged.
