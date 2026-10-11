# SuggFeed campus roadmap: redesign plan

Date: 2026-10-11
Scope: the public `/roadmap` page in `apps/web-express` (Express, Eta, TypeScript, Supabase, Vercel).
Interactive mockup (private link, share it from the canvas): https://claude.ai/artifact/EGpNvMFopJi9AnHhqTNGum

The mockup uses sample data and your existing colors and font from `public/css/modules/tokens.css`. It is a design preview, not production code.

## 1. Summary

The current page works: three status lanes, board and list layouts, search, category filter, URL-preserved filters, a detail dialog with the school's latest response. It deliberately promises no dates, no team, and no estimates. Keep that.

What is missing is proof and context. Completed items have no real completion date, nothing groups ideas by outcome, students cannot follow an idea, and nothing shows that feedback led to action.

The plan has three phases:

1. Fix gaps: real completion dates, a recently completed strip, tree view, "You said, we did" view, motion polish. No new tables beyond one column.
2. Add value: vote and follow from the roadmap, notifications, school themes with goals, term-level horizons, desktop side panel.
3. Build trust: public changelog, optional "not planned, with reasons", stale-item alerts for staff.

```
Roadmap page
├── 1. Fix gaps
│   ├── Real completion dates
│   ├── Recently completed strip
│   └── Tree view and "You said, we did" view
├── 2. Add value
│   ├── Vote and follow from the roadmap, notifications
│   ├── School themes with goals
│   └── Term-level horizons
└── 3. Build trust
    ├── Public changelog page
    ├── Not planned, with reasons (optional)
    └── Stale-item alerts for staff
```

## 2. What exists today

From `views/roadmap.eta`, `src/lib/roadmap.ts`, `src/routes/roadmap.ts`, and the README:

- Stages come from submission status: `approved` shows as Planned, `in_progress` as In progress, `resolved` as Completed.
- Each stage loads up to 8 ideas per page (`ROADMAP_PER_STAGE = 8`), ordered by `vote_count` descending, then `id`.
- Filters: search (title and description), category, stage, layout (`board` or `list`), page. All are kept in the URL.
- Counts are exact and computed before pagination.
- Cards show category, title, description, "Updated <date>", votes, comments. They are read-only: no vote or follow action on the card.
- The detail dialog shows status, description, latest school response (`staff_note`), a three-step stage indicator, and a link to the idea discussion.
- Public detail JSON never selects private workflow, author, or tracking-code fields, and the service worker does not cache it.
- Staff side has private priority, assignee, target date, internal notes, and status history. Target dates stay private.

Not verified: I only read the roadmap files. I did not read `src/routes/api.ts`, the feed code, or the Supabase migrations (they were not in the zip), so the status history table name and any existing follow or vote endpoints need confirming.

## 3. Gaps and why they matter

1. Completed has no completion date. The card shows `updated_at`, which changes on any edit, so "Updated Oct 3" on a completed item is not "Completed Oct 3".
2. Dates render without a time zone. `toLocaleDateString('en-PH', ...)` runs on the server (UTC on Vercel), so an update at 00:30 Manila time can show the previous day. Pass `timeZone: 'Asia/Manila'`, as the staff overdue logic already does.
3. Lanes sort only by votes. A small fix and a campus-wide project look the same, and nothing groups ideas by outcome.
4. Students cannot follow an idea or get told when it changes stage.
5. Nothing shows that feedback led to action beyond a card moving lanes.
6. Declined ideas disappear with no public reason (optional to change, see Phase 3).

## 4. Design concept

### 4.1 Principles

- Outcomes over features: group by category now, school themes later.
- Honest time: show real completion dates and optional term-level horizons. No exact delivery dates.
- One source of truth: every item on the page traces to a real submission status.
- Simple first: the default view is still the board. Other views are one tap away.
- Light motion only: every effect is CSS, short, and disabled under `prefers-reduced-motion`.

### 4.2 Page structure, top to bottom

