# SuggFeed: Philippine school release register

> 2026-10-18 update: the shared-school schema is now hosted (45 migrations). The [hosted verification record](../operations/2026-10-18-hosted-isolation-verification.md) supersedes earlier pending technical-check notes below for its measured scope. Only the fictional demo is cleared for synthetic evaluation. Real-school business identity, institutional approvals, monitored contacts, and remaining operational checks stay open.


**Assessment date:** 2026-10-15. **Release status: NOT CLEARED.** This is an engineering assessment and implementation guide, not a legal opinion or certification. Current official texts and applicability need review by the adopting school's DPO/legal adviser. The user clarified that this is a generic product available to schools, not a deployment for a named school.

## Deployment boundary and responsibilities

**Confirmed target: one shared service where many schools sign up.** The existing hosted deployment has not yet received the staged school tenant boundary. School signup must remain unavailable until the implemented shared-school isolation plan is deployed and verified. Never put unrelated schools into this database expecting global role checks to isolate them. Isolation must cover database, storage, clients, Edge Functions, caches, jobs, backups and provider support access. Existing records are confirmed demo data: preserve them in a dedicated demo school during the reviewed backfill, never in a new customer school.

See `docs/superpowers/plans/2026-10-15-shared-school-isolation.md` for the separate architectural workstream. No tenant migration is applied by this security foundation change.

The user clarified that SuggFeed is their own project for CSPC and other schools to adopt. CSPC is not established as the platform operator. The actual operator name and permission to publish a privacy mailbox remain unconfirmed. The school may be the personal information controller for school feedback. The product provider may be a processor for that service and a separate controller for its own billing/support/security purposes. Determine roles from actual decisions and contracts; branding and a checkbox do not establish legal roles. Establish a processing agreement covering instructions, subprocessors, incident assistance, return/deletion and termination before processing school data.

No school's name, DPO, approval, privacy address, retention period or legal basis is assumed. A configured operator name and email are not proof of authority or that the mailbox is monitored. A generic demo should use synthetic data until its own operator and notices are established.

## Research status and legal applicability

Attempts to retrieve NPC and Lawphil texts in this session failed with HTTP 403 / proxy denial. The links below are reference starting points, **not freshly verified citations**. Verify the current versions, amendments, NPC circulars and sector-specific rules before relying on this register. Do not advertise “RA compliant” based on this document.

