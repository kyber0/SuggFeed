# Sugi · SuggFeed Help

Sugi writes concise answers grounded in shared app guides and the current school’s approved sources on desktop/mobile web. Exact reviewed FAQs remain an offline/provider-failure fallback. It cannot read private records, file reports, change memberships, reset accounts or make decisions. Expo and the retained Next.js app are not new feature targets.

## Locations

- Home screen: bottom-right **Ask Sugi** launcher with a custom navy/orange logo. It opens a compact keyboard-accessible help panel and stays above mobile navigation. No JavaScript falls back to the full Help page.
- `/help`: public app help; available before school selection.
- `/s/{school}/help`: app help plus that school's published FAQ, behind existing school/publication/access checks.
- School administration → **Sugi knowledge & review** (`/s/{school}/admin/assistant`): school documents, reviewed publishing, optional FAQ drafts, history, gaps, negative ratings and aggregate usage.
- Platform dashboard → **Sugi review** tab: app-wide help analytics only. Operators are not given school membership.
- `/help-faq.html`: generated public, multilingual FAQ; pre-cached for offline help.

The Help page renders its FAQ without JavaScript. School content is never persistently cached for offline access. Answers render as plain text; reviewed route links are allowlisted. No conversation history is saved to localStorage or the database.

## Secrets and activation

Existing hosting/database configuration remains in use. Add server-only values securely:

```
GEMINI_API_KEY=<existing restricted Gemini API key>
ASSISTANT_HMAC_SECRET=<new random secret of at least 32 characters>
ASSISTANT_AI_ENABLED=false
ASSISTANT_LOGGING_ENABLED=false
```

Do not commit values, use public prefixes, or paste keys into support conversations. `.env*` is ignored; `.env.example` is intentionally tracked. The separate HMAC secret protects stored topic/IP/account fingerprints and feedback capabilities. Rotation invalidates older feedback capabilities/cache keys and restarts the corresponding HMAC quota namespace; schedule it deliberately rather than on every deploy.

Exact FAQs work without these values; flexible answers require them. Missing HMAC/database controls prevents provider calls and new feedback/logging, while high-confidence local FAQ answers still work. After verifying the actual Gemini project, supported free-tier model, region and provider data-handling terms, set `ASSISTANT_AI_ENABLED=true` and redeploy. Enable `ASSISTANT_LOGGING_ENABLED=true` only after approving retention with school staff. Neither flag activates paid billing or a paid fallback, and the app cannot inspect your billing settings automatically.

`src/lib/assistant/config.ts` owns model (`gemini-2.5-flash-lite`, must be verified before activation), 300-character input, 600 output tokens, provider/storage timeouts, one retry, 24-hour cache/capability expiry, 14-day logs, quotas, 100 provider calls/day and two concurrent calls. These are application ceilings, not statements about the provider's current allowance. The SDK's default retries are disabled; only the controlled retry can spend another daily budget unit. Quota/circuit/provider failures return FAQ/contact fallback.

Direct dependencies are `@google/genai` **2.31.0** and free local PDF extractor `unpdf` **1.9.1** (Node 22+). There is no second AI SDK, retrieval service or embedding system. Native mobile/private-record tools remain disabled; changing a flag alone does not enable them. `tools.ts` deliberately exposes an empty registry.

### Request routing

Use `POST /help/ask` and `POST /help/feedback` (automatically school-scoped inside a school). The `/api/assistant/*` aliases remain for compatible hosts, but Vercel reserves the global `/api/*` namespace for filesystem functions in this project. The canonical Help paths avoid that collision without changing unrelated deployment routing.

## Edit knowledge

App knowledge and initial fictional demo seed:

- `knowledge/assistant/app.md`
- `knowledge/assistant/schools/*.md`
- `knowledge/assistant/manifest.json` maps approved school UUIDs to fixed filenames.

Each Markdown FAQ section has a JSON data block: stable ID, `published`/`placeholder`, English/Filipino/Taglish questions and answers, approved keywords and an internal route. Keep all three translations accurate. Mark unknown office hours/contact details as placeholders, never invent them. Placeholder entries are excluded from runtime data. Only approved general instructions are included initially; demo knowledge is explicitly fictional.