1. Header: wordmark, nav (Home, Feed, Roadmap), "Share an idea" button.
2. Hero (navy): kicker, headline, one-line promise on the left. On the right, three stage tiles (Planned, In progress, Completed) with live counts, joined by dashed connectors with a small dot travelling along them. Tiles are filters: tap to filter by stage, tap again to clear.
3. Controls: layout switch (Board, Tree, You said, we did), category chips, a results line. Search stays in the real page (the mockup omits it to keep the preview clean).
4. Main area: the selected view, plus a detail panel to its right when an idea is open.
5. Footer band: "Your next idea could start here." with the same button.

### 4.3 Views

Board (default). Three lanes, cards sorted by votes. Each card: category tag, date, title (a real button that stretches over the whole card), two-line description, vote button with count, comment count, arrow.

Tree. One card per category (a branch). Header shows idea count and completed count, plus a segmented progress bar (completed, in progress, planned). Leaves hang off a connector line, each with a stage dot, title, and stage pill. Branches fold and unfold. This replaces the current compact list view as the grouped, scannable layout. Old `view=list` links should alias to `tree` so shared URLs keep working.

You said, we did. Completed ideas only, newest first, grouped by month. Each entry has two blocks side by side: "You said" (the idea) and "We did" (the school response), with the real completion date. This is the proof view and the most valuable addition.

Detail. Status pill, title, category and counts, about text, latest school response, three-step stage indicator, Follow button, link to the discussion. On wide screens it opens as a side panel. Below roughly 1100px it stays a dialog, as today.

### 4.4 Interaction and motion

All CSS, no libraries.

| Effect | Where | Timing |
| --- | --- | --- |
| Lift and shadow on hover | cards, stage tiles, chips | 200 ms |
| Arrow nudges right | card arrow, buttons | 200 ms |
| Dot travels along connector | hero, between stage tiles | 2.6 s loop |
| Pulse | In progress dot and pill | 1.9 s loop |
| Progress bar grows from left | tree view | 0.8 s once |
| Chevron rotates | tree branch header | 250 ms |
| Panel slides in | detail panel | 400 ms |
| Close button rotates | detail panel | 250 ms |
| Press-down scale | vote, follow, CTA | 150 ms |

Rule: wrap everything in `@media (prefers-reduced-motion: reduce)` and set `animation: none; transition: none`. No scroll-jacking, no parallax, no autoplay beyond the two loops above.

### 4.4.1 State kept in the URL

Keep today's pattern. Add `view=tree|timeline`. Keep `stage`, `category`, `search`, `page`. Selected idea stays a shareable item URL, as the README describes. Fold state for tree branches is local and not in the URL.

### 4.5 Visual system

Use existing tokens. Do not add a new palette.

| Role | Value | Source |
| --- | --- | --- |
| Ink | `#102a43` | `--ink` |
| Navy (hero, selected states) | `#0b3857` | `--navy` |
| Sky (response block, Planned pill) | `#e8f4fb` | `--sky` |
| Page background | `#f8fafc` | `--bg` |
| Line | `#d9e2ec` | `--line` |
| Stage dots | `#3b82f6`, `#f59e0b`, `#10b981` | roadmap status tokens |
| Font | Inter 400 to 800 | already loaded |

Contrast changes to make in production (computed against white):

- `--accent` `#e86e4a` is about 3.1:1. Fine for decoration on navy, not for white text on a solid button. The mockup uses `#c0451f` (about 5.1:1) for solid accent buttons.
- `--muted` `#627d98` is about 4.3:1. The mockup uses `#4a6580` for small text.
- Pill text colors in the mockup: Planned `#0b3857` on `#e8f4fb`, In progress `#8a5a00` on `#fff4dc`, Completed `#0b6b48` on `#e4f7ee`. The existing `--warn` `#9c6500` and `--success` `#11845b` are slightly under 4.5:1 on their tinted backgrounds.

Dark mode: `tokens.css` already has a `[data-theme="dark"]` block. Port the new classes to it. The mockup is light only.

### 4.6 Responsive behavior

- 1100px and up: side panel beside the view.
- Below 1100px: detail stays a dialog.
- Below 640px: stage tiles stack, connectors hide, hero title drops to 36px, board lanes stack to one column, the stage switch uses the existing mobile stage selection.
- Staff entry links stay hidden at 800px and below, as the README states.

