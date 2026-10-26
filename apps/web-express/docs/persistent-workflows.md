# Persistent workflows

This implementation applies to `apps/web-express`. The Next.js and standalone
Expo apps are retired; their removal does not change the workflows described here.

## Setup and release

Use Node 22.x and install from the existing lockfile with `npm ci --workspaces=false --include=dev`.
Run `npm run typecheck`, `npm test`, and `npm run build`. For machines with limited
resources, after building browser assets and checking test types, run the same
Node suite with two workers:

```sh
npm run build:client
npx tsc -p tsconfig.tests.json
node -r ts-node/register/transpile-only --test --test-concurrency=2 tests/*.test.ts
```

Review and apply the following forward migrations in a **separate staging
project**, after `202610130010_guided_workflows.sql`, before running this build
against that project:

1. `202610130011_student_saved_searches.sql`
2. `202610130012_submission_receipts.sql`
3. `202610130013_digest_controls.sql`
4. `202610130014_public_submission_history.sql`

The environment credentials were confirmed to be production credentials, so
validation remains local. No migrations, test records, emails or deployments
were applied to production. These schema changes remain unapplied by this task.
Staging acceptance must verify real concurrent submissions and search creation,
owner-scoped saved-search access, account changes, public-history withdrawal,
receipt recovery after response loss, digest pause/type changes, and unsubscribe.
The existing email sender verification and scheduler configuration are still
required; this change does not enable or schedule email delivery.

The new submission endpoint requires a receipt ID and current browser/account
context. Updated pages request the context first. Old open tabs receive a reload
message instead of performing an unsafe write; preserve any draft text before
reloading an old page. HTML success flows use HTTP 303, while JSON APIs retain
structured responses. Successful unsubscribe redirects to a token-free GET.

## State and privacy

Applied feed filters and pagination stay in URLs. Unsupported query values are
normalized to public defaults. Saved searches contain only sort, category, search,
and following scope, with pagination restarting at one. They never enable alerts.
Signed-in users can create, rename and remove up to ten account-owned searches.
Guest searches are saved explicitly on the current device. Saved views appear as
compact cards with filter chips and a current-view marker. A short, cancellable
save form and an on-demand rename form keep management controls out of the way.
Duplicate views are recognized, the ten-search count stays visible, and uncertain
account writes require a reload before retrying. Theme preferences use
versioned, validated storage with an in-memory fallback. The roadmap remembers an
explicitly chosen layout and offers it on a default visit; shared URL state wins.

The submit panel retains unfinished text in memory when closed. Device recovery
is opt-in and stores only submission text, category and anonymity choice for
seven days. Expired records are purged on the next storage access. Attachments,
private replies, staff notes, session credentials and raw tracking codes are not
included. Turning off draft recovery removes its saved draft; queued items have
separate Remove controls. Browser storage failures are shown rather than treated
as successful saves.

Tracking codes are no longer saved silently. Users can copy a code, explicitly
remember it on their device, or clear previously saved codes. Existing saved codes
are preserved until deliberately cleared. Modern tracking requests send codes in
POST bodies; logs redact codes from legacy GET requests as well as query strings.

## Submission receipts and queue

The context endpoint issues a random HttpOnly, SameSite cookie before writes.
The server hashes the private device cookie with the verified account context;
the browser receives only an opaque comparison value. The atomic database RPC
binds an operation UUID to that owner and the normalized payload fingerprint.
Replays return the same submission. Changed content cannot reuse a receipt.
Failed inserts roll back the receipt and submission together.

An anonymous tracking code is reconstructed with HMAC using the private device
cookie, account context and operation ID. Only its hash enters the submission
row. Receipts contain no draft text, plaintext cookie, account ID or raw tracking
code. Recovery works for thirty days in the original browser and sign-in state.
Minimal receipt tombstones remain after deletion/expiry to prevent recreation;
review their long-term storage cost as part of the school's retention policy.
Clearing browser cookies loses anonymous receipt recovery, so copy the code to a
safe place after success.

The IndexedDB queue stores at most ten ideas for seven days. Repeated queue clicks
reuse the same item. Sending requires explicit user action and a fresh account
context. Reconnection never sends automatically. Interrupted sends become Needs
attention; users can check a receipt before retrying. Named submissions require
the original signed-in account, and guest anonymous submissions require the
original signed-out state. Terminal validation errors leave editable drafts;
ambiguous outcomes retain receipt metadata in session storage. All server checks
and existing rate limits apply again at send time.

## History, email and staff workflows

Public history shows actual recorded status transitions and authorized progress
updates, including recorded time and separately labelled work dates. Its database
projection excludes notes, staff identities and private states and refuses an
unpublished parent. Existing public responses remain visible in idea details.
No historical events or dates are invented. Loading errors provide retry controls.

Weekly digest preferences now offer event-type selection and indefinite pause
until resumed. The delivery worker rechecks current opt-in, pause and selected
types immediately before transport. Weekly email summarizes eligible in-app
notifications on currently followed public ideas; in-app update mode affects the
available notifications. A displayed Monday window is a scheduler window in
Asia/Manila, not a promised delivery time. Existing unsubscribe, provider
idempotency and uncertain-delivery handling remain in force.

Review pages offer personal queue presets and shortcut help alongside existing
saved-view controls. The board explains selection, atomic bulk conflicts and
recovery. Existing role checks and optimistic versions remain authoritative.
Public history is corrected with new events; merges still require audit review
and an explicit operator recovery instead of a fabricated undo action.

## Browser checks

The documented fixture can exercise the interfaces without database writes:

```sh
node -r ts-node/register/transpile-only tests/support/workspace-preview.ts
# In another terminal (Python Playwright + system Chromium required):
python tests/browser/persistence.py
python tests/browser/saved-searches.py
```

The browser checks use local API fixtures and real Chromium/IndexedDB. HTTP tests
exercise the actual production routes, and PGlite tests execute the real
migrations. These checks do not establish hosted Supabase, real multi-session
lock contention, or email delivery readiness. No hosted credentials are used in
the test fixtures.