After review, change the Markdown version and run `npm run build:knowledge`. A content digest also prevents stale cache reuse if someone forgets to bump the version. The build generates `src/lib/assistant/knowledge.generated.json` and the public offline FAQ from the same input. The generated public knowledge version also refreshes the service-worker cache key, keeping offline FAQs in step with published content. Do not edit generated output directly. School contacts display from existing approved school settings outside the model; fictional demo contacts do not appear as monitored support channels.

### School knowledge: information once, many questions

Open school administration → **Sugi knowledge & review → School knowledge**. Add a titled block of institutional information, or upload a readable PDF, UTF-8 text or Markdown document. Review the extracted text, save the draft, confirm review and publish. No question variants or translations are required. Sugi can respond in English, Filipino or Taglish from supported source information. Exact-answer FAQs remain an optional collapsed editor, with their existing translation requirements.

Limits: 12 documents, 60,000 characters each, 240 KB total text. Uploads are at most 2 MB; PDFs allow 100 pages, an 8-second worker timeout and a worker heap limit. Two extractions per process and 10 per school admin/hour are allowed. Scanned, encrypted, oversized or malformed PDFs need a readable text version. Binaries are not retained; only extracted text is saved. There is no OCR, arbitrary URL ingestion, vector database or embedding service.

Saving keeps the published version unchanged. Publishing advances the revision atomically and retains an immutable snapshot. Stale revisions reject writes and preserve typed text. Remove a document and publish to withdraw it; an empty collection withdraws all custom documents. Already displayed answers remain until cleared. History shows metadata; restoration UI is not included. Documents do not alter activation or policy approval.

`knowledge/assistant/guide.md` is the shared reviewed app guide. `build:knowledge` generates its JSON; changes use source review/deployment. School settings supply current school identity, notices, monitored contacts, eligibility, visibility and retention from currently approved rows. Current published customization supplies school welcome text, feature availability, categories, submission requirements and progress labels; drafts are excluded. School document publishing needs no deployment. Unknown facts, private records and other schools are not sources.

## Privacy and selection

Original questions and up to two previous help questions exist only in request memory and the current browser page. When AI is enabled, questions and selected approved excerpts are sent to Gemini; the student interface discloses this. Obvious secrets, personal identifiers and instruction-changing input are refused locally; this is not comprehensive PII detection. Do not submit private details. Safe-topic logs retain only existing allowlisted FAQ terms or `unknown`, never questions, source bodies, generated prose, identities or conversation history.

The server determines the school from verified workspace context. A service-only RPC returns only that school's published documents and approved settings; drafts require current school-admin access and MFA. The model cannot choose another school, browse or execute tools. Local lexical ranking selects up to eight bounded excerpts. This lightweight retrieval has limited semantic recall; clearer source text can help. Source instructions are untrusted data.

Gemini returns plain text, an unknown flag and source IDs. The server rejects missing/foreign citations, oversized output and malformed responses. Links use server-owned IDs and point to the protected Help page; model-provided URLs/HTML are never rendered. Unknown/provider failures use reviewed help/contact fallback. Exact FAQ matches work without AI. Generated prose is never cached: new generations recheck access and sources. Existing quotas, concurrency leases, retry limits and circuit breaker remain enforced.

Citations show the supplied evidence; they do not prove every generated sentence is logically supported. Hallucinations remain possible, so students should check official sources. No model can reliably answer unpublished school facts. Server data isolation prevents loading other schools' records; prompt instructions supplement that boundary.

The capability for feedback is a random response token held only in the current page. The database stores its HMAC, scopes it to a request, checks expiry and accepts the first rating only. A guessed request ID or another school's token cannot change a rating. Browser table access is denied; admin reads and mutations use a service-only RPC with explicit current admin/operator checks, plus existing MFA at the HTTP boundary. The global/scoped assistant RPC is separate from the tenant dispatcher because global public help has no school; it still validates school access and roles independently.

## Schema and retention

Apply `202610240004_information_assistant.sql` before deploying the new endpoints. It adds only assistant-owned cache, minimal logs, capability, budget, concurrency and circuit records; no accounts or existing submissions are reset. Existing security maintenance cron also cleans expired assistant records. Monitor its `more` status and repeat incomplete batches. Rollback SQL is in `docs/rollback/202610240004_information_assistant.sql`; deploy the previous code (including removal of the assistant cleanup hook) and export approved records before removing the schema. Rollback deletes assistant history and must not run automatically.

