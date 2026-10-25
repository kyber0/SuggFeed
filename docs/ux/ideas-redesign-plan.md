# Ideas screen redesign plan

Status: approved design reference. Read alongside `home-redesign-plan.md`, `home-ideas-implementation.md` and the existing student-experience documentation.

## Goal

Let a student discover useful feedback, understand its progress, support or discuss it, and return to the same browsing position without confusion. Home introduces; Ideas supports sustained browsing. Preserve school access, publication, moderation, identity and feature controls.

## Source findings

The current feed has a three-column desktop layout, duplicated section navigation in the left rail and main header, topic filters in two places, a tall stack of introductory/search/sort/filter/saved-search controls, and a right rail containing roadmap promotion, repeated current-page ideas and instructions. The existing drawer already has request cancellation, loading/error handling, focus restoration and original-path tracking. Preserve these safeguards while refining presentation; this review does not establish that their behavior is regression-free.

## Information architecture

- Main navigation stays Home / Ideas / Profile; no Submit control is added there.
- One Ideas navigation: Browse / Following / Progress.
- Browse: published school ideas.
- Following: only the current account’s followed ideas; following is separate from bookmarks and support.
- Progress: existing school roadmap views, with the same section header and meaningful disabled-feature explanation.
- My ideas, private questions and decisions stay under Profile. Do not duplicate them in an Ideas navigation rail.

## Desktop layout

Use a restrained two-column composition: narrow topic/filter rail and readable main stream. Remove the permanent right column and repeated navigation. The rail contains topics, secondary saved-search access and optional brief guidance; it must not become a second application menu. Use school category IDs and approved icons. Do not repeat all topics above the stream on desktop.

Header: one h1, brief description, one local Share an idea action. Then compact search and sorting/filter controls, applied filter chips when relevant, and an accurate results summary. Get the first idea near the initial viewport without a large introduction.

Keep the app shell stable and use one primary feed scroll region on desktop. Do not nest an additional scroll region around the cards. Side content should be short; only genuinely overflowing side content gets a native scroll area. On mobile use ordinary document scrolling. Preserve anchors, focus and browser history; do not add scroll hijacking.

## Mobile layout

Compact heading and local contribution action; Browse/Following/Progress; full-width search; sort plus Filters button; applied-filter summary; single-column stream. Filters open an accessible sheet with category selection, an explicit Apply action and Reset. Staged selections do not change results until applied. Sheet cancellation preserves current filters and input. Active topic and sort remain visible after closing. Do not show both a long category carousel and an expanded filter list. Maintain 44px targets and at least 8px separation, safe areas and keyboard access from 320px.

## Browsing and search

Retain Latest and Most supported, school categories and title/description search. URL state contains applied search, category, sort, Following scope and page. Filters reset pagination and cancel stale requests. Clear individual chips without losing unrelated state. A reset within Following stays within Following. Do not imply semantic/AI search unless it actually exists. Saved searches remain available as a secondary Save view action/panel; retain current limits and account/device storage explanations.

Keep bounded Load more and no-JavaScript pagination. Append without reordering existing cards, preserve position, prevent duplicate rows and offer local retry on failure. Use “Showing N ideas” when no exact total is loaded. Never describe current-page popularity as a school-wide trend.

## Shared idea card

One card component across Home highlights, Browse and Following, with suitable density variations. Structure: category and public stage; title; short description; author/date where applicable; compact actions. Make the title/content area a real detail link with progressive drawer enhancement. Buttons are separate siblings, not interactive elements nested inside a card link. Do not make the entire card an ambiguous button.

Primary card actions: support/undo support, discussion, save; use an accessible More menu for secondary follow/share/report where appropriate. Follow is also clearly available in details. Preserve private reporting, safe links and actual publication rules. On coarse pointers, keep essential actions visible without hover. Use clear pressed/active labels, not only colors. Category icons and labels follow school configuration. Raw internal status names should not leak into public stage labels.

## Action reliability

Support can be undone. Show local pending state, prevent duplicate clicks and reconcile to the authoritative response. Confirmed failure restores the prior state; uncertain timeouts reconcile before claiming success/failure. Synchronize confirmed support/follow/save state across all visible instances of that idea. Disabled school features explain their state and remain blocked on direct server requests. Do not optimistically announce success before authorization is known.

## Idea reading

Desktop drawer: compact stable toolbar, clear close and open-full-page actions; generous reading column and discussion region. Keep current request cancellation, focus trap/background inertness, Escape and focus restoration. Closing restores filter URL, scroll and loading-button state; stale responses cannot reopen closed content.

Standalone permalink: use the same detail components, a compact Back control beside category/stage, and a meaningful return to originating feed/progress filters. Public links remain real navigable URLs. Private answers/images are shown only through authorized owner access, not as a floating public-page button.

On narrow screens, show one reading column and one content scroll region with a compact toolbar. Do not recreate the previous oversized fixed headers. Reply/edit composers remain compact; focus and virtual keyboards must not obscure them. Preserve the existing comment moderation/reporting rules and thread structure. Public progress updates and discussion have distinct headings. Show only verified dates, updates and outcomes.

## Following

Signed-out: explain sign-in at the same destination and preserve the intended return path. Signed-in empty: explain how to follow, with Browse ideas. Populated: same cards, search and filters scoped to followed ideas. No new activity is different from following nothing. Following is not an enrollment flow and must never incorrectly send an existing member to join a school.

## State design

Cover: school has no published ideas; no search matches; Following empty; guest Following; first-page failure; load-more failure; idea removed/private while browsing; support/follow/save pending or failed; offline; access expired; feature disabled. Preserve existing text and filter selections through recoverable failures. Never expose hidden submissions in results, counts, saved-search previews or cached card data. Access changes remove stale protected data and offer a safe next step.

## Visual and motion direction

Match the Home plan: shared palette, typography, spacing and components; readable stream width, subtle dividers, restrained surfaces and no unnecessary nested cards. Use meaningful school icons and accessible stage badges. Long titles, links, names and category labels wrap without collisions. Light/dark layouts and school themes retain contrast.

Use existing motion tokens: brief card entrances for new content only, subtle press/hover feedback and progressive drawer motion. Search/filter updates show local progress, not a full-page loading curtain. Do not replay all cards or automatically rearrange a live list. Reduce movement for reduced-motion preferences; no new animation dependency.

## Implementation order

1. Simplify shell/navigation and establish desktop/mobile scrolling.
2. Consolidate search, category, sort, saved-view and pagination behavior.
3. Refine shared cards and action states while retaining backend safeguards.
4. Align drawer/permalink reading, comments and return behavior.
5. Integrate all empty/error/disabled states, motion and school preview rendering.

## Planned acceptance criteria and limits

At 320, 375, 768 and 1440px, first ideas should be easy to reach, controls must not overlap and no page overflow should occur. Search/filters survive opening/closing an idea and Back/Forward. Support remains correct after refresh and can be undone. Load-more retries neither duplicate nor discard cards. Identity and school boundaries remain authoritative. Same behavior applies in customization previews using fictional data and disabled real actions.

These are implementation acceptance criteria, not completed checks. No tests, application changes, database changes or hosted writes were performed for this planning task. Physical-device keyboard behavior, assistive technology and live endpoint behavior remain to be evaluated; automated tests run only when requested.
