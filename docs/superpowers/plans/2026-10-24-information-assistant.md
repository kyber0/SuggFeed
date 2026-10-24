# SuggFeed information assistant implementation plan

**Status:** implementing the confirmed plan. Later user instruction adds a home-screen launcher and custom Sugi logo.
**Goal:** add dependable English/Filipino/Taglish help, backed by reviewed FAQ content, without access to private submissions or automatic learning.
**Architecture:** Express/Eta owns the help page and server API. PostgreSQL owns durable quotas, school isolation, cache and feedback. Static reviewed FAQs remain available independently of Gemini.
**Stack:** current TypeScript, Eta, modular CSS, Supabase tenant dispatcher, Node 22 and existing test tools. Only proposed dependency: server-only `@google/genai`.
**Spec:** uploaded `Pasted text.txt` (information-only AI assistant); discovery adapts its assumed Next.js/Expo stack to the actual repository.

## 1. Discovery findings

- Production: `apps/web-express`, Express/Eta, TypeScript, modular CSS, classic browser scripts, PWA service worker, Vercel serverless.
- `apps/web` is a retained Next.js compatibility/reference app, explicitly not a feature-parity target.
- Expo is retired and removed from workspace declarations and dependency graph. See `docs/expo-retirement.md`.
- Root tooling: pnpm 9.15/Turborepo. Express deploys independently using `npm ci --workspaces=false --include=dev` and its own package lock.
- `packages/shared/src/submission.ts` exists without a package manifest. There is no existing assistant package or Gemini dependency.
- Sessions use Supabase-verified identity; school roles are fresh scoped memberships. Platform operators have separate permissions. Privileged school/platform areas require existing MFA.
- SQL tenant RPCs run through the service-only dispatcher and `tenant_executor`; browser clients must not receive service credentials.
- Existing shared write/IP budgets, school resolution, verified contacts, controls, accessibility tokens and authenticated maintenance cron can be reused.
- `.env*` is ignored; `.env.example` is explicitly allowed. No new secret values go in source or browser bundles.
- Current full-suite baseline: 29 known failures. Record the exact names before implementation; no new failures are acceptable, and do not describe this baseline as green.

## 2. Confirmed direction

1. Desktop and mobile web only; do not restore Expo.
2. SuggFeed usage help plus school-specific FAQs reviewed by school administrators.
3. Display exact reviewed FAQ answers; Gemini may select entries but does not write new answer prose.

The recommended implementation below follows these choices. Gemini remains optional; local matching and static FAQs are the dependable baseline.

## 3. Safety and cost boundaries

- Information only: no submission/report creation, moderation, membership changes, account recovery actions or school activation.
- No private-record tools in the first release. Keep the tool registry empty and the feature flag off; enabling it requires a separate design and authorization review.
- Never infer school membership from a question. School context comes from trusted routing and current access checks.
- No conversations, tracking codes, account IDs, emails, full names, case descriptions or submission text go to Gemini or assistant logs.
- Normalization is not anonymization. Strict mode derives allowlisted public FAQ terms/intent tokens locally; only those controlled tokens and approved FAQ candidates can be sent to Gemini. Keep the original question only in transient request memory and the current browser session. Reject clear sensitive inputs locally with a safe, fixed help message.
- Unknown questions are logged as bounded safe topic tokens/canonical templates, not arbitrary normalized free text. This reduces the detail available to administrators; it is the trade-off required for a strong privacy promise. No automated detector can guarantee arbitrary prose contains no personal information.
- Gemini returns a structured FAQ ID or `unknown`, not unrestricted answer prose. Validate the ID against the current authorized candidate list. The server displays the exact reviewed answer and its source/version; never display model-generated text as an official fact.
- Ambiguous/missing knowledge means a fixed localized contact response. Do not claim that an AI selector cannot select the wrong FAQ; low-confidence cases fall back.
- Free-tier operation is bounded, not unlimited: provider/project/model availability and data-handling terms must be checked before enabling. No automatic billing activation, paid fallback model or extra provider.
- Existing hosting/database free allowances are not an assurance of unlimited zero-cost operation. Add durable global daily provider budgets, concurrency leases and a circuit breaker alongside per-account/IP quotas. When exhausted, serve FAQ only.

## 4. Knowledge and publication

### Source

Use versioned Markdown with machine-validated metadata and stable IDs:

```
version: 1
scope: app | school:<uuid>
faq_id: submit-idea
language: en | fil | taglish
status: published | placeholder
question: ...
answer: ...
source_route: ...
keywords: ...
```