Apply additive `202610240005_school_assistant_knowledge.sql` for the school editor. It creates school draft/revision state, immutable published snapshots and a service-only RPC. Save/publish validate scope and fresh admin membership; HTTP also enforces MFA and origin checks. Publishing locks the school state, rejects stale revisions, and changes the published pointer atomically. No accounts, policies, memberships or existing content are altered. Snapshot history is retained until an explicit data-retention/deletion process is introduced. Editing does not change school activation or policy approval.

Apply additive `202610240006_grounded_assistant_documents.sql` for document drafts, immutable publication history, scoped service-only operations, extraction quotas and reviewed-settings reads. It does not change accounts, memberships, policies or existing FAQs. History is retained: export it before deliberate rollback/deletion. Never run destructive rollback automatically.

Usage statistics count recorded requests (not all FAQ page reads). Cache rate is cached answers / recorded requests. Fallback rate is unanswered requests / recorded requests; locally matched reviewed answers do not count as unanswered. Retention affects the observable window. A daily bin is a UTC date. Gaps and negative ratings are independently limited to 25 per page.

## Verification and evaluation

Run from `apps/web-express`:

```
npm run typecheck
npm run lint:assistant
npm run build
node -r ts-node/register/transpile-only --test tests/assistant-*.test.ts
node -r ts-node/register/transpile-only scripts/eval-assistant.ts --mock
```

The 48-case evaluation includes translated known questions, unknown organizational facts, off-topic text, prompt injection and sensitive input. Mocked evaluation makes no Gemini call. Live endpoint evaluation is manual, refuses CI, and requires `ASSISTANT_EVAL_ORIGIN` plus `--allow-endpoint`; it states its request count before authorization. Existing per-IP/account limits still apply, so run live cases in smaller selected batches or across quota windows rather than weakening production limits. No live model evaluation is claimed without that run.

Check at 320/360/375/390/430/768/1440px, landscape, light/dark, large text, keyboard, no JavaScript and offline. Use invented fixtures only. The repository had 29 known baseline test failures before this feature; compare names, not just totals, and do not report the full suite as green until those are resolved separately.

## School/operator TODO

- Approve real school FAQ content and all translations.
- Supply monitored school contact information through existing reviewed settings.
- Confirm retention and approve safe-topic collection.
- Confirm free-model/project eligibility and provider terms before enabling AI.
- Run actual device/assistive-technology and optional live-model acceptance checks.

## Logo assets

Custom generated source: `assets/sugi/logo-source.png` at repository root. Production uses optimized transparent WebP marks at `public/branding/sugi/mark-160.webp` and `mark-320.webp`. The logo keeps SuggFeed navy/orange and uses a white medallion for contrast in dark mode.

## Release verification

- Type checking, focused assistant lint and production build passed.
- 48 mocked evaluation cases passed; no live Gemini call was made.
- All 22 focused assistant tests passed, including school draft isolation, MFA/role/origin boundaries, stale revisions, immutable publication and runtime scoped answers. Focused tests cover reviewed selection/refusal, school cache/version isolation, own-request feedback, role restrictions, quota/circuit behavior, retention and strict migration ownership.
- Full suite: 330 passed, 29 known failures; failure names match the recorded baseline with no new failures.
- School-editor fixtures passed save/reload/publish/conflict retention and category filtering at 320/360/375/390/430/768/1440px with no page overflow or script errors.
- Browser fixtures: Help/admin/public FAQ at seven widths (320–1440), home panel at eight viewport/landscape sizes, dark/reduced-motion/focus restoration, no-JavaScript FAQ, and actual service-worker offline navigation passed.
- Real phone keyboards, assistive technology, Gemini project/free-tier eligibility and live model responses remain unverified.

### Grounded-answer verification

Checks include school isolation, private drafts, revisions, withdrawal, immutable history, role/MFA/origin boundaries, extraction quotas, actual PDF extraction, binary/size rejection, invented citations, provider failure and no generated-prose cache. Browser fixtures cover editing, upload preview, save/reload/publish/conflict retention, source navigation and citations at 320/360/375/390/430/768/1440px plus landscape. Live model validation is recorded separately; mocks do not establish model accuracy.
