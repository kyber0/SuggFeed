const express = require("express");
const router = express.Router();
const { getSupabase } = require("../lib/supabase");

/**
 * POST /auth/session
 * Called by client-side JS after Supabase auth — saves session to Express session store.
 */
router.post("/session", async (req, res) => {
  const { access_token, refresh_token, user } = req.body;
  if (!access_token || !user) {
    return res.status(400).json({ error: "Missing token or user" });
  }

  // Fetch the user's role from profiles
  const client = getSupabase(access_token);
  const { data: profile } = await client
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "student";

  req.session.user = {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name ?? profile?.display_name ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  };
  req.session.access_token = access_token;
  req.session.refresh_token = refresh_token;
  req.session.role = role;

  res.json({ ok: true, role });
});

/**
 * POST /auth/signout
 * Destroys the Express session and redirects home.
 */
router.post("/signout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

/**
 * GET /auth/callback
 * Supabase OAuth / magic link callback — the browser-side JS handles the token exchange
 * and then POSTs to /auth/session. This page just renders the redirect handler.
 */
router.get("/callback", (req, res) => {
  res.render("auth-callback", { title: "Signing in… — SuggFeed" });
});

module.exports = router;