Keep an application FAQ plus separate explicitly reviewed school FAQ files. Filenames resolve from an allowlisted manifest, never a request-supplied filesystem path. An entry's three language variants share one stable ID.

Cover submission, tracking, joining a school, invitations, account help, progress stages, reporting, office contacts and role-specific navigation. Verify each app instruction against real routes. School facts, office hours and escalation details are placeholders until supplied; placeholder entries cannot be presented as published facts.

Use build-generated JSON for both server and browser. Validate unique IDs, length limits, supported locales, HTTPS/approved internal links, placeholder markers and version changes. Include a content digest so accidentally retaining a version string cannot reuse stale answers.

### Human review loop

Feedback creates review candidates only. Admins group unanswered topics and negative ratings, mark them reviewed, and copy an escaped Markdown draft. School admins can review their own school's topics; operators handle app-wide content. Publishing still requires reviewing the source Markdown, tests and deployment. There is no automatic write-back, retraining or user text appended to the system prompt.

Contact buttons resolve from the existing approved school contacts/platform privacy configuration. Contact details are UI actions outside the model, not invented answer content. Missing/unmonitored placeholders must not produce a working-looking fake contact button.

## 5. Proposed module layout

Because there is one active application and Vercel performs a standalone app install, start with an equivalent portable core inside the Express app. Do not add a workspace package that the deployed build cannot resolve. If a second active app is introduced later, move this portable core into `packages/assistant` only after proving shared package compilation, dependency resolution and Vercel packaging.

```
apps/web-express/
  knowledge/assistant/app.md
  knowledge/assistant/schools/<approved-id>.md
  knowledge/assistant/manifest.json
  src/lib/assistant/
    config.ts
    types.ts
    knowledge.ts
    normalize.ts
    prompt.ts
    provider.ts
    cache.ts
    limits.ts
    log.ts
    feedback.ts
    service.ts
  src/routes/assistant.ts
  src/routes/assistant-admin.ts
  src/client/assistant.ts
  src/client/assistant-admin.ts
  views/assistant.eta
  views/assistant-admin.eta
  public/css/modules/assistant.css
  scripts/build-assistant.cjs
  scripts/eval-assistant.ts
  eval/assistant/questions.json
  tests/assistant-*.test.ts
```

Keep the core independent of Express, DOM and server credentials. Server HMAC helpers stay server-only. Browser assets receive only reviewed published FAQ content and public limits, never the prompt, credentials, protected school content or provider configuration.

Modify only necessary integration points: `server.ts`, help/menu and admin tab partials, focused build/style scripts, strict browser config, app `package.json`/lock, `.env.example`, `src/sw.ts`, existing authenticated security-maintenance handler, and Vercel include files if generated knowledge is not already covered. Generate outputs through build scripts.

## 6. Database design

Create the next ordered additive migration at implementation time. Scope every record with school ID or an explicit platform namespace; never let nullable school IDs accidentally share private records.

| Record | Fields and guarantees |
| --- | --- |
| `assistant_cache` | scope, question HMAC, knowledge version/digest, locale, policy version, FAQ ID, exact answer, expiry. Unique across all key dimensions. Server-only. |
| `assistant_log` | opaque request ID, scope, safe canonical question/topic, matched FAQ ID, answered, source (`cache`/`ai`/`fallback`), rating, knowledge version, timestamp, review state. No account or raw question. |
| `assistant_request_capabilities` | request ID, random feedback capability hash, expiry, consumed flag. Separate from analytics, short-lived, server-only. |
| `assistant_rate_limit` | keyed HMAC of account/IP scope, operation, window, count/lease expiry. No raw IPs or account IDs; bounded retention. |

HMAC keys prevent stored question/IP hashes from serving as simple lookup fingerprints. Requests are counted before cache lookup. Separate quotas cover ask, feedback, global provider calls and concurrent provider calls. Acquire/reserve atomically to prevent serverless races.

Default retention proposal: logs 14 days, feedback capabilities 24 hours, cache 24 hours, quota rows two days after expiry. School confirmation is required before enabling logs; use the existing cron rather than requiring pg_cron availability. Cleanup must also remove expired cache/capability/lease rows in bounded batches.

All browser direct table access is denied. Own-request feedback goes through a capability-validated server/RPC operation, not unrestricted anonymous INSERT. School admin aggregate/read RPCs check fresh admin role; platform data requires operator authorization. Include school-isolation, anonymous ownership and revoked-role tests.

Provide documented rollback SQL outside the forward migration directory. First disable endpoints, then remove only assistant-owned objects. Export requested history before destructive rollback; never drop existing application data.

## 7. Request contracts and pipeline

Routes:

