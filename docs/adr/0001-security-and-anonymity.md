# ADR 0001: Security Architecture and Anonymity Model

**Status:** Accepted  
**Date:** 2026-09-27  
**Deciders:** Engineering Lead, Data Officer  

---

## Context

SuggFeed is a feedback platform where the primary promise to users is that their feedback is genuinely anonymous - not merely pseudonymous. Anyone - students, staff, community members, or members of the public - can submit complaints, suggestions, or other feedback. The platform must satisfy data-protection obligations (PDPA/GDPR-adjacent) and resist abuse from any source.

Several design choices were made early in the project that have downstream consequences. This ADR records those decisions, the alternatives considered, and the rationale.

---

## Decisions

### 1. Submissions are Anonymous by Design, not Policy

**Decision:** Submissions carry a randomly generated `tracking_token` (UUID v4). No user identity is stored alongside a submission row. The token is generated client-side, returned once, and stored in the submitter's browser (localStorage).

**Rationale:**
- A policy promise of "we won't look you up" is weaker than a technical guarantee of "we cannot look you up".
- Users are more likely to submit genuine, high-value feedback if they believe anonymity is structural.
- Reduces the data liability surface: a data breach exposes no submitter identities.

**Trade-offs:**
- Lost-token submissions cannot be recovered or claimed. The UX communicates this clearly ("Save your token - we cannot recover it for you").
- Abuse attribution is harder. Mitigated by Cloudflare Turnstile (anti-bot), per-IP rate limiting, and content moderation by staff.

**Alternatives considered:**
- Storing a hashed user ID: provides de-anonymisation resistance at rest but not to a privileged DB admin.
- Full authentication: allows easy token recovery and per-user history, but destroys the anonymity guarantee.

---

### 2. Row-Level Security on All Tables

**Decision:** Every table in `public` schema has RLS enabled. No table has a permissive default policy. Public reads are restricted to `status = 'approved'` rows on submissions. All write paths require either a valid anonymous context (submissions) or authenticated staff role (moderation).

**Rationale:**
- Defence-in-depth: even if application-layer auth is bypassed (e.g. a compromised edge function), the DB layer still enforces access rules.
- Supabase's PostgREST layer exposes the DB directly via the anon key; without RLS every table would be world-readable.

**Consequences:**
- All migrations must explicitly grant RLS policies or the feature will be broken.
- Testing requires a test user with the correct role to be set up in the test harness.

---

### 3. HTTP Security Headers via Next.js Config

**Decision:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy are set in `next.config.ts` via the `headers()` function so they apply to all routes without per-route boilerplate.

**Rationale:**
- Prevents common browser-based attacks (XSS, clickjacking, MIME sniffing).
- Users on shared or monitored devices benefit from frame-embedding protection against UI redressing attacks.

**CSP notes:**
- `script-src` currently includes `'unsafe-inline'` for Next.js inline scripts. This is mitigated by `strict-dynamic` and nonce-based exemptions should be adopted when Next.js supports it fully.
- Turnstile requires `frame-src https://challenges.cloudflare.com`.

---

### 4. CORS Origin Allowlisting on Edge Functions

**Decision:** Supabase Edge Functions (`/supabase/functions/_shared/security.ts`) allowlist origins via a configurable `ALLOWED_ORIGINS` environment variable rather than accepting `*`.

**Rationale:**
- Prevents CSRF from unrelated origins making credentialed requests to the functions API.
- Allows staging/preview environments to be added without code changes.

---

### 5. Composite DB Indexes for Feed Performance

**Decision:** Three composite indexes are added (migration `202609270003`):
- `(status, created_at DESC)` for the primary approved-feed query.
- `(category_id, status)` for category-filtered views.
- `(anonymous_tracking_hash) WHERE NOT NULL` partial index for the track-submission lookup.

**Rationale:**
- Without these, Postgres performs a sequential scan + sort on an unbounded table. At 10k submissions the feed query degrades noticeably.
- `CONCURRENTLY` ensures the migration does not lock the table in production.

---

## Consequences

1. All future migrations **must** include RLS policies.
2. New public API routes **must** add appropriate CSP source directives.
3. New Supabase Edge Functions **must** import `corsHeaders` from `_shared/security.ts`.
4. The anonymity guarantee **must** be communicated clearly in the Privacy Policy (`/privacy`).
5. Any feature that collects additional user-identifiable data must be reviewed against PDPA obligations before shipping.

---

## References

- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP CSP Cheat Sheet](https://cheatsheats.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- Privacy Policy: `/privacy`
- Terms of Service: `/terms`