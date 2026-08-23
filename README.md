# Campus Voice

> A safer, anonymous way for students to share feedback, follow its progress, and see the changes their community is shaping.

---

## Project structure

```
SuggFeed/
├── apps/
│   ├── web/          # Next.js 15 web app (Vercel)
│   └── mobile/       # Expo managed-workflow React Native app (EAS)
├── packages/
│   └── shared/       # Shared TypeScript types (future use)
└── supabase/
    ├── migrations/   # PostgreSQL schema + RLS policies
    └── functions/    # Deno Edge Functions
```

---

## Features

| Feature | Web | Mobile |
|---|---|---|
| Submit feedback (anonymous or named) | ✅ | ✅ |
| File attachments (JPEG/PNG/WebP/PDF) | ✅ | — |
| Turnstile spam protection | ✅ | — |
| Upstash rate limiting | ✅ edge | ✅ edge |
| Offline queue + auto-sync (Dexie) | ✅ | — |
| Live public feed with voting | ✅ | ✅ (read-only) |
| Track submission by code | ✅ | ✅ |
| Push notifications (Expo) | — | ✅ |
| Email notifications (Resend) | ✅ edge | ✅ edge |
| Admin/moderator review dashboard | ✅ | — |
| Retention/archival cron | ✅ edge | — |
| PWA (installable, offline shell) | ✅ | n/a |
| Sentry error monitoring | ✅ | ✅ |
| CI/CD (GitHub Actions) | ✅ | ✅ EAS |

---

## Quick start

### Prerequisites

- [pnpm](https://pnpm.io/) ≥ 9
- [Node.js](https://nodejs.org/) ≥ 22
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/) ≥ 2 (for Edge Function tests)
- [Expo CLI + EAS CLI](https://docs.expo.dev/) (mobile only)

### 1. Clone and install

```bash
git clone https://github.com/your-org/campus-voice
cd campus-voice
pnpm install
```

### 2. Configure environment

```bash
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local and fill in all required values
```

See [`.env.example`](./.env.example) for a full list of variables with setup links.

### 3. Set up Supabase

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Push migrations (schema + RLS)
supabase db push

# Deploy edge functions
supabase functions deploy

# Set secrets (repeat for each secret from .env.example)
supabase secrets set TURNSTILE_SECRET_KEY=... UPSTASH_REDIS_REST_URL=... ...
```

### 4. Run locally

```bash
# Web
pnpm dev

# Mobile
pnpm mobile:start
```

---

## Edge functions

| Function | Auth | Rate limit | Purpose |
|---|---|---|---|
| `submit-feedback` | optional | 5/hour per IP | Create a submission with optional attachments |
| `lookup-by-tracking-code` | none | 10/15 min per IP | Anonymous status lookup |
| `review-submission` | moderator/admin | — | Change submission status + notify |
| `vote-submission` | optional | 10/hour per IP | Cast a vote on a public idea |
| `register-push-token` | required | — | Save Expo push token for notifications |
| `archive-old-submissions` | cron secret | — | Anonymise resolved/rejected submissions per retention policy |

### Setting the archive cron

Schedule `archive-old-submissions` to run daily using any cron service (Supabase Cron, GitHub Actions scheduled workflow, etc.):

```
POST https://your-project.supabase.co/functions/v1/archive-old-submissions
Authorization: Bearer YOUR_ARCHIVE_CRON_SECRET
```

---

## Testing

```bash
# Web unit tests (Vitest + jsdom)
pnpm test

# Web with coverage
pnpm test:coverage

# Deno edge function tests
deno test --allow-env supabase/functions/_shared/security.test.ts

# TypeScript check (all packages)
pnpm typecheck
```

---

## Deployment

Deployment is fully automated via GitHub Actions:

- **`ci.yml`** — runs on every push and PR: typecheck → lint → test → build
- **`deploy.yml`** — runs on merge to `main`: migrations → edge functions → Vercel → EAS build

### Required GitHub repository secrets

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Supabase project settings |
| `SUPABASE_PROJECT_ID` | Supabase project reference ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile dashboard |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project → Settings → Client Keys |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens |
| `SENTRY_ORG` | Your Sentry organisation slug |
| `SENTRY_PROJECT` | Your Sentry project slug |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel project settings |
| `VERCEL_PROJECT_ID` | Vercel project settings |
| `EXPO_TOKEN` | [expo.dev/accounts/.../settings/access-tokens](https://expo.dev) |

---

## Security

- All write operations go through Edge Functions using the service role key — no direct client writes
- Turnstile verifies every submission and vote at the server side
- Upstash sliding-window rate limits prevent brute force
- RLS policies enforce read access rules for every table
- Attachments are validated by magic-byte signature before storage
- Anonymous tracking codes are stored as SHA-256 hashes
- Retention policy anonymises old resolved/rejected submissions automatically

---

## PWA installation

The web app is installable as a PWA. Browsers that support `beforeinstallprompt` will show an install prompt. On iOS, use **Safari → Share → Add to Home Screen**.

The service worker caches static assets for offline use and queues feedback submissions locally when the device is offline.