- Global help: `GET /help`, `POST /help/ask`, `POST /help/feedback`.
- School help: `GET /s/:schoolSlug/help`, corresponding scoped APIs after school resolution.
- Admin tab: `/s/:schoolSlug/admin/assistant`; operator tab `/platform/assistant`.

Mount global routes before the legacy school-selection redirect; school routes remain behind existing school/publication/membership rules. Preserve platform/client shell boundaries.

Ask pipeline:

1. Feature/access check; validate plain string, maximum 300 Unicode code points, empty/control input and body size. No HTML handling or arbitrary URLs.
2. Consume durable account and hashed-IP quotas. Obtain a safe bounded topic representation; do not store/send the original text.
3. Load authorized published knowledge. Include locale, scope, knowledge digest and policy version in the cache key.
4. Return eligible cached reviewed answer.
5. Use direct local FAQ matching for exact/high-confidence known questions. Ambiguous selection can optionally use Gemini with allowlisted candidate IDs/approved terms only.
6. Reserve global provider budget and concurrency slot. Lazy-load server-only `@google/genai`; config owns the currently verified free-tier Flash-Lite model ID. Never allow a request to override model/system instructions.
7. Bound the total deadline (proposal: six seconds) and output (200 tokens). At most one jittered retry for retryable transport/5xx errors while time remains; no retry on 429, invalid credentials or policy failures. Release leases safely.
8. Validate structured selection and display the exact authorized answer. Unknown/invalid output gives localized fallback FAQ/contact actions.
9. Record only safe bounded metadata and allocate a random feedback capability. A logging failure must not turn a valid FAQ answer into an error.

All responses are structured and expose no provider errors, prompts, model name or secrets. Private school responses use `Cache-Control: private, no-store`. Timeout, missing key, provider outage, quota outage and feature-off paths preserve static help. A database outage bypasses Gemini rather than issuing unmetered calls.

Feedback requires request ID plus an unpredictable capability from that response, current school access where relevant, same-origin protections and its own quota. Atomic first rating wins; repeats are idempotent and cannot affect another request. The client holds the capability in memory, not in URLs or persistent conversation storage.

## 8. UI and offline behavior

Keep the dedicated **Help** page and add the user-requested bottom-right home-screen launcher with a custom Sugi logo. The launcher opens a compact accessible help dialog, sits above mobile navigation, and falls back to the Help page without JavaScript. Reuse existing SuggFeed controls, tokens and school theme.

- Welcome/empty state with 4–6 reviewed question chips.
- Labeled input and send control; clear 300-character limit.
- Immediate pending feedback, one request in flight, cancel/timeout recovery preserving the question.
- Plain-text reviewed answers, source/topic label, thumbs up/down, contact action.
- Screen-reader live region; focus remains predictable; Enter/send and multiline behavior documented.
- Always available FAQ section generated from the same entries; no JavaScript still shows a usable FAQ.
- No Markdown/HTML renderer dependency; exact text and controlled links suffice.
- Respect safe areas, keyboard resize, 44px controls and reduced motion. Test 320/360/375/390/430/768/1440 and mobile landscape/large text.
- No persistent full chat history. Browser-visible questions clear with the page/session; explicit reset available.

Only app-wide public FAQ assets may be persistently cached for offline help. Never store private school pages, admin responses, capabilities or answers in shared service-worker caches. Restricted school information requires renewed access online. Offline messaging explains that a global public FAQ remains available; it does not promise offline account status.

## 9. Admin review and analytics

Use tabs within the existing dashboard, rather than a new separate application:

- Overview: daily requests, cache-hit rate, AI selection rate, fallback rate with definitions and time range.
- Knowledge gaps: grouped safe topic/canonical question, frequency, locale, knowledge version, last occurrence.
- Negative feedback: approved answer ID/version plus safe topic, without users or full conversations.
- Review: mark reviewed, copy escaped Markdown draft; no automatic publication.

Database aggregates operate before pagination. Handle empty, loading, failure, retry and changed data states. School admins see only their school; operators do not silently acquire school membership or read another school's private help data through a client route.

## 10. Configuration and secrets

One config owns input/output limits, cache/retention, locales, provider model, timeouts/retry policy, per-user/IP/global quotas and feature switches. Proposed conservative pilot defaults:

| Control | Initial value |
| --- | --- |
| Question | 300 Unicode code points |
| Provider output | 200 tokens; structured FAQ selection only |
| Total provider deadline | 6 seconds |
| Transport/5xx retry | At most 1, within total deadline |
| Ask quota | 10/account and 30/hashed IP per 10 minutes |
| Global provider budget | 100 calls/day, including retries |
| Provider concurrency | 2 active calls |
| Feedback quota | 30/hashed IP per 10 minutes |
| Cache | 24 hours, plus knowledge/policy invalidation |
| Logs | 14 days, subject to school approval |
| Capability | 24 hours; one rating |