### 4.7 Accessibility

- Every interactive element is a real `<button>` or `<a>`. Cards use a title button with a stretched `::after` overlay, so Tab order and screen readers see one control per card. The vote button sits above the overlay (`z-index`).
- Touch targets 44px minimum, including chips and the vote button.
- Visible focus ring (`:focus-visible`, 3px). Card shows the ring when its title button is focused (`:has(.open:focus-visible)`).
- `aria-pressed` on view switch, chips, stage tiles, vote, follow. `aria-expanded` on tree branches.
- Color is never the only signal: stage dots always sit next to a text label.
- Keep the existing keyboard-accessible detail panel behavior and shareable item URLs.

## 5. Phased plan

Effort labels are rough guesses: S is up to a day, M is two to four days, L is a week or more.

### Mockup element to phase

| Mockup element | Phase | Existing code |
| --- | --- | --- |
| Stage tiles as filters with live counts | 1 | replaces `roadmap-summary` links |
| Category chips | 1 | replaces category `<select>` (keep search) |
| Board cards, hover effects | 1 | `roadmap-idea` cards |
| Tree view | 1 | replaces `list` view |
| You said, we did view | 1 | new |
| Real completion date on cards | 1 | currently `updated_at` |
| Detail: response, stage indicator | 1 | exists in `roadmap-dialog` |
| Vote button on cards | 2 | feed vote endpoint (to confirm) |
| Follow button, notifications | 2 | new |
| Desktop side panel | 2 | replaces dialog above 1100px |

### Phase 1: fix gaps (M to L total)

Goal: students can see when things were really done, and see ideas grouped by outcome.

1. Add `resolved_at` (S). New migration, for example `supabase/migrations/202610110001_roadmap_resolved_at.sql`. Add the column, backfill it, update the transactional moderation function so it sets `resolved_at = now()` when status becomes `resolved` and clears it if an idea is reopened. Apply it before deploying code, as the README requires for every migration.
2. Query and template (S). Add `resolved_at` to `publicColumns` and `publicItem` in `src/lib/roadmap.ts`. Order the Completed lane by `resolved_at` descending, then votes. Show "Completed Oct 2" on completed cards in `views/roadmap.eta`.
3. Fix date rendering (S). Pass `timeZone: 'Asia/Manila'` to every date format on the page and in the detail JSON.
4. Recently completed strip (S). Top three by `resolved_at` above the board, each linking to its detail. Hide it when the stage filter is Completed.
5. Filters (S). Extend `roadmapFilters` so `view` accepts `board`, `tree`, `timeline`; map `list` to `tree`. Update `tests/roadmap-pagination.test.ts`.
6. Tree view (M). Group by category. Show up to 8 leaves per category with a "View all in <category>" link that sets the category filter. Counts stay exact. Progress bar uses totals for the category regardless of the stage filter.
7. You said, we did (M). Completed ideas grouped by month in `Asia/Manila`, 20 per page, ordered by `resolved_at`. Paginate by items, not by month.
8. Hero tiles and chips (S). Replace the summary links and category select. Keep search and the Apply behavior, or make chips apply instantly via the existing `data-roadmap-state-link` pattern.
9. Client code (S). Extend `src/client/roadmap.ts` for the three-way view switch and branch folding. Rebuild `public/js/roadmap.js` with `npm run build:client`.
10. CSS (M). Add the effects in section 4.4 to `public/css/modules/roadmap.css`. Add the reduced-motion block. Port to dark mode.
11. Preview harness (S). Update `tests/support/workspace-preview.ts` sample data with `resolved_at` and enough ideas per category to see the tree.

Done when: completed cards show a true completion date, tree and timeline views work with filters and shared URLs, old `view=list` links still load, tests pass, and the page is usable with reduced motion on.

### Phase 2: add value (L)

Goal: students engage with items and hear back.

