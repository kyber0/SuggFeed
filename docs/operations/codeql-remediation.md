# Remaining CodeQL remediation — 27 October 2026

The full baseline SARIF report contains 18 findings. This follow-up addresses the
underlying operations and test-only findings without changing scanner queries,
excluding application code, or dismissing alerts. The mapping and local check
results are in `audit/codeql-remaining-remediation.json`.

## Behavior changes

- Live preview fragments pass through self-hosted DOMPurify before parsing. If it
  cannot load, the old preview remains and a rendering error is reported.
- Server previews remove scripts using parse5 HTML5 parsing, including template
  and SVG descendants. User content remains escaped by Eta. The shared renderer
  rejects invalid preview states, including in local responsive fixtures.
- Search treats backslashes and LIKE wildcard characters as literal data, and
  quotes each PostgREST filter operand independently. The same operation is used
  by student feeds/roadmaps and staff queues, board and people search.
- Section selection only navigates to known panel hashes. Account-return route
  validation remains and trusted route prefixes are reconstructed. Studio preview
  redirects use the authorized school record rather than the raw request path.
- The upload byte-size check no longer reads an untrusted length property.
- Security assertions inspect parsed markup/URL components. Auth fixtures model
  TLS termination and use Secure cookies; production cookie policy is unchanged.

DOMPurify and parse5 are runtime dependencies; jsdom is a development-only DOM
fixture dependency. Both npm and pnpm locks are updated. No database migration,
production account or school configuration changes are required.

## Verification and release

The local run used synthetic provider credentials: 405 tests, 404 passed, zero
failed, one native PostgreSQL test skipped in the standard suite. The CI database
job runs that check separately. Four scoped lints, boundaries, typecheck,
production build and npm dependency audit passed. These are not real-device,
production-performance or managed-backup certification results.

The security workflow retains a SARIF artifact for three days to permit complete
trace review with normal Actions artifact access. A fresh full report must be
compared to the 18-finding baseline; zero new PR annotations alone does not prove
that existing findings are gone. Main-branch alert closure can only be confirmed
after review, merge and a completed main analysis. No application deployment is
claimed by this document.
