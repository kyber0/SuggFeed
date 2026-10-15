# Shared SuggFeed service: security foundation design

Status: implementation authorized by the user's request to search, plan and implement. User clarified a generic shared service where many schools sign up. A registered business will operate it; existing records are demo data. Exact business identity/contact and per-school policies remain unconfigured. No compliance certification or authorization to purge production data is implied.

## Intent and boundaries
Make the existing Express application more defensible for a Philippine school deployment: accurate disclosures, least-privilege browser defaults, reviewable release requirements and operational procedures. Keep existing authentication, moderation, anonymous submissions and student workflows. Do not invent legal authority, school approval, a DPO identity, a functioning contact mailbox, deletion deadlines or parental consent. Do not collect birthdates or identity documents merely to fill a compliance checklist.

The active deployment is `apps/web-express` with Supabase and Vercel. Other clients/Edge Functions share the database and must be included in the eventual database authorization review. A passing Express build does not establish those clients are secure.

## Deliverables
1. Philippine applicability register and data inventory, distinguishing statutory requirements, conditional requirements and engineering recommendations. Link sources, and disclose failed source retrieval.
2. Correct `/privacy` and `/terms` claims based on code. Configure platform operator name and privacy contact through server environment variables; school notices must later use verified tenant configuration. Missing values must show an honest setup notice, never an invented contact. Keep a clear privacy-request process and essential browser storage disclosure. The full notice needs DPO approval before release.
3. Remove unused inline-script and CDN script permission from CSP, explicitly prevent embedding, deny unused sensitive browser permissions, retain existing HTTPS/session/CSRF controls.
4. Local release preflight reports missing configuration without printing credentials or contacting production. Exit nonzero for missing required configuration, and explicitly say configuration success is not legal/security clearance.
5. Owner-assigned release gates and practical incident, rights-request, retention and recovery procedures. No destructive automation until the school approves retention and legal holds.

## Decisions and acceptance
- Use existing Express/Eta/Helmet and Node; no new dependencies.
- Privacy email must be a plain mailbox without URL parameters, whitespace or header characters. Template output must be escaped. Invalid values act as unconfigured.
- Shared partials link legal notices at sign-in and before submission without an unnecessary consent checkbox. A notice acknowledgment is not a universal legal basis.
- Retain inline styles for the existing UI; scripts are external already. Non-executable JSON script blocks remain usable.
- Do not claim Turnstile is active for Express submission: the inspected path has no verification call. Document distributed abuse protection as a release gate.
- No automatic production migration, data deletion, invitation or messaging in this task.
- Validate configuration boundaries and actual local middleware responses, compile templates and build the app. Tests use local mocks only.
- School/DPO must confirm lawful basis separately for ordinary and sensitive information, public publishing, minors, retention and vendors. Do not label the system ready while these gates are open.

## Scope amendment: shared-school product
The user selected one shared service. Tenant isolation is a separate release-critical workstream, specified in `docs/superpowers/plans/2026-10-15-shared-school-isolation.md`. Global `profiles.role` currently controls access across all records; it must never become a school administrator permission. The demo dataset has a proposed dedicated-school mapping; the migration still needs rehearsal and review. Exact provider legal identity/contact remain unconfigured. Implement the independent safeguards here without enabling school signup or claiming tenancy is present. Philippine law is the initial jurisdictional reference, not worldwide clearance.

### Confirmed product decisions (2026-10-15)
- One shared SaaS service for many schools.
- Operator is a registered business; exact legal name and monitored privacy mailbox still need configuration/verification.
- User identifies existing records as demo data only. Preserve these in a dedicated demo school during a reviewed migration; do not delete data or auto-grant platform administration. Existing account identities may still contain real contact information and need protection.
- Tenant isolation remains unimplemented; data mapping is no longer an unanswered product question, but migration rehearsal and approval remain required.
