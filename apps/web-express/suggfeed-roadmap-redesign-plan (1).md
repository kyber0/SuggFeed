# SuggFeed campus roadmap: redesign plan (v2)

Date: 2026-10-11
Scope: the public `/roadmap` page in `apps/web-express` (Express, Eta, TypeScript, Supabase, Vercel), plus the staff screen where updates are posted.
Interactive mockup (private link, share it from the canvas): https://claude.ai/artifact/EGpNvMFopJi9AnHhqTNGum

The mockup uses sample data and your existing colors and font from `public/css/modules/tokens.css`. It is a design preview, not production code. To try the new parts: switch "Preview as" to Staff, open an idea, post an update, then check the Board, Tree, and Timeline views.

What changed from v1: every idea now has a progress timeline of staff updates (status, percent, description, files). A Gantt-style Timeline view shows real work across months with a Today line, based on the timeline reference you shared. Phases were reorganized around this.

## 1. Summary

The current page works: three status lanes, board and list layouts, search, category filter, URL-preserved filters, a detail dialog with the school's latest response. It deliberately promises no dates, no team, and no estimates. Keep that.

What is missing is proof and context. Completed items have no real completion date, there is no history of what the school did, nothing groups ideas by outcome, and students cannot follow an idea.

The plan has four phases:

1. Fix gaps: real completion dates, tree view, "You said, we did" view, recently completed strip, motion polish.
2. Progress updates: staff post updates (type, percent, description, files, visibility). Each idea gets a progress timeline. Add the Timeline (Gantt) view.
3. Engage: vote and follow from the roadmap, notifications, school themes, term-level horizons, desktop side panel.
4. Build trust: public changelog, optional "not planned, with reasons", stale-item alerts, metrics.

```
Roadmap page
├── 1. Fix gaps
│   ├── Real completion dates
│   ├── Tree view
│   └── "You said, we did" view
├── 2. Progress updates
│   ├── Staff update composer (type, percent, text, files, visibility)
│   ├── Progress timeline on every idea
│   └── Timeline (Gantt) view with Today line
├── 3. Engage
│   ├── Vote and follow, notifications
│   ├── School themes, term-level horizons
│   └── Desktop side panel
└── 4. Build trust
    ├── Public changelog
    ├── Not planned, with reasons (optional)
    └── Stale-item alerts, metrics
```

## 2. What exists today

From `views/roadmap.eta`, `src/lib/roadmap.ts`, `src/routes/roadmap.ts`, and the README:

- Stages come from submission status: `approved` shows as Planned, `in_progress` as In progress, `resolved` as Completed.
- Each stage loads up to 8 ideas per page (`ROADMAP_PER_STAGE = 8`), ordered by `vote_count` descending, then `id`.
- Filters: search, category, stage, layout (`board` or `list`), page. All are kept in the URL.
- Counts are exact and computed before pagination.
- Cards show category, title, description, "Updated <date>", votes, comments. They are read-only.
- The detail dialog shows status, description, the latest school response (`staff_note`), a three-step stage indicator, and a link to the discussion.
- Public detail JSON never selects private workflow, author, or tracking-code fields, and the service worker does not cache it.
- Staff side has private priority, assignee, target date, internal notes, and status history. Target dates stay private.

Not verified: I only read the roadmap files. I did not read `src/routes/api.ts`, the feed code, or the Supabase migrations (they were not in the zip). The status history table name, the moderation function name, the staff profile and role tables, and any existing follow, vote, or upload code need confirming.

## 3. Gaps and why they matter

1. Completed has no completion date. Cards show `updated_at`, which changes on any edit, so "Updated Oct 3" on a completed item is not "Completed Oct 3".
2. Dates render without a time zone. `toLocaleDateString('en-PH', ...)` runs on the server (UTC on Vercel), so an update at 00:30 Manila time can show the previous day. Pass `timeZone: 'Asia/Manila'`, as the staff overdue logic already does.
3. There is only one public text per idea (`staff_note`). Students cannot see what happened between "approved" and "completed".
4. No percent complete, no start date, no evidence (photos, documents).
5. Lanes sort only by votes, with no grouping by outcome.
6. Students cannot follow an idea or be told when it moves.
7. Declined ideas disappear with no public reason (optional to change, see Phase 4).

