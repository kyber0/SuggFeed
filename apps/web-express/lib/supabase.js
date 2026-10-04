const { createClient } = require("@supabase/supabase-js");

/**
 * Creates a Supabase client scoped to the current user session.
 * If an access token is present (from the session), it is injected
 * so RLS policies evaluate correctly for that user.
 */
function getSupabase(accessToken = null) {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    accessToken
      ? {
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        }
      : {}
  );
  return client;
}

/** Anon client (no user token) */
const supabase = getSupabase();

module.exports = { supabase, getSupabase };
