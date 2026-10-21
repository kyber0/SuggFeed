# Platform insights and interaction feedback

## Analytics scope

The school-admin overview and super-admin overview are separate. The platform overview now queries `platform_overview_analytics(actor, days)` for 7/30/90-day reporting:

- Workspace counts by status across the entire service, independent of directory pagination.
- Membership records marked active in active schools (not unique people or online users).
- Ideas received per Philippine calendar day and a previous-window comparison when that window is nonempty.
- Current aggregate idea statuses across all schools.

Demo records are included and the current calendar day is partial. No student identities, content, school drafts or email addresses are returned by this RPC. The verified server operator/MFA guard and a fresh database operator check both apply. Execution is restricted to `service_role`; browser roles and `tenant_executor` cannot execute it. Migration: `202610210006_platform_overview_analytics.sql`.

School management remains available if the insights call fails, with a retry state in the overview. Charts share their presentation and client interactions with the school overview. No extra animation/chart dependencies are installed.

## Cursors

Enabled buttons, links, native disclosure summaries and button-like controls use the native pointing hand. Drag targets use `grab`, then `grabbing` while held or dragged. Pointer cancellation, release, drop, drag end and window blur clear the held state. Existing move-arrow overrides were removed from staff cards, timelines and studio reorder controls. The decorative cursor follower is suppressed over draggable content. Native cursor artwork follows the operating system; there are no cursor image downloads.

## Request and navigation feedback

The shared `interaction-feedback` script is mounted once in the normal layout and standalone customization editor. It provides:

- Button/link spinners and a thin page progress indicator after a 120 ms delay, avoiding flicker for quick actions.
- A counter for concurrent requests from the same control and cleanup on success, error, cancellation and page restoration.
- Duplicate activation prevention while a control has pending work.
- Native GET/POST form feedback without disabling successful form controls or changing submitted values.
- Normal same-origin navigation feedback; fragment-only changes, downloads and new-tab actions are excluded.
- Reduced-motion fallbacks and preserved fixed/sticky control positioning, focus and accessible labels.

`window.fetch` is decorated once to associate requests started in the current user-event turn with that event's control. It forwards the original arguments, response and errors; it does not read request headers, add retries or inspect credentials. Background requests without a current interaction do not activate controls. Fetch feedback ends when response headers arrive; application-specific processing or work started in a later task can use the explicit API:

```ts
const finish = window.sfFeedback?.pending(button);
try { await delayedWork(); } finally { finish?.(); }
```

`window.sfFeedback.reset()` clears owned visual state, including cancellation of the existing navigation loader. It does not claim that a server write was cancelled.

## Release checks

Typechecking, the production build, local responsive views at 320/375/768/1440 px, delayed-request feedback, native form values and cursor states were inspected. The live aggregate was read in a database read-only transaction. No automated test suite, real-device cursor inspection, invitation sends or live membership changes were run.

### Manage Work drag cursors

Mouse dragging uses pointer capture after a 6px movement threshold.
The resolved closed-hand asset is held on the document for the whole drag, so
entering another lane or its controls cannot change its fill or outline. The source card
shows an open hand at rest; the document keeps the native closed hand during a drag,
including over lane controls. Forbidden transitions show an unavailable destination
border and message without invoking the browser's blocked drag cursor. Valid drops
open the existing review form; they do not save a stage change directly.

Escape, pointer cancellation, window blur and page departure clear the drag state.
Ordinary links and form controls keep their existing click behavior. Stage menus
remain available for keyboard and touch input; native non-mouse dragging retains
the existing guarded fallback. Native cursor appearance depends on the operating
system; no downloaded cursor image is used.

### School hand colors

In Customize workspace, select **Colors & theme**, then set **Cursor** under
Light appearance and Dark appearance. Each field has a color picker, hex entry
and reset. Save the draft, inspect the preview, then publish to apply it to the
school's student and staff screens. Other schools and the platform dashboard
retain their own appearance.

The theme supplies compact inline SVG pointing/open/closed hands with solid black
outlines and native cursor fallbacks. Schools without a published design also use brand light-blue/orange hand
colors (`#dbeafe`, light `--sky-2`; `#f97316`, dark `--accent` in tokens.css).
Saved school cursor overrides are retained; the Cursor reset control restores
these brand defaults into a draft for preview and publication. Touch and forced-colors modes keep
native cursors. Operating systems may use their own cursor during native file or
section dragging; Manage Work mouse dragging uses the themed closed hand.

Migration `202610210007_school_cursor_colors.sql` allows the optional `cursor`
color in each appearance; it preserves all other database validation and does
not publish drafts or change permissions.

### Home idea vote state

The home route reads saved votes only for the currently displayed ideas, scoped
by school and the verified account or existing anonymous voter cookie. It renders
`aria-pressed` and the selected button class directly and uses a private,
non-stored response so one visitor's selection cannot enter a shared page cache.
Home votes also update the existing school-scoped device hint after the API
confirms success. Browser storage failures cannot undo a recorded vote. Pending
requests prevent repeated clicks; failed requests restore the previous count and
selection. The server remains authoritative on refresh.

### Removing support

Click a selected support button again to remove your vote. Home, feed, roadmap,
standalone idea details and the idea drawer send explicit `up` / `unvote` requests
to the same endpoint. The endpoint uses the existing serialized `set_idea_vote`
function with `vote` / `unvote`, never a blind toggle: repeating a removal cannot
restore support. School and voter identity come from the existing verified
context and cookie, not browser-supplied account IDs. Removing support is allowed
when new voting is disabled; the database still enforces school access.

Successful responses synchronize visible counts and the existing device hint;
selected controls expose “Undo your support.” Pending requests disable the
control, failures retain or restore its previous state, and the home route reads
the saved state from the database on refresh. No schema migration is needed.

### Selected group moves on Manage Work

Select up to 25 ideas, then drag one selected card. The preview shows a stacked
bundle, the total count and up to three titles; visible selected source cards
are dimmed together. An unselected card still drags alone. Destinations are
available only when every selected snapshot supports that transition. The Move
menu on a selected card uses the same group review for keyboard interaction.

Dropping a group opens individual reviews with fresh server details. Save the
required work action for one idea, then choose Next idea. Completion evidence,
reopening confirmation, permissions and optimistic concurrency remain enforced
by the existing per-idea workflow. An incompatible/stale idea can be skipped.
The queue shows per-idea results and can be stopped; each save is independent,
so stopping does not undo earlier saves. Successful moves are removed from the checkbox
selection; skipped and unreviewed selections remain. Confirmed receipt retries
also mark their move saved, without issuing a second mutation. No database or
bulk status endpoint is added.