## 4. Design concept

### 4.1 Principles

- Outcomes over features: group by category now, school themes later.
- Real history, not promises: bars and timelines show what already happened. No exact delivery dates.
- One source of truth: stage always comes from status. Updates and percent never contradict it.
- Simple first: the default view is still the board.
- Staff effort stays low: one short form, one place, sensible defaults.
- Light motion only: every effect is CSS, short, and disabled under `prefers-reduced-motion`.

### 4.2 Page structure, top to bottom

1. Header: wordmark, nav (Home, Feed, Roadmap), "Share an idea" button. The "Preview as Student/Staff" toggle and "Sample data" badge exist only in the mockup.
2. Hero (navy): kicker, headline, one-line promise. On the right, three stage tiles with live counts joined by dashed connectors with a small dot travelling along them. Tiles are filters.
3. Controls: layout switch (Board, Tree, Timeline, You said, we did), category chips, a results line. Search stays in the real page (the mockup omits it).
4. Main area: the selected view, plus the detail panel when an idea is open.
5. Footer band: "Your next idea could start here."

### 4.3 Views

Board (default). Three lanes, cards sorted by votes. Cards for started work show a slim progress bar and percent. A "Blocked" pill appears when the latest public update is a blocker.

Tree. One card per category (a branch) with idea count, completed count, and a segmented progress bar. Leaves hang off a connector line with stage dot, title, percent (for started work), and stage pill. Branches fold. This replaces the compact list view. Old `view=list` links alias to `tree`.

Timeline (new). A Gantt-style view, based on your reference. Months across the top, weekly gridlines, a dashed blue "Today" line. Each started or completed idea is a card (category-colored stripe, icon, title, percent, status dot) with a thin rail below it that spans the real start date to completion, or to today if still in progress. The filled part of the rail is the percent complete. Ideas not started yet are listed below as "Planned, not started" with a term-level horizon tag and no bar. This keeps the page's promise: no future end dates. Tap a bar to open its progress timeline. On narrow screens the chart scrolls sideways inside its own box.

You said, we did. Completed ideas grouped by month, newest first. "You said" (the idea) beside "We did" (the school response and completion date), plus counts of comments and progress updates.

Detail. Status pill, title, counts, then:

- Stage indicator and progress bar ("40% complete, school estimate").
- Latest school response (the newest public update).
- Progress timeline: a vertical list of updates, newest first. Each has a type pill (Started, Update, Milestone, Blocked, Completed), date, text, attached files, and the office that posted it plus the percent at that time. Staff-only updates show a "Staff only" pill and are visible only to staff.
- Follow button and link to the discussion.
- For staff: the update composer (section 4.4).

On wide screens the detail opens as a side panel. Below roughly 1100px it stays a dialog.

### 4.4 Staff update composer

Lives in the staff review screen in production. The mockup shows it inside the detail panel in Staff preview.

| Field | Required | Rules and why |
| --- | --- | --- |
| Update type | Yes | Started, Update, Milestone, Blocked, Completed. Drives the timeline pill and, for Started and Completed, the status change. |
| Progress | Yes | 0 to 100 in steps of 5. Completed forces 100. Public updates update the idea's percent. Decreasing needs a confirm, because students see it. |
| Description | Yes | 1 to 600 characters, plain language, public by default. Students read it. Show a live preview of how it appears. |
| Attachments | No | Up to 5 per update. See section 7 for formats, limits, and privacy. |
| Visibility | Yes, default Public | Public or Staff only. Staff-only updates and their files never reach the public page and never change the public percent. |
| Notify followers | Default on | On for Started, Milestone, Blocked, Completed. Off for a plain Update, so followers are not spammed. |
| Blocked reason | Required for Blocked | A short list: budget, parts or materials, approval, scheduling, other. Shown publicly as "Waiting on parts" and so on. |
| Next step | No | One short line ("Installation starts Monday"). Shown as a callout. Avoid dates the school cannot keep. |
| Date | Default today | Backdating up to 14 days allowed, never future. The true post time is stored separately. |
| Office label | Automatic | Shown instead of a personal name (for example "Facilities office"). Set per staff profile by an admin. |