These are application safety limits, not representations of Gemini's current free-tier allowance. Exact limits can be lowered after checking the actual free project quota. Start disabled for production, AI disabled unless configured; FAQ remains usable.

New server-only variables: `GEMINI_API_KEY`; separate `ASSISTANT_HMAC_SECRET` for private fingerprints/capabilities. Document random generation and rotation. Do not use `NEXT_PUBLIC_`/`EXPO_PUBLIC_` names. Restrict key/project to intended API; do not activate billing. Actual free-model availability, provider terms and region restrictions must be verified before activation. No live calls are needed for development tests.

## 11. Implementation phases and verification gates

1. **Reviewed knowledge and portable core:** validated Markdown loader/build output, fixed localized fallbacks, examples, normalization, strict privacy representation. Test placeholders, invalid files, links, locales and content digests.
2. **Storage and permissions:** cache/log/capability/budget migration, retention, rollback and role/isolation/race tests. Prove standalone app packaging before provider integration.
3. **Backend and provider:** ask pipeline, official SDK adapter with mocks, deadlines/budget/circuit breaker. Test no personal/raw content reaches the mock provider or persistence, unknown/injection refusal, version invalidation, outage and database-down fallback.
4. **Feedback:** capability ownership, expiry, first-write uniqueness, access revocation and abuse limits.
5. **Responsive web help:** accessible states, FAQ-only/no-JS/offline behavior, theme/shell correctness and mobile viewport matrix.
6. **Admin review:** aggregate analytics, gap/negative-rating queues, Markdown copy/export, admin/operator boundaries and no automatic learning.
7. **Evaluation and rollout:** at least 30 English/Filipino/Taglish known/unknown/off-topic/injection/privacy questions with expected FAQ IDs/refusal points; run deterministic mocked tests normally. Endpoint evaluation is manual; live Gemini evaluation requires explicit opt-in and a stated call budget, never CI.

At each phase: focused unit/HTTP/database tests, affected type checking/lint and production build; compare full-suite failure names to the recorded baseline. Browser console/overflow checks use synthetic fixtures only. Do not silently fix unrelated test failures or claim untested real-device behavior.

Pilot with fictional demo knowledge first. Apply validated additive migrations before deploying endpoints, keeping provider flags off. Confirm the live FAQ and authorization boundaries, then explicitly enable the provider for the pilot. Expand only after reviewed questions, quota behavior and privacy controls meet acceptance checks. Disabling AI must leave FAQ/help operational.

## 12. Open items and limitations

- Staff must supply real FAQ content/contact details and approve retention/provider data handling.
- Free-tier availability and existing hosting allowances are finite and may change; fallback is the zero-provider-call path.
- Exact reviewed answers constrain hallucination but can still be selected incorrectly; ambiguous requests must fall back.
- Strong privacy means incomplete unknown-question logs and no full conversation history.
- No private-record tools, restored Expo, external retrieval, embeddings, automatic learning or arbitrary Markdown execution in the recommended first release.
- Implementation was authorized after planning. See `apps/web-express/docs/sugi.md` for operating instructions and verification.

## Execution notes

- Name: Sugi. User subsequently requested a home-screen bottom-right launcher with a custom logo; this supersedes the original dedicated-page-only entry recommendation.
- Ruling: use the portable Express core rather than introduce an unused workspace package; the deployed app installs independently and Expo remains retired.
- Original free-form questions never enter Gemini, cache or logs. The model can select only approved candidate IDs. No private-record tools were added.
- Provider and safe-topic logging flags stay off by default pending free-project and retention confirmation. No live Gemini quota has been used by development tests.
- Added a generated navy/orange Sugi mark, optimized WebP renditions, an accessible native-dialog home panel, and a no-JavaScript link to the full Help page.

- Deployment ruling: Vercel intercepts the global `/api/*` namespace in this project. Canonical Sugi requests use `/help/ask` and `/help/feedback`; existing deployment rewrites remain untouched.

## Approved follow-up: school-admin FAQ editor

User approved dashboard editing/publishing of reviewed school facts. Implemented bounded categories, multilingual questions/answers and aliases, optimistic draft revisions, explicit reviewed publication and immutable version history via migration 202610240005. App FAQ remains source-controlled; school publication is independent of policies and school activation. School scope is trusted workspace context; private drafts never enter student knowledge or model input. No automatic fact generation, external school crawling, answer editing by feedback, or version restoration UI.
