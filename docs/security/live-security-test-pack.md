# Controlled live security test pack

Status: **prepared; no live tests or fixture creation authorized yet**. The owner
has requested preparation while real-user access and data checks are unfinished.
Target: `https://www.suggfeed.me`. A database wipe is not part of this pack.

## 1. Preconditions before any live probe

- Owner confirms real users are paused and no real student/sensitive information
  is present. An announcement alone does not technically prevent access.
- Save the actual database backup and any referenced Storage objects and recovery
  configuration. Verify restoration in an isolated copy and record the evidence.
  The earlier scoped migration rollback is not a full application backup.
- Create only dedicated, fictional test schools, ideas and disposable accounts.
  Keep normal activation, permission and MFA requirements; do not disable security
  gates or change another school's policies to make a test pass.
- Use an owned test inbox/aliases for email checks. Never send to unrelated users.
- Record a two-hour-or-shorter approval window and the expected target/version.
- Let setup/login traffic cool down before probing. Do not increase production
  limits or clear security counters just to obtain passing results.

The runner requires these acknowledgements in its private manifest. They prevent
accidental execution; they **do not automatically prove** that access was paused,
that records are fictional, or that backup recovery works. Verify those facts first.

## 2. Fictional fixtures

Use a new UUID `runId`. School slugs must be
`sec-test-<first-eight-runId-characters>-a` and the corresponding `-b`.
Use separate active schools with private publication policies.

| Alias | Membership | Required control |
|---|---|---|
| studentA | Student, School A only | Owns private idea A |
| peerA | Different student, School A only | Does not own or have receipt access to idea A |
| moderatorA | Moderator, School A only | Not assigned to private idea A or its team |
| adminA | Admin, School A only | Can open A's safety tools |
| studentB | Student, School B only | Owns private idea B |
| moderatorB | Moderator, School B only | Assigned to private idea B |
| adminB | Admin, School B only | Can read private idea B |
| operator | Platform operator, no school memberships | Platform access; no automatic client membership |

Staff/operator sessions must have satisfied their normal MFA requirement. Keep
browser profiles separate. Never copy an existing real user's session.

Each school needs two distinct ideas with recorded UUIDs:

- Private pending idea: title contains `SF-SEC-<runId>-a-private` (or `-b-private`).
- Approved/public-to-members idea: title contains `SF-SEC-<runId>-a-public`
  (or `-b-public`); it must appear in its owner's feed search.

Known positive controls run before negative access checks. A missing fixture,
expired login or misconfigured assignment is not evidence of secure isolation.
Keep private canaries out of public titles/answers. Use only invented text.

## 3. Safe default and private manifest

From `apps/web-express`:

```sh
npm run security:live -- --plan
```

This makes **zero network requests**. Importing the runner also makes no requests.
The regular unit suite uses a fake transport; CI never invokes live mode.

When the prerequisites are independently complete, prepare a private JSON manifest
outside the repository (regular file, mode `0600`) containing:

- `version: 1`, `target: "https://www.suggfeed.me"`, a unique UUID `runId`;
- `expiresAt`: an ISO timestamp no more than two hours ahead;
- `approval`: booleans `realUsersPaused`, `noSensitiveData`,
  `backupRestoreVerified`, `disposableFixturesOnly`, plus `backupEvidence`;
- `schools.a` / `.b`: `slug`, `id`, `privateIdeaId`, `publicIdeaId`;
- `accounts.<alias>`: `userId` and one `connect.sid=...` cookie for each alias above.

Do not paste the manifest in chat, put it in Git, reuse real accounts, or give the
runner a service-role key. Authentication/fixture setup is a separate approved
step; the runner does not create accounts, send email or delete fixtures.

Only after approval and fixture verification:

```sh
node scripts/check-live-security.cjs --run --manifest /PRIVATE/run.json --evidence /PRIVATE/new-results.json
```

An existing evidence file is never overwritten. Evidence has mode `0600` and
contains case IDs, status codes and outcomes, not cookies, raw bodies or identities.
A failure is recorded as failed/blocked; investigate fixture health before naming
it a vulnerability. Capture additional redacted evidence only if needed.

## 4. Automated HTTP subset

The runner checks account identities, owner/admin positive controls, cross-school
private-detail rejection, same-school ownership/assignment restrictions,
admin-only safety access, platform/client separation, literal search probes,
reflected marker locations, and cross-site/missing-proof signout rejection.
It verifies the student session still exists after rejected signouts.

Bounds: at most 64 planned requests; concurrency one; at least 500 ms between
requests; 15-second timeout; response cap 512 KiB; fixed same-origin destination;
redirects never followed; no retries. It stops at the first unexpected response,
429, server error, timeout, oversized response or expired approval. The two POST
probes target only a disposable student's signout; if a control is broken they
could log that fixture out. GETs can still create ordinary session/log counters.

Injection probes are short literal-search strings, not destructive SQL, sleeps,
UNION extraction, schema enumeration or external callbacks. The XSS marker only
assigns a test variable and makes no outbound request. Parsed-response inspection
is **not** proof of browser execution safety or complete injection immunity.

## 5. Separate browser/provider checks — all NOT RUN

| Area | Procedure and expected result |
|---|---|
| Stored XSS | In private fictional ideas/comments/profile/welcome/question text, use a harmless run-scoped local-variable marker. View as the fixture owner and staff. No executable elements or marker execution; ordinary text remains readable. Do not publish a stored payload to a real audience. |
| DOM/Studio XSS | Authorized preview still edits normally. Script tags, handler attributes and dangerous URLs cannot execute. Messages with wrong origin/source/instance, replayed sequence or invalid schema do not change the preview. Use a real browser, not only a parsed HTML response. |
| SQL/filter injection | Repeat literal canary/quote/backslash/filter-punctuation probes in roadmap and staff queue/people search; verify scopes and expected fixture IDs. Stop on leaked database details or any unexpected private result. |
| Private files/MFA | Owner and assigned staff positive controls. Peer, cross-school and unassigned staff denied. AAL1 staff cannot obtain private progress evidence; AAL2 authorized staff can. Public evidence follows its separate publication policy. |
| Direct RLS/RPC | Use only disposable user/anon credentials, never a service-role client as the attacker. Wrong school/actor/role arguments cannot read/write another school. No schema discovery or data extraction. |
| Session expiry | Observe warning at 28 minutes and expiry at 30 without activity. Verify fresh sign-in, cookie loss, second device/tab and provider-token refresh. Record provider-token validity separately from the app's idle guarantee. No real user's session is revoked. |
| Revocation | Remove only a fixture's membership/assignment using normal admin controls. Its old tab/cookie must lose access. Preserve the audit trail; do not silently regrant privileges. |
| Rate boundary | Confirm limits locally first. Any live boundary check needs an isolated test identity/IP and a bounded window. Do not flood, distribute requests or bypass limits. |
| Email | One controlled signup, recovery and invitation per approved test case. Verify intended account, expiry, single use and branding in an owned inbox. Stop if a message targets another address. |

## 6. Finish and reporting

Record tested revision, time/window, fixture ownership, expected/actual result,
request IDs where available, and redacted reproduction steps. Distinguish passed,
failed, blocked and not-run cases. Preserve minimal evidence and privately revoke
fixture sessions/disable test accounts through separately approved cleanup.
Do not delete existing data, wipe the database, claim all attacks are impossible,
or treat a green CodeQL scan as completed live penetration testing.