1. Vote from the roadmap (M). Reuse the feed's vote endpoint and the auth modal for signed-out users. Update the count in place. Confirm the endpoint in `src/routes/api.ts`. Rate-limit as the feed does.
2. Follow an idea (M). New table `idea_follows`. Endpoints to follow and unfollow. Button state in the detail panel. Server-only access, as with the other private tables.
3. Notifications (L). Start in-app: a `notifications` table written by the same transactional moderation function that changes status, so a stage change and its notification commit together. Show an unread badge and a list. Add web push later through `src/sw.ts`. Note: on iOS, push works only for an installed PWA.
4. School themes with goals (M). A `roadmap_themes` table (name, one-line goal, sort order) and `submissions.theme_id`. Staff assign a theme in the review drawer. Until then, category is the group. Four to six themes is enough.
5. Term-level horizons (S to M). A nullable `public_horizon` on `submissions` with values `this_term`, `next_term`, `later`, set by staff. Keep it separate from the private target date so a private date can never leak. Show it as a small tag on Planned and In progress cards. The page still promises no exact dates.
6. Desktop side panel (M). Above 1100px, open details beside the view; below, keep the dialog. Keep the shareable item URL and keyboard behavior. Never cache the detail JSON in the service worker.

Done when: a signed-in student can vote and follow from the roadmap, gets a notification when a followed idea changes stage, and staff can set a theme and a horizon.

### Phase 3: build trust (M to L)

Goal: make the school's follow-through visible and keep staff on schedule.

1. Public changelog page (M). A page (for example `/roadmap/done`) for the "You said, we did" feed with a stable URL, month anchors, and an RSS or Atom feed. Optional monthly digest to followers.
2. Not planned, with reasons (M, optional). Show declined ideas that have a public reason. Requires staff to write a public response before declining, a clear moderation tone guide, and a school decision to publish these. Hidden by default behind a toggle.
3. Stale-item alerts for staff (S). In the staff queue, flag `in_progress` ideas with no update in 30 days (configurable). Add a "Stale" filter next to "Overdue", using the same `Asia/Manila` day logic as `staff-workspace.ts`.
4. Roadmap analytics (S). Add roadmap metrics to the existing admin analytics page (see section 9).

Done when: the changelog has a stable URL, staff can filter stale work, and the school has decided whether to publish declined ideas.

## 6. Proposed data changes

These are sketches. Table and column names marked `<...>` must be confirmed against `supabase/migrations/202610100002_staff_feedback.sql` and `202610100003_staff_workspace.sql`, which were not in the zip.

Phase 1:

```sql
alter table public.submissions add column if not exists resolved_at timestamptz;

-- backfill from status history (names to confirm)
update public.submissions s
set resolved_at = h.first_resolved
from (
  select submission_id, min(created_at) as first_resolved
  from public.<status_history_table>
  where <new_status_column> = 'resolved'
  group by submission_id
) h
where h.submission_id = s.id and s.status = 'resolved' and s.resolved_at is null;

-- rows with no history
update public.submissions set resolved_at = updated_at
where status = 'resolved' and resolved_at is null;

create index if not exists submissions_resolved_at_idx
  on public.submissions (resolved_at desc) where status = 'resolved';
```

Also update the moderation function so it maintains `resolved_at` on every status change.

Phase 2:

```sql
create table public.idea_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);
alter table public.idea_follows enable row level security;
-- no policies for anon or authenticated: server (service role) only

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  kind text not null check (kind in ('stage_changed')),
  from_status text,
  to_status text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.notifications enable row level security;

alter table public.submissions
  add column if not exists public_horizon text
    check (public_horizon in ('this_term','next_term','later'));

create table public.roadmap_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null default '',
  sort_order int not null default 0
);
alter table public.submissions
  add column if not exists theme_id uuid references public.roadmap_themes(id);
```

All migrations are additive, so rolling back code does not require dropping anything, consistent with the README.

## 7. Code map

