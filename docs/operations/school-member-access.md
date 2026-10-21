# School member access and administration sections

## Member controls

School administrators open **School dashboard → School administration → Members & access** (also available in the staff sidebar and School settings).

- Search is limited to the current school. The directory shows 50 members per page.
- Open **Manage access**, choose an action, enter an administrative reason and confirm.
- **Suspend** pauses school access until explicitly restored; it has no automatic expiry.
- **Ban** blocks school access and automatic rejoining until explicitly restored.
- **Remove from school** removes access while preserving the person's account and historical records. It also requires explicit restoration before rejoining.
- **Restore access** restores the saved school role. Student roster eligibility still applies.
- Administrator, self and platform-operator accounts cannot be restricted through these controls.

These are school membership actions, not global account deletion. No submissions, authentication accounts, other school memberships or moderation history are deleted.

Every write rechecks school/admin permissions and MFA on the server. The database locks the school, checks the target role and membership revision, and records the reason in `school_registry_events` atomically. Restricted memberships keep `status='revoked'`, so existing session resolution, scoped database operations, approved-list joining and domain joining remain authoritative. The membership constraint rejects attempts to reactivate a restricted membership through an old invitation or staff role operation. Explicit restoration updates status and restriction state together.

Migration: `202610210005_school_member_restrictions.sql`. Its two RPCs are executable only by `service_role`; neither browser roles nor `tenant_executor` can call them directly. Existing revoked memberships are labeled removed without restoring access.

## Focused sections

- School dashboard: **Review queue** and **School administration**.
- School settings: **Overview**, **Policies & eligibility**, **School contacts**, **Visibility & retention**, **Email domains**, **Student enrollment**, plus dedicated links for joining, members, invitations and appearance.
- Platform dashboard: **Overview**, **Schools**, **Applications**, **Policy reviews**, **Service setup**, plus the existing editor-access screen.

Section links use URL fragments, supporting direct links, refresh and browser back/forward. Mobile settings/platform navigation uses a labeled section selector. With JavaScript unavailable, all sections remain readable as a document.

The three policy tabs remain one versioned policy form. Switching tabs preserves unsaved fields; saving submits the complete policy snapshot for review. Invalid required fields on another policy tab are revealed before browser validation focuses them. Contacts and retention changes still follow the existing protected policy workflow. Enrollment/domain forms keep their independent saves.

## Release checks and limits

Typechecking, the production build, read-only database permissions, and synthetic local UI at 320/375/768/1440 px were inspected. No real member was suspended, banned, removed or restored. No automated suite or real-device checks were run for this change. Suspensions are manually restored, and these controls do not implement legal erasure requests.
