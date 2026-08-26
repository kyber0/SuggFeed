import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Supabase OAuth PKCE callback handler.
// After Google sign-in, Supabase redirects here with ?code=...
// We just redirect the user back to the homepage — the Supabase JS client
// on the client side picks up the session automatically via onAuthStateChange.
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  // Let the client-side Supabase listener handle the session.
  return NextResponse.redirect(`${origin}/`);
}