Rules the server enforces in one transaction:

- Started: allowed on approved ideas. Moves status to `in_progress` and sets `started_at` the first time.
- Update and Milestone on an approved idea: also move it to `in_progress` (matches the mockup).
- Completed: moves status to `resolved`, sets `resolved_at`, sets progress to 100, and requires a description. A photo is strongly suggested (a "before and after" pair is ideal).
- Blocked: does not change the stage.
- Only moderators and admins can post. Every post records the author privately for audit.
- Edit window: the author can edit within 24 hours. After that, edits are allowed but show an "edited" mark. Delete is soft, with a reason, and visible to admins.
- Helpful extras worth adding: saved quick phrases for common updates, draft auto-save, and a reminder when an in-progress idea has had no update for 30 days.

### 4.5 Interaction and motion

All CSS, no libraries.

| Effect | Where | Timing |
| --- | --- | --- |
| Lift and shadow on hover | cards, stage tiles, chips, timeline cards | 200 ms |
| Arrow nudges right | card arrow, buttons | 200 ms |
| Dot travels along connector | hero, between stage tiles | 2.6 s loop |
| Pulse | In progress dot and pill | 1.9 s loop |
| Progress bars grow in | board cards, tree, detail | 0.8 s once |
| Bar animates to new value | after posting an update | 0.5 s |
| Chevron rotates | tree branch header | 250 ms |
| Panel slides in | detail panel | 400 ms |
| Close button rotates | detail panel | 250 ms |
| Press-down scale | vote, follow, CTA | 150 ms |

Wrap everything in `@media (prefers-reduced-motion: reduce)` and set `animation: none; transition: none`. No scroll-jacking, no parallax.

URL state: keep today's pattern. Add `view=tree|timeline|done` (and `board`). Keep `stage`, `category`, `search`, `page`. The selected idea stays a shareable item URL. Fold state for tree branches is local.

### 4.6 Visual system

Use existing tokens. Do not add a new palette, except four category stripe colors for the Timeline view (below).

| Role | Value | Source |
| --- | --- | --- |
| Ink | `#102a43` | `--ink` |
| Navy (hero, selected states) | `#0b3857` | `--navy` |
| Sky (response block, Planned pill) | `#e8f4fb` | `--sky` |
| Page background | `#f8fafc` | `--bg` |
| Line | `#d9e2ec` | `--line` |
| Stage dots | `#3b82f6`, `#f59e0b`, `#10b981` | roadmap status tokens |
| Today line | `#1d4ed8` | new |
| Category stripes (sample) | `#6d28d9`, `#0b6fb8`, `#2f8f3e`, `#c0451f` | new, assign per real category |
| Font | Inter 400 to 800 | already loaded |

Contrast changes to make in production (computed against white):

- `--accent` `#e86e4a` is about 3.1:1. Fine for decoration on navy, not for white text on a solid button. The mockup uses `#c0451f` (about 5.1:1).
- `--muted` `#627d98` is about 4.3:1. The mockup uses `#4a6580` for small text.
- Pill text colors in the mockup: Planned `#0b3857` on `#e8f4fb`, In progress `#8a5a00` on `#fff4dc`, Completed `#0b6b48` on `#e4f7ee`, Blocked `#9b1c1c` on `#fde8e8`. The existing `--warn` and `--success` are slightly under 4.5:1 on their tinted backgrounds.
- Category stripes are decoration only. Never rely on them to identify a category: the card always shows the category name.

Dark mode: `tokens.css` already has a `[data-theme="dark"]` block. Port the new classes to it. The mockup is light only.

### 4.7 Responsive behavior

- 1100px and up: side panel beside the view.
- Below 1100px: detail stays a dialog.
- Below 640px: stage tiles stack, connectors hide, hero title drops to 36px, board lanes stack, the Timeline chart scrolls sideways inside a bordered box, the composer fills the dialog.
- Staff entry links stay hidden at 800px and below, as the README states.

### 4.8 Accessibility