| Instrument | Relevance and required review | Evidence needed for release |
|---|---|---|
| [RA 10173, Data Privacy Act](https://privacy.gov.ph/data-privacy-act/), especially ss. 11–13, 16, 20–21, and [IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/) | Transparency, legitimate purpose, proportionality, lawful grounds, sensitive information, rights, security and accountability. Educational/health information may be sensitive even when voluntarily entered in free text. Anonymity mode does not exempt service logs or identifiable content. | Processing inventory; purpose/lawful-ground assessment per category and operation; PIA; accurate notice; rights channel; organizational, physical and technical safeguards; vendor assessment. Consent is not automatically the correct or only basis. |
| NPC issuances on registration, security, breach management and children's data | DPO designation and registration applicability must be assessed under current rules; not every deployment has identical registration duties. NPC Circular 2022-04 and Circular 16-03 are starting references to verify, including later amendments. | DPO/contact; registration determination and records where applicable; incident register; breach decision procedure. |
| [RA 10175, Cybercrime Prevention Act](https://lawphil.net/statutes/repacts/ra2012/ra_10175_2012.html) | Illegal access/interference and unlawful online conduct; not a product certification or authority to inspect users indiscriminately. | Least privilege, abuse response, evidence preservation, legal escalation and lawful-request handling. |
| [RA 8792, Electronic Commerce Act](https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html) | Electronic records and transactions where relevant; not a blanket mandate to collect signatures/IDs. | Contract/terms process, versioned records and approved retention. |
| [RA 8293, Intellectual Property Code](https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html) | Uploaded content, software/assets and third-party licenses. | Dependency/asset license inventory, narrow content license, reporting/removal process. |
| [RA 11313, Safe Spaces Act](https://lawphil.net/statutes/repacts/ra2019/ra_11313_2019.html) | Online gender-based sexual harassment and school responsibilities, depending on facts. Public suggestions are not a substitute for a confidential case process. | Moderation escalation to the school's authorized safeguarding office; confidential channel; restricted evidence. |
| [RA 10627, Anti-Bullying Act](https://lawphil.net/statutes/repacts/ra2013/ra_10627_2013.html) | Applicability particularly to elementary/secondary institutions; do not present as universally governing every college platform. Review DepEd rules and school policy. | Age/sector eligibility decision; child-safe notice; reporting/anti-retaliation process and trained responders. |
| RA 7610 and RA 11930 | Child protection and online sexual exploitation material where applicable. Do not solicit or redistribute abusive imagery as “evidence.” | Escalation/removal/evidence-preservation protocol reviewed by counsel and safeguarding lead. |
| RA 9470 / applicable public records rules | Public-school records may have retention/disposal requirements and authorized schedules. Privacy erasure is not unconditional destruction of official records. | Records officer approval, legal holds, disposal authority and vendor deletion/backup lifecycle. |
| RA 7277 and applicable accessibility/education rules | Assess institution-specific obligations. WCAG 2.2 AA is an engineering target, not a claim that all its criteria are expressly mandated here. | Keyboard, screen-reader, contrast and mobile accessibility review; equivalent supported reporting route. |

GDPR, US FERPA/COPPA, payment regulations and medical-system requirements are not assumed solely because this is a school app. Assess them when jurisdiction, users, contracts or new features trigger them. Do not add generic cookie consent or parental-consent collection without deciding what processing actually needs consent.

## Data inventory from repository inspection

| Data / path | Visibility and purpose | Required decision/control |
|---|---|---|
| Supabase Auth, profiles, server sessions (`lib/identity.ts`, `lib/session-store.ts`) | Account identity, roles, authentication; session payload encrypted with AES-GCM, cookie HttpOnly/Secure in production | School access policy, staff MFA, account lifecycle/revocation, retention and restore verification |
| Submissions (`routes/api.ts`, `create_submission_once`) | Account mode stores user ID. Anonymous mode passes null user ID; body may still identify someone. Approved/in-progress/resolved content becomes public. | Review/redact before publishing, documented purpose and lawful basis for publication; never guarantee untraceability |
| Submission receipts and tracking | Device cookie, owner hash, request IDs, hashed tracking code; browser drafts/receipts | Explain device storage and shared-device risks. Tracking code is a secret; avoid sending it in ordinary email. Do not claim no linkage is possible from logs/context. |
| Comments, votes, bookmarks, follows, saved searches | Comments public; account interactions include private state and device/IP-derived abuse identifiers | Audit direct Supabase grants/RLS as well as Express filtering; prevent disclosure of voter/member identifiers |
| Clarifications, reports, staff notes, audit history | Private support/moderation/workflow records; not public idea content | Owner/staff authorization, role reviews, minimal exports, access auditing and retention/holds |
| Progress evidence | Published evidence can be public; signed upload/download flows and byte checks exist | Verify bucket policies, content review, malware handling, personal-data redaction and short signed URL lifetimes |
| Digests/notifications | Followed-idea notifications; optional weekly email and consent preferences | Authenticate unsubscribe/cron; separate optional consent; check provider contracts and email authentication |
| Logs/backups | App masks query strings in request logging; providers may retain IPs, request metadata and identifiers | Configure redaction/retention/access across providers. Test restore separately. Stored aggregate error volumes are not proof of data breach. |
| Browser storage/service worker | Preferences, local drafts/receipts and static assets; SW excludes private pages/API persistence | Clear/disclose shared-device data; no account data in persistent caches; verify logout/account-switch behavior |

Existing `archive-old-submissions` uses configured retention_days and updates selected submission content, with attachment handling. Its presence does NOT establish a complete purge, a running scheduler, all related tables' coverage, safe legal holds, or the old privacy page's “90 days/12 months” promises. Do not run it as a compliance shortcut.

## Initial engineering findings (before staged implementation)

1. Old privacy/terms pages incorrectly described only staff accounts, unconditional anonymity, unverified addresses, 90-day rejected-record deletion, 12-month tracking expiry and blanket security/analytics claims. Correct to observable behavior and per-school configuration; DPO must finalize purposes, grounds, recipients and time limits.
2. CSP allowed executable inline scripts and jsDelivr although current Eta scripts are external/self-hosted (JSON data blocks are inert). Remove that permission, explicitly deny embedding and unused browser capabilities.
3. Express rate limiters use process-local storage. They do not provide a deployment-wide ceiling in serverless instances. Configure verified edge limits or a shared store with documented failure behavior. Auth SDK calls to Supabase bypass Express limits; Supabase's own auth protection must be configured too.
4. Express submission path has no Turnstile validation; Edge Function support does not prove this path is protected. A frontend CAPTCHA alone is insufficient. Choose edge/bot controls or integrate challenge verification server-side before making a protection claim.
5. Service-role queries bypass RLS by design. Review every authorization branch and direct anon/authenticated database access after all migrations; compiled migrations are not evidence of hosted policy state.
6. No complete self-service personal-data export/deletion workflow was established. A monitored manual process can support rights if lawful, accessible and operational; require it before launch. Do not expose all associated staff notes or other people's information in a bulk export.
7. Operator, contact, minors policy, grounds, retention schedule, registration applicability and contracts are unconfirmed. Multi-school isolation is implemented and the four hosted migrations are applied; activation remains locked pending acceptance and approvals.
8. `archive-old-submissions` accepted literal `Bearer undefined` when `ARCHIVE_CRON_SECRET` was missing. Locally reproduced with a mocked handler, then fixed to reject missing/short secrets before database client construction. Hosted exposure depends on gateway/function configuration; deployment is not verified. Edge Functions require a separate deployment from Express.
9. Legacy Edge helper fallback paths used wildcard CORS and could fail open on rate limiting. All active legacy entrypoints are now staged to return 410 before helper/service execution. Hosted retirement deployment remains required. CORS is not authorization.

## Release gates (every adopting school)

| Priority / owner | Deliverable and acceptance evidence | Current state |
|---|---|---|
| P0 product owner | Implement/test shared tenancy, including backup/support isolation and verified school activation | Implemented and migrated with local negative checks; activation/hosted acceptance still pending |
| P0 school signatory + provider | Actual controller/processor allocation, school authorization, DPO/privacy contact, processing agreement, privacy notice approved with lawful grounds per purpose | Open |
| P0 DPO + safeguarding lead | Institution/age eligibility, children's notice and safeguards; determine if guardian involvement is required for each purpose, never a blanket age checkbox | Open |
| P0 DPO + records officer | Approved retention schedule per table/storage/log/backup, legal holds, deletion/anonymization and recovery protocol | Open; destructive automation deferred |
| P0 security owner | Hosted RLS/grants/security-definer review with anon/student/staff/admin negative tests, private buckets and role revocation; no service key in frontend/repo/history | Local SQL/HTTP negative checks passed; hosted grants/bucket checks pending |
| P0 operations | Production HTTPS, Supabase URLs/redirect allowlist, strong separate secrets, least-privilege provider access and staff MFA; controlled staging with synthetic data | Configuration partly present; hosted verification open |
| P0 operations | Deployment-wide rate/bot controls including Supabase Auth and anonymous writes, alerting, bounded retry behavior | Atomic shared budgets implemented and migrated; matching app deployed; hosted acceptance blocked by provider Auth/REST outage |
| P0 DPO/support | Working monitored rights and incident channels, responder assignments, verified request dry run | Open |
| P0 operations | Recoverable backups, restore rehearsal in isolated project, documented RPO/RTO, rollback and forward-compatible migration process | Encrypted snapshot and full local database restore/migration rehearsal passed; Auth/Storage recovery, durable backup retention and approved RPO/RTO remain open |
| P0 release owner | Functional auth/recovery/accessibility/security checks against release candidate, dependency/license findings triaged and patches applied | Focused code checks only in this task |
| P1 DPO/vendor owner | NPC registration determination, PIA, provider/subprocessor list/locations, cross-border transfer safeguards and incident terms | Open; South Korea hosting known from user history, actual residency must be confirmed |
| P1 operations | SPF/DKIM/DMARC, approved sender, bounce/unsubscribe/digest behavior, log redaction and deletion verification | Open |

P1 is still required where applicable before processing; priority does not waive legal duties. No production approval follows automatically from passing `check:release`.

## Privacy-rights procedure

1. Offer the configured monitored privacy mailbox and an accessible school contact route. Record received date, requested right, owner, case reference and deadline under current law/policy; don't invent a universal response period.
2. Verify identity proportionately using an existing signed-in channel where possible. For anonymous records use a secure ownership process; do not collect government IDs or ask users to email passwords, session tokens or tracking secrets. Lack of a code may limit what can be safely linked; escalate rather than automatically deny all rights.
3. Search scoped sources: Auth/profile, account submissions, comments/interactions, private messages/reports, preferences, logs and vendors where applicable. Do not attempt to re-identify anonymous authors unnecessarily.
4. Review third-party rights, protected investigations and records obligations before access/export/correction/erasure. State any lawful limitations and escalation/complaint route; keep public content redaction distinct from identity deletion.
5. Deliver via an authenticated or otherwise verified secure channel; document action and evidence. Suppress optional email promptly on withdrawal. Apply approved downstream/backup deletion schedule and avoid restoring deleted records silently.
6. Rehearse with synthetic records before launch. Manual operations need accountable staff and audit records; the app does not yet automate this process.

## Incident and breach protocol

- Record detection time, facts and scope immediately; notify the assigned security lead and DPO through a restricted channel. Distinguish service outage/CPU overload from unauthorized disclosure; investigate both without speculative claims.
- Contain affected credentials/sessions or routes with scoped measures. Preserve necessary evidence in restricted storage, minimize copies and record custody; do not dump personal records into tickets/chat.
- DPO/legal assesses whether a personal data breach meets mandatory notification criteria. Where applicable, NPC rules generally require notification within 72 hours of knowledge/reasonable belief under the relevant conditions; verify current rule/trigger and permitted exceptions. Do not wait for a perfect forensic report to start assessment or treat every bug as automatically notifiable.
- Record notification decisions, affected data/users, mitigations and approved notices to NPC/data subjects when required. Coordinate processor-to-school notification contractually without waiting for the regulator deadline.
- Restore from known-good state, patch root cause, monitor recurrence and conduct review. Keep records under the approved retention schedule. Never send actual notifications automatically from this checklist.

## Retention and recovery protocol

Produce a signed schedule: category, purpose/ground, start event, live retention, deletion/anonymization method, attachment/relationship coverage, audit/log retention, backup expiry, legal-hold exception and owner. Do not substitute “indefinite” for a decision. Review public-school records rules before disposal.

Implement deletion only after this schedule: dry-run counts first, bounded batches, idempotency, dependency/foreign-key coverage, private storage cleanup, error handling, restricted audit evidence and verification. Do not destroy existing records based on the old notice. Inspect archive function handling of linked comments/progress/evidence/receipts before enabling it.

Define RPO/RTO with the school, export/restore credentials under least privilege, rehearse into an isolated project, verify auth/storage/database consistency and rights-request suppression after restore. Record dates and results. An enabled provider backup toggle is not a restore test.

## Deployment protocol

Complete and verify the shared-school isolation plan before enabling school signup. Keep production and synthetic staging in separate provider projects. Configure legal contact before publishing notices, review the actual provider settings and subprocessor contracts, run `npm run check:release`, build and focused tests locally/staging. Validate auth callbacks on the canonical domain, MFA/access revocation, private cache behavior, mobile/accessibility and critical moderation flows with synthetic users. Apply reviewed migrations with backup/rollback plan; never run load tests or seed scripts on production. Deploy a release candidate, run non-destructive smoke checks, monitor error/latency/auth metrics and retain a known-good rollback. Approval records must identify release, reviewer, evidence and unresolved exceptions.

## Completion record

This register starts the readiness work. Record implementation and checks in the linked plan. Open gates remain open until an accountable owner supplies evidence, even when the app is publicly reachable.

### Confirmed product decisions (2026-10-15)
- One shared SaaS service for many schools.
- Latest clarification: this is the user’s project for schools to adopt; actual operator name and monitored public privacy mailbox still need confirmation.
- User identifies existing records as demo data only. Preserve these in a dedicated demo school during a reviewed migration; do not delete data or auto-grant platform administration. Existing account identities may still contain real contact information and need protection.
- Tenant isolation, onboarding, browser/job isolation, shared budgets and staff MFA are implemented locally. A full hosted-snapshot migration rehearsal passed. Live migrations, exact-account operator bootstrap and all ten retired Edge deployments are complete. School activation remains locked pending evidence and approvals.


### Implementation update — 16 October 2026
See [cutover evidence](tenant-cutover.md#current-cutover-evidence--16-october-2026). Local implementation is complete for the staged shared-school boundary, onboarding review, invitations, per-school notices, shared request budgets, account-security UI and staff/operator MFA. This does not complete institutional authority, lawful grounds, contracts, monitored rights handling, incident staffing, retention approval or provider recovery/configuration checks. Existing public availability is not approval to onboard schools.


Hosted service health after deployment remains blocked: Supabase reports Auth/REST unhealthy while Database/Storage are healthy; a supported restart was requested. See the cutover ledger. Do not treat Git push, migration success or passing local tests as a healthy release or legal clearance.
