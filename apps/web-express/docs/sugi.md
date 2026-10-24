# Sugi · SuggFeed Help

Sugi answers from reviewed FAQs on the desktop/mobile website. It cannot read private records, file reports, change memberships, reset accounts or make decisions. Expo and the retained Next.js app are not new feature targets.

## Locations

- Home screen: bottom-right **Ask Sugi** launcher with a custom navy/orange logo. It opens a compact keyboard-accessible help panel and stays above mobile navigation. No JavaScript falls back to the full Help page.
- `/help`: public app help; available before school selection.
- `/s/{school}/help`: app help plus that school's published FAQ, behind existing school/publication/access checks.
- School administration → **Sugi knowledge & review** (`/s/{school}/admin/assistant`): school FAQ drafts, reviewed publishing, history, gaps, negative ratings and aggregate usage.
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

The FAQ works without these values. Missing HMAC/database controls prevents provider calls and new feedback/logging, while high-confidence local FAQ answers still work. After verifying the actual Gemini project, supported free-tier model, region and provider data-handling terms, set `ASSISTANT_AI_ENABLED=true` and redeploy. Enable `ASSISTANT_LOGGING_ENABLED=true` only after approving retention with school staff. Neither flag activates paid billing or a paid fallback, and the app cannot inspect your billing settings automatically.

`src/lib/assistant/config.ts` owns model (`gemini-2.5-flash-lite`, must be verified before activation), 300-character input, 200 output tokens, provider/storage timeouts, one retry, 24-hour cache/capability expiry, 14-day logs, quotas, 100 provider calls/day and two concurrent calls. These are application ceilings, not statements about the provider's current allowance. The SDK's default retries are disabled; only the controlled retry can spend another daily budget unit. Quota/circuit/provider failures return FAQ/contact fallback.

The direct dependency is `@google/genai` **2.31.0**. There is no second AI SDK, retrieval service or embedding system. Native mobile/private-record tools remain disabled; changing a flag alone does not enable them. `tools.ts` deliberately exposes an empty registry.

### Request routing

Use `POST /help/ask` and `POST /help/feedback` (automatically school-scoped inside a school). The `/api/assistant/*` aliases remain for compatible hosts, but Vercel reserves the global `/api/*` namespace for filesystem functions in this project. The canonical Help paths avoid that collision without changing unrelated deployment routing.

## Edit knowledge

App knowledge and initial fictional demo seed:

- `knowledge/assistant/app.md`
- `knowledge/assistant/schools/*.md`
- `knowledge/assistant/manifest.json` maps approved school UUIDs to fixed filenames.

Each Markdown FAQ section has a JSON data block: stable ID, `published`/`placeholder`, English/Filipino/Taglish questions and answers, approved keywords and an internal route. Keep all three translations accurate. Mark unknown office hours/contact details as placeholders, never invent them. Placeholder entries are excluded from runtime data. Only approved general instructions are included initially; demo knowledge is explicitly fictional.

After review, change the Markdown version and run `npm run build:knowledge`. A content digest also prevents stale cache reuse if someone forgets to bump the version. The build generates `src/lib/assistant/knowledge.generated.json` and the public offline FAQ from the same input. The generated public knowledge version also refreshes the service-worker cache key, keeping offline FAQs in step with published content. Do not edit generated output directly. School contacts display from existing approved school settings outside the model; fictional demo contacts do not appear as monitored support channels.

### School-admin FAQ editor

School admins with current MFA can add up to 30 FAQs in the Sugi dashboard. Select an institutional topic: school profile, admissions, academics, services, policies, schedules, contacts or student life. Enter an English, Filipino and Taglish question and reviewed answer; add alternate phrasings and simple topic keywords to improve matching. Keep official contact addresses in answers, not keywords. The editor loads the current draft; the initial fictional demo FAQ can seed its first draft.

**Save draft** does not change live answers. Review all facts/translations, confirm the review checkbox and choose **Publish reviewed FAQs**. Publication retains an immutable snapshot, increases the school knowledge version and immediately changes subsequent questions. Existing open conversations keep their already displayed answers. A stale revision rejects the change and preserves entered text; explicitly load the latest draft before editing again. Remove an FAQ from a new draft and publish to withdraw it; publishing an empty collection withdraws all school answers. History shows previous version metadata; restoration is not included.