- Every interactive element is a real `<button>`, `<a>`, `<input>`, or `<textarea>` with a visible `<label>`. Cards use a title button with a stretched `::after` overlay. The vote button sits above it.
- Touch targets 44px minimum, including chips, range input, file remove buttons.
- Visible focus ring (`:focus-visible`, 3px).
- `aria-pressed` on view switch, chips, stage tiles, vote, follow, update type, visibility. `aria-expanded` on tree branches.
- Color is never the only signal: stage dots sit next to text, update types have text pills, blocked has a text label.
- The Timeline chart: each bar is a focusable button with the idea title, percent, and stage as its text. Provide a visually hidden list version for screen readers if the chart is not enough.
- Image attachments require alt text.

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
| Progress timeline in detail | 2 | new (today: single `staff_note`) |
| Staff update composer | 2 | new in staff review screen |
| Attachments on updates | 2 | new |
| Percent bars on cards and tree leaves | 2 | new |
| Blocked pill | 2 | new |
| Timeline (Gantt) view | 2 | new |
| Planned, not started with horizon tag | 3 | horizon is new |
| Vote button on cards | 3 | feed vote endpoint (to confirm) |
| Follow button, notifications | 3 | new |
| Desktop side panel | 3 | replaces dialog above 1100px |

### Phase 1: fix gaps (M to L)

Goal: real dates, grouped ideas, visible follow-through using what already exists.

1. Add `resolved_at` (S). New migration, for example `supabase/migrations/202610110001_roadmap_resolved_at.sql`. Add the column, backfill it, and update the transactional moderation function so it sets `resolved_at` when status becomes `resolved` and clears it if reopened. Apply it before deploying code, as the README requires.
2. Query and template (S). Add `resolved_at` to `publicColumns` and `publicItem` in `src/lib/roadmap.ts`. Order the Completed lane by `resolved_at` descending, then votes. Show "Completed Oct 2" on completed cards.
3. Fix date rendering (S). Pass `timeZone: 'Asia/Manila'` everywhere on the page and in detail JSON.
4. Recently completed strip (S). Top three by `resolved_at` above the board. Hide it when the stage filter is Completed.
5. Filters (S). Extend `roadmapFilters` so `view` accepts `board`, `tree`, `done`; map `list` to `tree`. Update `tests/roadmap-pagination.test.ts`.
6. Tree view (M). Group by category, up to 8 leaves per category with "View all in <category>" that sets the category filter. Counts stay exact.
7. You said, we did (M). Completed ideas grouped by month in `Asia/Manila`, 20 per page, ordered by `resolved_at`. Uses `staff_note` as "We did" until Phase 2 replaces it with the latest public update.
8. Hero tiles and chips (S). Keep search and the Apply behavior, or apply instantly with the existing `data-roadmap-state-link` pattern.
9. Client code (S). Extend `src/client/roadmap.ts` for the view switch and branch folding. Rebuild with `npm run build:client`.
10. CSS (M). Add the effects in section 4.5 to `public/css/modules/roadmap.css`, plus reduced motion and dark mode.
11. Preview harness (S). Update `tests/support/workspace-preview.ts` sample data.

Done when: completed cards show a true completion date, tree and You said, we did work with filters and shared URLs, old `view=list` links still load, tests pass.

### Phase 2: progress updates (L)

Goal: staff can post progress with evidence, and students see the full history.

1. Data (M). Add `idea_updates` and `idea_update_files` (section 6), plus `progress`, `started_at`, and `is_blocked` on `submissions`. Keep all of it behind a single transactional function (section 6) so status, percent, history, and notifications cannot drift apart.
2. Staff composer (M). Add the form from section 4.4 to the staff review screen. Live preview, validation, draft auto-save in browser storage, quick phrases.
3. File upload (M to L). Direct-to-storage uploads with signed URLs, client-side image resize, magic-byte check, alt text (section 7).
4. Public timeline in detail (M). Extend the public detail JSON with public updates only (newest first), with file metadata and short-lived file URLs. Keep the field whitelist. Detail dialog renders type pills, dates, text, files, office label.
5. Percent and blocked on cards (S). Slim progress bar on board cards and tree leaves for started work. Blocked pill when the latest public update is a blocker.
6. Timeline (Gantt) view (M). Bars from `started_at` to `resolved_at` or today. Rail fill is `progress`. Month scale fits the data (earliest start to end of next month). Today line. Planned ideas listed below without bars. Add month, quarter, and term zoom if needed.
7. You said, we did uses the latest public update as "We did" and shows the update count (S).
8. Stale reminder for staff (S). Flag in-progress ideas with no update in 30 days, using the same `Asia/Manila` logic as the overdue filter.
9. Tests and docs (M). See section 11.

