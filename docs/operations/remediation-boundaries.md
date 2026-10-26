# Application boundaries after audit remediation

The active app remains Express, Eta and classic TypeScript browser scripts. This
remediation does not introduce a new framework, change permissions or run hosted
migrations.

## Source ownership

| Concern | Canonical source | Consumers |
|---|---|---|
| School authorization | `src/lib/school-authorization.ts` | School/platform/customization routes and services; original route exports remain compatible |
| Progress error identity | `src/lib/progress-error.ts` | Progress and evidence; the original progress export remains compatible |
| Color/design contracts | `src/contracts/school-colors.ts`, `school-design.ts` | Server modules directly; generated classic browser contracts |
| DOM theme application | `src/client/school-colors-dom.ts`, `school-design-dom.ts` | Browser build only |
| Provider deadlines | `src/lib/provider-fetch.ts` | All three Supabase client configurations |
| Request diagnostics | `src/lib/request-tracing.ts` | Root tracing, access log correlation and central error handler |
| Board window cap | `src/lib/staff-board.ts` | Server validation, rendered metadata, lane links, help text and browser loading |

Paths in this table are relative to `apps/web-express`.

`npm run build:contracts` generates the ignored browser declarations and existing
public JS paths. Normal typecheck/build commands run it. After changing a contract
or its DOM adapter during watch mode, rerun that command. Generated JS is an output,
not a server runtime dependency. Keep its template cache revision current when
publishing a changed public script.

`npm run check:boundaries` warns about import cycles, lib-to-route imports,
server-to-generated-browser dependencies and browser-to-server imports. Its
regression test enforces the current zero-violation baseline. It analyzes explicit
local imports; classic globals, generated identifiers and SQL calls need their
existing runtime/role tests too.

## Focused characterization

- The inspector's selection markup, grouping, property annotations and focus
  restoration have separate helpers. The optional browser check compares exact
  output against pre-refactor snapshots and exercises caret, details, scroll,
  read-only and inline-edit behavior.
- Board response parsing and installation are separate from request lifecycle.
  Selection retains its original version until explicit reselection; paging must
  not silently resolve a concurrency conflict.
- Progress preview, validation and reply parsing are separate from posting. Drafts,
  idempotency, evidence requirements and confirmation remain owned by the original
  workflow.

These are local extractions. Shared state and complex helpers remain; lower scores
in the entry functions do not prove every browser controller is simple.

## Deferred ownership decisions

`src/lib/auth-email-template.ts` has no known repository caller and is retained
because external/manual consumers have not been confirmed. The checked provider
email templates live in `supabase/templates/`; confirm the deployed provider
configuration before deleting or editing an alternate template.

Whole-app coverage is not certified: VM/browser code is not fully attributed by
server-only coverage. License metadata does not establish a violation or an
approved license policy. Maintainers must define that policy. Hosted branch
protection, Vercel gates, alert delivery and backup ownership require operator
verification; repository YAML and a local restore are insufficient evidence.
