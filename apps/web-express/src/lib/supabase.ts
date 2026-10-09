import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://placeholder-project.supabase.co";

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-anon-key";

/**
 * Public (anon) client — respects RLS.
 * Use this for all reads that should be filtered by RLS policies (public feed, categories, etc.).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Service-role client — bypasses RLS.
 * Use ONLY for trusted server-side writes (submissions, comments, votes, admin updates).
 * Never expose this client's credentials to the browser.
 * Falls back to anon key in dev when service key is absent (writes will fail via RLS — expected).
 */
export const supabaseService = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
);