Done when: a staff member can post an update with a photo in under a minute, students see it on the idea's timeline, percent and stage stay consistent, and staff-only updates never appear on public pages.

### Phase 3: engage (L)

Goal: students engage with items and hear back.

1. Vote from the roadmap (M). Reuse the feed's vote endpoint and auth modal. Confirm the endpoint in `src/routes/api.ts`.
2. Follow an idea (M). `idea_follows` table, endpoints, button state.
3. Notifications (L). In-app first, created by the same transactional function when a followed idea changes stage or gets a public update with "Notify followers" on. Add web push later through `src/sw.ts`. On iOS, push works only for an installed PWA.
4. School themes with goals (M). `roadmap_themes` table and `submissions.theme_id`. Four to six themes. Until then, category is the group.
5. Term-level horizons (S to M). Nullable `public_horizon` (`this_term`, `next_term`, `later`) set by staff, separate from the private target date. Shown on Planned items.
6. Desktop side panel (M). Side panel above 1100px, dialog below.

Done when: a signed-in student can vote and follow from the roadmap and gets a notification when a followed idea moves or gets a public update.

### Phase 4: build trust (M to L)

1. Public changelog page (M). For example `/roadmap/done`, stable URL, month anchors, RSS or Atom feed, optional monthly digest.
2. Not planned, with reasons (M, optional). Show declined ideas that have a public reason. Needs a school decision, a tone guide, and a toggle. Hidden by default.
3. Dependencies (S to M, optional). A "Waiting on" link from one idea to another, shown as text in detail. Connector lines like in your reference are possible in the Timeline view but add noise for a school audience, so start with text.
4. Metrics (S). Add roadmap metrics to the admin analytics page (section 10).

Done when: the changelog has a stable URL and the school has decided on declined ideas.

## 6. Proposed data changes

These are sketches. Names marked `<...>` must be confirmed against `supabase/migrations/202610100002_staff_feedback.sql` and `202610100003_staff_workspace.sql`, which were not in the zip.

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

update public.submissions set resolved_at = updated_at
where status = 'resolved' and resolved_at is null;

create index if not exists submissions_resolved_at_idx
  on public.submissions (resolved_at desc) where status = 'resolved';
```

Phase 2:

```sql
alter table public.submissions
  add column if not exists progress smallint not null default 0
    check (progress between 0 and 100),
  add column if not exists started_at timestamptz,
  add column if not exists is_blocked boolean not null default false;

create table public.idea_updates (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  kind text not null check (kind in ('started','update','milestone','blocked','completed')),
  body text not null check (char_length(body) between 1 and 600),
  progress smallint not null check (progress between 0 and 100),
  visibility text not null default 'public' check (visibility in ('public','staff')),
  blocked_reason text check (blocked_reason in ('budget','parts','approval','scheduling','other')),
  next_step text check (char_length(next_step) <= 200),
  occurred_on date not null default ((now() at time zone 'Asia/Manila')::date),
  office_label text not null,
  posted_by uuid not null references auth.users(id),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_reason text,
  created_at timestamptz not null default now(),
  check (kind <> 'blocked' or blocked_reason is not null)
);
create index idea_updates_submission_idx
  on public.idea_updates (submission_id, occurred_on desc, created_at desc)
  where deleted_at is null;
alter table public.idea_updates enable row level security;
-- no policies for anon or authenticated: server (service role) only

