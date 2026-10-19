# School customization implementation ledger

## Approved scope

Implement the user-approved school customization plan, all six phases: versioned drafts/publish/restore and private previews; SuggFeed plus school branding; welcome and official links; stable school category IDs; backend-enforced feature controls; versioned custom questions and a complete private image attachment path; policy drafts retaining approved live settings; public progress labels; invitation/digest content and weekly/off choices; unified settings navigation and gradual rollout.

## Constraints

- Keep SuggFeed visible. No arbitrary CSS, script, SVG or HTML uploads.
- Preserve school isolation, MFA and existing membership/operator boundaries.
- Preserve accounts, submissions, roster rules, moderation and receipt idempotency.
- Defaults preserve current school behavior. Editor initially enabled for demo only; operator controls expansion.
- No tests added/run unless the user requests verification. Build/typecheck and local visual review are allowed; do not claim functional verification without evidence.
- Use the existing checkout, libraries and styles. No dependency additions expected.
- No invitations, emails or real school customization automatically published during implementation.

## Tasks

- [x] 1. Versioned schema, validator, draft administration and editor.
- [x] 2. Published context, branding assets/welcome, dynamic categories and feature controls.
- [x] 3. Protected policy drafts, versioned questions, staged image attachments, submission recovery and staff answer access.
- [x] 4. Public progress labels, email/digest controls, private preview, version history and unified navigation.
- [x] 5. Build/typecheck, final review, migration, demo editor rollout, push and production delivery check.

## Rulings

- Execute inline using executing-plans; preserve the ledger through compaction. The developer restriction on tests overrides skill TDD instructions.
- Initial submission attachments support validated/re-encoded JPEG/PNG/WebP images; PDFs are not offered because the current stack has no safe PDF content processing. This still provides the complete optional/required attachment workflow; documents can be added separately with appropriate handling.
- Explicit saving of a custom form requires platform review tied to the exact form schema and approved school policy version before publication. Cosmetic edits do not clear policy approval.
- Draft versions and private assets never enter shared caches; published presentation uses school plus version keys. Database feature guards remain authoritative for writes.

## Evidence / progress

Starting commit: 4f59935. Workspace clean before implementation.

- Implemented the six approved phases and operations guide; existing HTTP/digest fixtures updated for the changed RPC contract. No tests added or run.
- Independent review found and fixed reused publish revisions, restoration category omissions, demo rollout bypass, incomplete SQL validation, cleanup candidate starvation, inconsistent labels, and a PL/pgSQL alias ambiguity. A follow-up review found no remaining critical signature/grant issue; historical category reuse conflicts now explain recovery without overwriting the current draft.
- Build and typecheck passed repeatedly; all 58 Eta templates compiled. Fictional editor/preview screenshots reviewed at 320/375/768/1440 and 375/1280 respectively without horizontal page overflow.
- Migrations 202610180004–202610180008 applied atomically after two PostgreSQL compilation/order errors were corrected and rolled back. Readback: 53 migrations, all ten new tables have RLS and no anonymous SELECT/authenticated INSERT, three image buckets private, demo editor enabled with no published customization, 11 accounts and 11 memberships present. Server-credential presentation read returned HTTP 200, version0, five default categories, all original flags true, attachments off.
- Final migration 202610180009 applied successfully and upgrades policy/form review fingerprints to SHA-256. Existing school policies and public customization are not published or changed by this upgrade.
- CRON_SECRET absent from local/saved deployment configuration. Generated `/workspace/private/school-customization-vercel.env` (mode0600, outside Git); attach/upload publication is blocked until the deployment cleanup secret is configured. No claim is made about current Vercel secret values.
- Image support is JPEG/PNG/WebP only. Real email delivery, authenticated publishing/uploads and adversarial tenant isolation were not tested; a requested verification pass is required before expanding beyond the demo.

Final database readback: 54 migrations through 202610180009; both review/publish definitions contain SHA-256; 11 accounts and 11 memberships remain.

Delivery checks: final build and typecheck passed (including existing fixture compilation); git diff --check clean. Automated tests remain unrun. Code prepared for main; hosted delivery status is reported in the task response.
