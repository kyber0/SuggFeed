# Comment moderation

## Defaults and scope

Comments are checked on the server using **obscenity 0.4.6**, its English dataset
and recommended transformers, plus a bounded Filipino dictionary. No remote
moderation API or paid service is used. English/Tagalog/Taglish word detection is
a heuristic; it does not infer intent, threats, sarcasm or every dialect/slang.

`apps/web-express/src/lib/comment-moderation-config.ts` owns both settings:

```ts
{mode: 'flag', reportThreshold: 3}
```

- `flag`: save detected comments privately for school-admin review.
- `reject`: return 422 with a respectful revision message; the client keeps the draft.
- Detector failure always holds the comment privately, including in reject mode.
  Logs contain a fixed error identifier, never the comment or matched term.
- Report threshold must be 1–100. The server supplies it to the restricted RPC;
  browser payloads cannot override it. A changed threshold is evaluated on the
  next report rather than retroactively sweeping every comment.

The existing 10–500 character limit, anonymous posting, school feature controls,
CSRF checks and shared write budgets remain. Creation also retains the comment
write limiter; editing and reporting use the existing community limiter. Owners
must be signed in and retain current school membership to edit. Anonymous cookie
possession does not grant edit authority. Hidden/deleted comments cannot be
edited by their owner; admins decide whether they return to discussion.

## Dictionary maintenance

Edit `src/lib/comment-moderation-words.ts`. Entries are Obscenity patterns, not
raw JavaScript regular expressions. Use `|word|` for a whole-word term, especially
short words. Add explicit inflections rather than an unbounded substring rule.
`[text]` is optional pattern syntax. Keep ambiguous ordinary vocabulary out unless
a specific phrase is appropriate. Add positive and innocent-word tests alongside
each dictionary change, then rebuild/redeploy.

The matcher applies NFKC normalization, removes invisible format characters,
handles letter-by-letter spelling and inserted punctuation, and normalizes
exaggerated repetitions. It avoids joining ordinary complete words across spaces.
The English dataset's whitelists remain in force. New slang and contextual false
positives still need human review; keep the default hold mode for school use.

## Storage and review

Migration: `supabase/migrations/202610240001_comment_moderation.sql`.

- Adds `moderation_status`, `version`, `edited_at`, and `reviewed_at` to comments.
- Reuses `reports` and adds an explicit school/comment/reporter unique index.
- Registers the restricted, school-scoped `comment_action` RPC.
- Counts unresolved distinct reports under a comment row lock and auto-hides at
  the threshold. Duplicate reports never increment the count.
- Adds a security-invoker review view and a paginated **Follow-ups → Comment
  review** section for school admins. Moderators retain suggestion reports and
  other follow-ups but cannot review comment content or use older resolve paths.
- Keeps the existing `is_hidden` field consistent and counts only visible comments.
- Blocks unchecked text updates. Legacy inserts during rolling deployment are
  held privately, even if a caller tries to set their status to published.

Approve, hide and delete require fresh school-admin authority and an expected
comment version. Decisions resolve open reports and create an audit event.
**Delete erases the comment body and keeps a hidden tombstone**, preserving reply
foreign keys and the audit record. Published replies to hidden parents are shown
as top-level comments; hidden ancestor text is not sent to public readers.

An owner edit is rechecked before saving. An edit with outstanding reports remains
private even if its words pass detection. Approval clears the outstanding reports;
a reporter cannot report that same comment again, including after later edits,
because the product rule is one report per account per comment.

## Routes

- Existing `POST /api/comments/:submissionId`: moderated creation.
- `POST /api/community/comments/:id/edit`: owner-only editing with `body`, `version`.
- Existing `POST /api/community/report`: uses the atomic comment-report operation.
- `POST /api/community/staff/comment-review`: admin decision with ID, expected
  version, decision and review reason. All routes retain the school's URL prefix.

Native and dynamic comment rendering escape content. Inline editing uses DOM
text nodes; pending text is never appended to public discussion from a success
response. No client-side detector is authoritative.

## Rollout and checks

Apply the migration before deploying the matching server code. Existing visible
comments retain their current status; existing hidden comments remain hidden.
No retroactive profanity sweep is performed. During the rolling interval, older
server instances can insert only held comments; only the new service can publish
checked text. Do not remove the old report guards to troubleshoot deployment.

Checks include detector, direct HTTP create/edit, service, tenant database and
complete-schema migration tests, plus existing community regressions. Typecheck,
focused moderation lint, production build and frozen lockfile validation are run.
Local browser checks cover edit/save/hold, preserved drafts on errors, mobile
admin review, and escaped hostile markup. No real user comments are generated by
these tests.

The full suite has **29 pre-existing failures**, reproduced on unchanged `main`
(`c7afef5`) with the same failing test names and no additional failures in the
moderation tree. These include outdated UI assertions and incomplete browser
mocks (`document.querySelector` / `performance`). They are not changed by this
feature. Full-suite green status is therefore not claimed.

Delivery: migration `202610240001` was applied to the configured Supabase project
on 24 October 2026. Its presence was re-read after the transaction committed.
The final focused run passed **31 tests**. Hosted user comments were not created,
edited, reported or deleted for testing. Real-device testing and confirmation of
the matching Vercel deployment remain outstanding.

## Compact discussion interface

The idea page and drawer share compact comment bubbles, avatar-connected reply
rails, timestamps/Reply below the bubble and a three-dot options disclosure.
Report and owner-only Edit stay in that disclosure. Inline editing uses one
initial textarea row, grows to 160px, and keeps Save/Cancel inside the bubble.
Escape cancels; Ctrl/Command+Enter saves. Network/validation failures preserve the
entered text. Pending-review comments retain the existing private-review flow.
On narrow phones, the options control moves to the metadata row to preserve text
width. New drawer replies enter the same reply group used by loaded comments.

Local Chromium inspection covered 320, 375, 768 and desktop widths, light/dark
mode, menu visibility, save and Escape cancellation, with no page overflow or
JavaScript errors in the fictional fixture. Typecheck, focused lint and build
passed. No automated suite was run for this interface-only follow-up; the
previously documented full-suite baseline and real-device limitations still apply.