create table public.idea_update_files (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.idea_updates(id) on delete cascade,
  storage_path text not null,
  display_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  alt_text text,
  state text not null default 'pending' check (state in ('pending','ready')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  check (mime_type = 'application/pdf' or char_length(coalesce(alt_text, '')) > 0)
);
alter table public.idea_update_files enable row level security;
```

One transactional function, for example `post_idea_update(...)`, that:

1. Checks the actor is a moderator or admin.
2. Inserts the update and its file rows.
3. For public updates: sets `submissions.progress`, `is_blocked`, `started_at` (first time), and moves status per section 4.4 by calling the existing moderation logic so status history and `resolved_at` stay correct.
4. Writes notifications when "Notify followers" is on (Phase 3).
5. Rejects invalid combinations (Completed without text, Blocked without a reason, future dates, more than 5 files).

Phase 3:

```sql
create table public.idea_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);
alter table public.idea_follows enable row level security;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  update_id uuid references public.idea_updates(id) on delete set null,
  kind text not null check (kind in ('stage_changed','progress_update')),
  to_status text,
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

## 7. Files and uploads

- Allowed types: JPEG, PNG, WebP, PDF. No SVG, HTML, Office files, or archives.
- Limits: 5 files per update, 10 MB each.
- Where uploads happen: Vercel serverless request bodies are limited to about 4.5 MB (verify against current Vercel docs), so do not send files through Express. Use Supabase Storage signed upload URLs so the browser uploads directly. Check the page's Content Security Policy `connect-src` allows the Supabase storage origin.
- Client-side image resize: before upload, draw the image to a canvas at up to 1600px on the long edge and re-encode. This keeps files small and removes EXIF data including GPS location.
- Server checks after upload: confirm size and sniff the file's first bytes against the declared type before marking the file `ready`. Files stay `pending` and invisible until then.
- Storage: one private bucket (for example `idea-updates`), path `<submission_id>/<update_id>/<file_id>.<ext>`. Never use original file names in paths.
- Reading files: students get files through short-lived signed URLs issued only for public updates. Staff-only updates' files are never signed for public requests. Do not cache signed URLs in the service worker.
- Alt text is required for images and shown in the timeline.
- Photo guidance in the composer: no student faces, names, ID cards, or screens with personal data. Consider an optional blur tool later.
- Cleanup: deleting an idea or update removes its files. Run a periodic job for orphaned `pending` files older than 24 hours.

## 8. Code map

| Area | File | Change |
| --- | --- | --- |
| Filters and queries | `src/lib/roadmap.ts` | `view` values, `resolved_at`, `progress`, `started_at`, update list, tree and timeline loaders |
| Route | `src/routes/roadmap.ts` | pass new data to the template, keep page-overflow redirect |
| Template | `views/roadmap.eta` | hero tiles, chips, four views, progress timeline in detail |
| Client | `src/client/roadmap.ts` | view switch, branch folding, Timeline chart, detail rendering |
| Styles | `public/css/modules/roadmap.css`, `tokens.css` | effects, contrast fixes, dark mode |
| Staff screen | `src/lib/staff-workspace.ts`, admin views | update composer, upload flow, stale filter |
| Uploads | new route and helpers | signed upload URLs, file state, signed read URLs |
| Service worker | `src/sw.ts` | keep roadmap detail JSON and signed URLs uncached, push later |
| Tests | `tests/roadmap-pagination.test.ts`, `tests/templates.test.ts`, `tests/support/workspace-preview.ts` | see section 11 |

## 9. Security and privacy

- Keep the public field whitelist. New public columns (`resolved_at`, `started_at`, `progress`, `is_blocked`, update fields) are added to `publicColumns` explicitly. Never `select('*')`.
- Staff-only updates and their files never reach public queries. Filter by `visibility = 'public'` and `deleted_at is null` in one shared helper so every public path uses it.
- Show an office label, never a personal staff name. Keep `posted_by` private for audit.
- Private target dates, assignments, priorities, and internal notes never appear on this page. `public_horizon` is a separate field for that reason.
- New tables are service-role only with RLS on and no browser policies, like the other private tables.
- Rate-limit post, upload-URL, vote, and follow endpoints with the existing `express-rate-limit`.
- Notifications may contain only public data: idea title, new stage, public update text. Never internal notes.
- Escape all update text on render. Never render it as HTML.
- Opt-in only for notifications. Make unfollow one tap.
- Student privacy in photos: guidance in the composer, EXIF stripped, review habit for staff.
- The zip included a `.env` file. Do not share the archive; rotate any real keys it contains.

