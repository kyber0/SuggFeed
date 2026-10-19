# School customization operations

## Deployment

Apply migrations `202610180004` through `202610180009` before deploying the updated Express app. They add private customization, form, asset, policy draft and cleanup records. They preserve existing accounts, memberships, categories, submissions and approved policies. Existing schools retain their current configuration until an administrator publishes customization. Only the fictional demo editor is enabled initially.

Reuse the current `CRON_SECRET` if Vercel Production already has one. Otherwise set a random secret of at least 32 characters there and redeploy; do not replace an existing scheduler secret without updating its callers. The supplied `vercel.json` schedules `/internal/school-customization-cleanup` daily. Vercel supplies `Authorization: Bearer <CRON_SECRET>`. A generated value is provided outside the repository in `/workspace/private/school-customization-vercel.env`; never commit it. Upload reservation and publishing attachment-enabled forms fail closed until this secret is configured. The daily schedule may be supplemented by an authenticated external scheduler for larger deployments.

Existing invitation/digest configuration remains authoritative: `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, `APP_ORIGIN`; weekly digests also retain their existing opt-in and service scheduler requirements. School customization does not configure senders, subscribe accounts or send email on publication.

## School administrator workflow

Open **School settings → School customization**. Sections cover appearance, welcome links, categories, form, community switches, progress and notifications, and history. Related links open the existing domain, roster, invitation, contacts and policy screens.

1. Edit and **Save draft**. Validation failures retain entered values. A revision conflict requires comparing with the latest draft before saving again; do not overwrite another administrator's work.
2. Open **Private preview** and choose mobile/tablet/desktop. Its content is fictional; it cannot upload, submit, invite or send email.
3. Read the change summary and feature consequences, confirm review, and **Publish saved draft**. Current administrator permission and MFA are required. Publication consumes the revision, so an old confirmation cannot publish again.
4. **History → Restore into draft** loads an earlier configuration for review. It does not change memberships, approved policies, moderation or submitted ideas. Later categories are retained as archived. If newer categories reused a historical name/address, restoration explains the conflict and leaves the current draft intact; rename/publish the conflicting newer category or select another version before retrying.

Form schemas that collect questions/images require **Request form review** after saving. A platform operator reviews the exact form against the approved school policy at `/platform/customization`, records a review reference, and approves it. Editing the form invalidates that match. School administrators then publish; operators do not automatically become school administrators.

## Policy drafts

Saving policies now leaves the last approved settings live. A platform operator reviews the pending policy version and approves it separately. New/unapproved workspaces stay subject to existing activation gates. Cosmetic publication cannot clear or grant policy approval. A pending policy change must be approved before a form collecting that information is approved and published.

## Data behavior

- Categories use stable IDs. Names/addresses in existing account saved searches are converted to IDs during publication. Archive prevents new selection; existing ideas remain readable. There must be 1–20 active categories; the editor supports up to 60 active plus archived categories.
- Questions have immutable form versions, stable IDs and retained historical wording. Staff open **Private school form responses**; authors use the private details link after sending. These answers/files are never included in public feed/detail responses.
- The initial attachment implementation accepts **static JPEG/PNG/WebP only**, up to three 5 MB source images per submission. Logos accept 2 MB; covers 5 MB. Sharp validates contents/dimensions, rotates/re-encodes WebP, and strips metadata. PDFs are not offered.
- Sources upload directly to private storage using scoped signed upload URLs, avoiding the function request-body limit. Finalization checks the current owner, intent, source size and access. A retry after uncertain finalization does not delete committed files.
- Unsubmitted images expire after one day. Source reservations expire after two hours. Daily cleanup removes expired sources, expired unlinked submission images and old unreferenced branding. Deletion is queued durably and retried after storage failures. Historical branding stays referenced by immutable versions.
- Stale forms retain title, description, matching answers and image references. Removed/changed answers are kept separately for copying, never silently sent as current answers. A rejected queued form returns to draft review. Receipt replay happens before current form/category validation, preventing duplicate ideas after a lost response.
- Feature switches block new writes at the API/database boundary. Existing comments/votes/shares remain; staff moderation/workflow remains. Sharing switches do not make public URLs private. Roadmap-disabled links explain the change and offer the feed.
- Digest choices are weekly/off. Fresh school eligibility and user consent are checked before delivery; existing idempotency remains intact.

## Rollout and pause

Platform dashboard school entries expose **Enable customization editor**. `/platform/customization` can pause it per school without removing published appearance. `SCHOOL_CUSTOMIZATION_EDITING_DISABLED=true` pauses application editing across schools while published workspaces continue. Do not publish real school branding or collection changes merely to check deployment.

## Evidence limits

Builds and typechecks include existing fixture compilation. Automated tests and authenticated production publishing/upload/email flows are not run unless requested. Static fictional previews are used for responsive review; that does not establish tenant isolation or delivery correctness. Obtain the requested verification before expanding rollout beyond the demo.

## Visual workspace (19 October 2026)

Enabled school administrators open **School settings → Visual workspace editor** at the existing `/s/<slug>/admin/customization` URL. A platform operator enables or pauses the capability per school from `/platform/customization`; the registry records the actor and time. A platform role alone never grants school-editor permission. Every editor, preview, state, history, asset and write request checks active school-admin membership, MFA and the persisted school grant. No new migration or capability flag is required for this release.

The editor has a component list, one website canvas and a property inspector. Choose Home, Community ideas, Roadmap, Idea detail, Student profile or Submit idea. The canvas uses the actual Eta page templates, responsive styles and fictional records. Desktop/tablet/mobile presets set the iframe's real CSS viewport; zoom only changes its displayed scale. Collapse either panel for more canvas space. On mobile, components and properties open as accessible sheets. Choose Edit to select school components or Preview to navigate the fictional pages and submission steps. Branding and core navigation remain locked; this is a property editor, not a freeform page builder.

Text and palette changes update locally. Structural edits refresh the trusted server-rendered document after a short debounce. Sources are authorized, private/no-store and excluded from shared caches. Only the preview controller is loaded: no live auth, analytics, service worker, submission, invitation or interaction handlers. Anchors cannot open real destinations and native form submission is blocked by CSP. Preview never sends email or creates records.

Undo/redo retains up to 50 snapshots within a bounded serialized budget, groups consecutive field typing, and stays in memory. Ctrl/Cmd+S saves explicitly; typing fields retain their native undo. Save before reviewing publication. Saving, publishing and restoration retain newer edits typed while a request was running; revision conflicts require explicit copy/compare/reload. Unsaved changes warn before navigation. A grant is rechecked on focus and every minute while visible; revoked access stops further editing requests while retaining a copyable local configuration. Publication and restore still use existing RPC authority, revisions and protected form review.

Legacy `/preview` links redirect to the new canvas in Preview mode. The old miniature sample UI/controller has been removed. Image processing, upload cleanup readiness and the review rules above remain prerequisites; the visual editor does not bypass them.

Release evidence: application build/typecheck passed; local fictional browser rendering covered all six pages, a live headline edit and responsive editor screenshots (including 320 px with no host overflow). These observations do not certify cross-tenant authorization or authenticated production save/publish/upload flows. Automated tests were not added or run, as instructed. Keep other schools paused until the planned functional verification is requested and completed.