After first publication, database versions are authoritative for that school, including an empty published collection. Source-file school FAQs are only an initial seed/fallback before a database publication. A failed knowledge lookup returns app-only help, never stale school facts. School drafts and history require an active school admin; students only receive published answers. Public school workspaces can expose their published institutional FAQs to guests under the existing publication policy. No private student records belong here.

App FAQ changes continue through reviewed source commits/deployment. School facts publish directly from the school dashboard; a deployment is unnecessary. Global platform operators cannot edit school facts by pretending to be a school admin. Feedback never edits knowledge automatically. The review queue's copied Markdown placeholder is a starting point for human review, not published content.

Questions such as “what’s this app?” now match the app overview locally. School scope comes from the verified current workspace, not a guessed school name or the student email. A school category organizes its reviewed entries; matching chooses one of those entries. Unknown facts remain unknown. Topic/language filters on Help let students browse exact reviewed answers.

## Privacy and selection

Normalizing arbitrary prose is not anonymization. Original questions exist only in transient request memory and the current browser page. Only allowlisted FAQ terms, published candidate questions/categories/keywords and controlled examples can reach Gemini. School answer bodies are not sent to the selector. Obvious personal/secret/instruction-changing input is refused locally. Unknown logs store safe topic tokens or `unknown`, not original questions. Logs contain no user IDs, emails, names, IPs, conversations or submitted case details. This intentionally limits the detail of the unanswered-question queue.

Gemini returns an authorized FAQ ID or unknown. The server verifies it and displays the exact reviewed translation; arbitrary generated prose/HTML never becomes an answer. Cache entries are checked against current reviewed answers and keyed by school, knowledge digest, locale and policy. Misclassification remains possible; uncertain queries should use fallback rather than be presented as facts.

The capability for feedback is a random response token held only in the current page. The database stores its HMAC, scopes it to a request, checks expiry and accepts the first rating only. A guessed request ID or another school's token cannot change a rating. Browser table access is denied; admin reads and mutations use a service-only RPC with explicit current admin/operator checks, plus existing MFA at the HTTP boundary. The global/scoped assistant RPC is separate from the tenant dispatcher because global public help has no school; it still validates school access and roles independently.

## Schema and retention

Apply `202610240004_information_assistant.sql` before deploying the new endpoints. It adds only assistant-owned cache, minimal logs, capability, budget, concurrency and circuit records; no accounts or existing submissions are reset. Existing security maintenance cron also cleans expired assistant records. Monitor its `more` status and repeat incomplete batches. Rollback SQL is in `docs/rollback/202610240004_information_assistant.sql`; deploy the previous code (including removal of the assistant cleanup hook) and export approved records before removing the schema. Rollback deletes assistant history and must not run automatically.

Apply additive `202610240005_school_assistant_knowledge.sql` for the school editor. It creates school draft/revision state, immutable published snapshots and a service-only RPC. Save/publish validate scope and fresh admin membership; HTTP also enforces MFA and origin checks. Publishing locks the school state, rejects stale revisions, and changes the published pointer atomically. No accounts, policies, memberships or existing content are altered. Snapshot history is retained until an explicit data-retention/deletion process is introduced. Editing does not change school activation or policy approval.

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
- All 15 focused assistant tests passed, including school draft isolation, MFA/role/origin boundaries, stale revisions, immutable publication and runtime scoped answers. Focused tests cover reviewed selection/refusal, school cache/version isolation, own-request feedback, role restrictions, quota/circuit behavior, retention and strict migration ownership.
- Full suite: 323 passed, 29 known failures; failure names match the recorded baseline with no new failures.
- School-editor fixtures passed save/reload/publish/conflict retention and category filtering at 320/360/375/390/430/768/1440px with no page overflow or script errors.
- Browser fixtures: Help/admin/public FAQ at seven widths (320–1440), home panel at eight viewport/landscape sizes, dark/reduced-motion/focus restoration, no-JavaScript FAQ, and actual service-worker offline navigation passed.
- Real phone keyboards, assistive technology, Gemini project/free-tier eligibility and live model responses remain unverified.
