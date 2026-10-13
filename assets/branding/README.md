# SuggFeed monogram

`sf-monogram-source.png` is the user-supplied navy/coral SF artwork. Preserve this
source and its transparency; do not replace it with a recreated mark.

From `apps/web-express`, run `npm run build:brand` to reproduce delivery assets
in both apps' `public/branding/` directories. This uses the existing Sharp
dependency for deterministic sizing/format conversion only, not visual redesign.
The header asset retains its 3:2 ratio. Browser/PWA icons are padded to squares;
the separate maskable icon has an opaque light background and preserves the
artwork inside the safe region. ICO contains 16/32/48px entries.

Generated assets are checked in for independent app deployments. Website
service-worker versions were advanced so old cached icons do not mask the change.
Email templates retain text branding when remote images are blocked. Hosted
Supabase templates/functions require a separate approved rollout; editing these
source files does not update already-sent emails or hosted provider settings.