| Area | File | Change |
| --- | --- | --- |
| Filters and queries | `src/lib/roadmap.ts` | `view` values, `resolved_at`, tree and timeline loaders, theme and horizon fields later |
| Route | `src/routes/roadmap.ts` | pass new data to the template, keep page-overflow redirect |
| Template | `views/roadmap.eta` | hero tiles, chips, three views, completion dates, panel later |
| Client | `src/client/roadmap.ts` | view switch, branch folding, panel later |
| Styles | `public/css/modules/roadmap.css`, `tokens.css` | effects, contrast fixes, dark mode |
| Staff | `src/lib/staff-workspace.ts`, `views/admin*.eta` | theme and horizon fields, stale filter |
| Service worker | `src/sw.ts` | keep roadmap detail JSON uncached, push later |
| Tests | `tests/roadmap-pagination.test.ts`, `tests/templates.test.ts`, `tests/support/workspace-preview.ts` | see section 10 |

## 8. Security and privacy

- Keep the public field whitelist. New public columns (`resolved_at`, `public_horizon`, theme) are added to `publicColumns` explicitly. Never `select('*')`.
- Private target dates, assignments, priorities, and internal notes never appear on this page. `public_horizon` is a separate field for that reason.
- Follow and notification tables are service-role only with RLS on and no browser policies, like `web_sessions` and the workspace tables.
- Notifications may contain only public data: idea title, new stage, public school response. Never internal notes.
- Rate-limit vote, follow, and notification endpoints with the existing `express-rate-limit`.
- Follow state is per user. Do not cache any response that includes it.
- Opt-in only for notifications. Make unfollow one tap.
- The zip included a `.env` file. Do not share the archive; rotate any real keys it contains.

## 9. Measuring success

Use the existing admin analytics page. Track:

- Share of published ideas with a public school response (target: rising).
- Median time from submission to approved, approved to in progress, in progress to completed.
- Roadmap visits, and the share that open a detail.
- Use of each view (board, tree, you said we did).
- Follow rate per signed-in visitor, and notification open rate (Phase 2).
- Returning visitors to `/roadmap` within 30 days.
- In-progress items with no update in 30 days (should fall after the stale alert ships).

Set targets only after a few weeks of baseline data.

## 10. Testing

Existing tests use the Node test runner with mocked auth and database. Add:

- `roadmapFilters`: accepts `tree` and `timeline`, maps `list` to `tree`, rejects unknown values to `board`.
- Completed ordering by `resolved_at`, with ties broken by votes.
- Month grouping in `Asia/Manila`, including an item completed at 00:30 on the first of a month.
- Tree grouping: counts per category stay exact when search, category, and stage filters apply.
- Template tests: completed cards show the completion date, tree branches have `aria-expanded`, vote and follow buttons have `aria-pressed`.
- Public detail JSON still excludes private fields (extend the existing check).
- Phase 2: follow is idempotent, unfollow removes it, a status change creates exactly one notification per follower.
- Manual: keyboard-only pass, screen reader pass, 390px and 1440px widths, reduced motion on, dark mode.

## 11. Rollout and rollback

1. Test migrations in a staging Supabase project first, including the backfill. Review `npx supabase migration list`.
2. Apply the migration to production before deploying the code that reads the new column.
3. Deploy Phase 1 behind the default board view. Tree and timeline are opt-in by tapping the switch, so risk is low.
4. Watch error logs and the analytics page for a week.
5. Roll back by redeploying the previous code. The migrations are additive and can stay.
6. Phase 2 notifications: ship in-app first, then web push.

## 12. Risks

- Backfilled `resolved_at` for old items may be approximate if status history is incomplete. The fallback uses `updated_at`. Mark old items as approximate or accept it.
- The tree view with many categories can get long. Cap leaves per category and fold by default after a threshold.
- Notifications can feel noisy. Only notify on stage changes of followed ideas.
- Staff may not keep horizons and themes current. The stale alert and a monthly review reminder help.
- Publishing declined ideas can discourage students. Make it optional and tone-guided.
- Motion and a dense hero add weight on low-end phones. Effects are CSS-only and respect reduced motion.

## 13. Open questions

1. What are the real category names and how many are there? The mockup uses sample names.
2. What are the status history table and column names?
3. Is there already a follow, bookmark, or notification feature in the feed or profile code?
4. Should Tree replace List, or should both stay?
5. What terms does the school use (semesters, quarters, trimesters) for the horizon labels?
6. Does the school want declined ideas public?
7. Which notification channel first: in-app, email, or web push?
8. Is search required inside the tree and timeline views, or only on the board?
