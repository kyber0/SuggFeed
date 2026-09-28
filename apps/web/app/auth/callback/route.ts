import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Supabase OAuth PKCE callback handler.
// After Google sign-in OR password recovery, Supabase redirects here with ?code=...
// We redirect the user back to the homepage (or the `next` param if provided).
// The Supabase JS client picks up the session / recovery token automatically
// via onAuthStateChange — which then opens the "set new password" modal.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  // Resolve the destination, defaulting to homepage
  const destination = next.startsWith("/") ? `${origin}${next}` : `${origin}/`;
  return NextResponse.redirect(destination);
}
