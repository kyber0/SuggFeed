# Comment moderation

## Defaults and scope

Comments are checked on the server using **obscenity 0.4.6**, its English dataset
and recommended transformers, plus a bounded Filipino dictionary. No remote
moderation API or paid service is used. English/Tagalog/Taglish word detection is
a heuristic; it does not infer intent, threats, sarcasm or every dialect/slang.

`apps/web-express/src/lib/content-safety-config.ts` owns the settings;
`comment-moderation-config.ts` is its compatibility export:

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
private even if its words pass detection. Approval resolves outstanding reports. The revision upgrade below changes
report uniqueness to one report per account per text revision.

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

## Revision-aware comment review upgrade — 25 October 2026

Migration `202610250003_comment_review_revisions.sql` was applied transactionally
to the configured project. The migration registry and columns were re-read;
the demo school's active queue also completed a read-only database request.
No hosted comments were created, edited, reported, approved, hidden or deleted.

### Detection

Comment creation/editing uses `assessComment`, which returns the disposition,
reason (`clear`, `dictionary`, or `detector_unavailable`), rule group IDs and
version. The original text is retained. `commentWordGroups` in
`comment-moderation-words.ts` owns the new comment dictionary. Increment
`commentDictionaryVersion` for a dictionary release. Short words use boundaries;
ambiguous standalone terms such as Boba/Gaga are omitted, with selected abusive
phrases included instead. English whitelists remain enabled. Bounded
letter-by-letter normalization does not concatenate arbitrary complete words.

The legacy `hasProfanity`/`commentVerdict` exports remain unchanged for existing
callers and the submission safety pipeline. Changing comment rules does not
change idea submission filtering. No historical profanity sweep is performed.
Rule groups are review clues, not a confidence score or evidence of intent.

### Revisions and reports

`version` is the concurrency token: edits, new reports and review decisions
advance it. `text_revision` advances only when saved text actually changes.
No-op edits do not reopen decisions. Reports store `comment_revision` and have a
unique school/comment/text-revision/reporter index. Admin approval does not
make unchanged text reportable again. A genuine author edit does.

Reports against earlier revisions remain identifiable. Editing with unresolved
reports holds the replacement text until review. Reports cannot target stale
text revisions, and owners cannot report their own comments. Current school
membership, existing shared write budgets and community rate limits still apply.
The report threshold remains server-owned and defaults to three distinct
reporters. Duplicate reports do not advance the moderation token.

Every review requires both the moderation token and text revision. A new report
invalidates an already-open review. Review changes, report resolutions, visible
counts, audit metadata and private author notices commit together.

### Student experience

The idea page and drawer load **My pending comments** through a separate,
uncached, authenticated owner RPC. Private text never enters the public comment
API or its cache. The panel shows the latest 50 pending comments on that idea,
with compact revision controls. Anonymous cookie possession still grants no
owner editing or private-history access. Preview mode skips private lookups.

Edit conflicts keep the draft. Authors can load the latest saved revision,
compare it, and deliberately save again. A finalized hidden/deleted comment
cannot be edited. Successfully published revisions update the visible discussion
and its local counts. Network errors preserve the editor.

School updates displays the latest 50 private comment-review notices. Notice
read actions are owner-only. Review explanations are also shown to reporters;
administrators are explicitly told not to identify reporters in the reason.
No email or external moderation provider is introduced.

### Admin workflow and retained data

Follow-ups → Comment review has Needs review, Reported and Resolved views.
Reported and Needs review can overlap: a reported comment may already be held.
The main navigation badge counts distinct active comments. Resolved hidden
comments stay out of active work; an admin may reconsider a non-deleted decision.
Context contains up to 30 reports, 10 retained text revisions and 10 decisions.
Older audit records remain retained; the UI does not claim these limits are the
complete history. Detector failures are labeled separately from language matches.

`comment_text_revisions` stores the initial captured text and subsequent saved
revisions with tenant ownership and no direct client access. Pre-upgrade edits
cannot be reconstructed. Both new tables cascade when the parent comment is
removed by retention. Admin Delete clears all revision bodies and leaves the
existing hidden tombstone so replies and audit references survive.
`comment_review_notices` stores only decisions/reasons, not comment bodies.

### Deployment and verification limits

Deploy the matching application after the migration. Older application
instances safely hold writes without the new assessment metadata; old report
or review screens must refresh to obtain revision fields. Reverting application
code alone is not a complete rollback: keep the matching database workflow and
prefer a forward fix rather than dropping reports, snapshots or audit history.

Type checking, focused moderation lint, production compilation and Eta template
compilation passed for this upgrade. Synthetic mobile/desktop design inspection
used invented content. Automated tests were not added or run in this turn;
concurrent write behavior, physical devices and the final hosted deployment
remain unverified. Detection remains heuristic, with human review required for
context, quotation, slang and false positives.

## Staff portal navigation

The canonical review screen is now `/s/{school}/admin/safety?section=comments`.
Needs review, Reported and Resolved retain their existing service and database
workflow. Old `/admin/community?section=comments` links redirect while preserving
comment view and page. The portal reorganization introduces no moderation schema
or permission changes.
