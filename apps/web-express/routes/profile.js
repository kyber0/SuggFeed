const express = require("express");
const router = express.Router();
const { loadProfile } = require("../lib/data");

router.get("/", async (req, res) => {
  const user = req.session.user || null;
  if (!user) {
    return res.render("profile", {
      title: "My Activity | SuggFeed",
      profile: null,
      submissions: [],
    });
  }

  try {
    const { profile, submissions } = await loadProfile(user.id, req.session.access_token);
    res.render("profile", {
      title: "My Activity | SuggFeed",
      profile,
      submissions: submissions || [],
    });
  } catch (err) {
    console.error(err);
    res.render("profile", {
      title: "My Activity | SuggFeed",
      profile: user,
      submissions: [],
    });
  }
});

/* POST: update display name */
router.post("/update", async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: "Unauthorised" });

  const { display_name } = req.body;
  const { getSupabase } = require("../lib/supabase");
  const client = getSupabase(req.session.access_token);

  const { error } = await client
    .from("profiles")
    .update({ display_name })
    .eq("id", user.id);

  if (error) return res.json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