## 10. Measuring success

Use the existing admin analytics page. Track:

- Share of published ideas with at least one public update.
- Median days from approved to started, and from started to completed.
- Median days between public updates on in-progress ideas (target: under 30).
- Ideas in progress with no update in 30 days (should fall after the stale reminder ships).
- Share of completed ideas with a photo.
- Roadmap visits, share that open a detail, and use of each view.
- Staff time to post an update (sample a few posts; target under a minute).
- Follow rate and notification open rate (Phase 3).

Set targets only after a few weeks of baseline data.

## 11. Testing

Existing tests use the Node test runner with mocked auth and database. Add:

- `roadmapFilters`: accepts `tree`, `timeline`, `done`, maps `list` to `tree`, rejects unknown values to `board`.
- Completed ordering by `resolved_at`, with ties broken by votes.
- Month grouping in `Asia/Manila`, including an item completed at 00:30 on the first of a month.
- Tree counts stay exact when search, category, and stage filters apply.
- `post_idea_update`: status transitions per section 4.4, progress bounds, Blocked requires a reason, Completed requires text, future dates rejected, non-staff rejected, more than 5 files rejected.
- Public queries never return staff-only updates, deleted updates, or `pending` files, and the public detail JSON still excludes private fields.
- Staff-only update does not change public percent or status.
- Timeline chart data: bar start, end, and percent for in-progress and completed items, today line position, planned items without bars.
- Template tests: `aria-pressed` and `aria-expanded` states, labels on all form fields, alt text on images.
- Upload helpers: type allow-list, size limits, magic-byte check, path never includes the original file name.
- Phase 3: follow is idempotent, one notification per follower per eligible update.
- Manual: keyboard-only pass, screen reader pass, 390px and 1440px widths, reduced motion on, dark mode, a real photo upload from a phone.

## 12. Rollout and rollback

1. Test migrations in a staging Supabase project first, including the backfill.
2. Apply each migration to production before deploying the code that reads it.
3. Ship Phase 1 with the board as the default view. Other views are opt-in by tapping the switch.
4. Ship Phase 2 staff-first: staff can post updates for a week before the public timeline is shown, so the first posts are reviewed and the guidance is tested.
5. Watch error logs and the analytics page for a week after each phase.
6. Roll back by redeploying previous code. Migrations are additive and can stay.
7. Phase 3 notifications: ship in-app first, then web push.

## 13. Risks

- Staff may not keep updates current. Keep the form short, add quick phrases and the 30-day reminder, and report update cadence to the admin.
- Percent complete can feel like a promise. Label it "School estimate" and let staff change it freely.
- Photos can expose students. Use guidance, EXIF stripping, and staff review. Consider restricting uploads to staff only (already the case).
- Uploads add storage cost and abuse surface. Limit types and sizes, rate-limit, and clean up orphans.
- The Timeline chart is the most complex view on mobile. Keep it a scrollable box and make sure Board and Tree remain the primary views.
- Backfilled `resolved_at` and `started_at` for old items may be approximate. Accept it or mark them approximate.
- Notifications can feel noisy. Default off for plain updates.
- Publishing declined ideas can discourage students. Make it optional and tone-guided.

## 14. Open questions

1. What are the real category names and how many are there? The mockup uses sample names and stripe colors.
2. What are the status history table, moderation function, and staff profile table names?
3. Is there already an upload, follow, bookmark, or notification feature elsewhere in the app?
4. Which staff roles may post updates: moderators and admins only?
5. How should office labels be assigned: per staff profile set by an admin?
6. Should Tree replace List, or should both stay?
7. What terms does the school use (semesters, quarters, trimesters) for horizon labels and Timeline zoom?
8. Does the school want declined ideas public?
9. Which notification channel first: in-app, email, or web push?
10. Should dependencies between ideas be shown at all?
