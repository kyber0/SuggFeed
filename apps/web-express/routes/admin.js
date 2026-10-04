const express = require("express");
const router = express.Router();
const { getSupabase } = require("../lib/supabase");

/* Middleware: require staff role */
function requireStaff(req, res, next) {
  const role = req.session.role;
  if (!role || (role !== "admin" && role !== "moderator")) {
    return res.redirect("/?msg=staff-only");
  }
  next();
}

router.use(requireStaff);

router.get("/", async (req, res) => {
  const client = getSupabase(req.session.access_token);
  const tab = req.query.tab || "overview";

  try {
    // Overview stats
    const [subRes, userRes, pendingRes, staffRes] = await Promise.all([
      client.from("submissions").select("id", { count: "exact", head: true }),
      client.from("profiles").select("id", { count: "exact", head: true }),
      client.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      client.from("profiles").select("id, display_name, email, role, created_at").in("role", ["admin", "moderator"]),
    ]);

    // Pending submissions for moderation tab
    let pending = [];
    if (tab === "moderation" || tab === "overview") {
      const { data } = await client
        .from("submissions")
        .select("id, title, description, created_at, categories(name), attachments(id)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      pending = data ?? [];
    }

    // All submissions for submissions tab
    let allSubmissions = [];
    if (tab === "submissions") {
      const { data } = await client
        .from("submissions")
        .select("id, title, status, vote_count, created_at, comment_count, categories(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      allSubmissions = data ?? [];
    }

    res.render("admin", {
      title: "Staff Portal — SuggFeed",
      tab,
      stats: {
        submissions: subRes.count ?? 0,
        users: userRes.count ?? 0,
        pending: pendingRes.count ?? 0,
      },
      staff: staffRes.data ?? [],
      pending,
      allSubmissions,
      role: req.session.role,
      user: req.session.user,
    });
  } catch (err) {
    console.error(err);
    res.render("admin", {
      title: "Staff Portal — SuggFeed",
      tab,
      stats: { submissions: 0, users: 0, pending: 0 },
      staff: [],
      pending: [],
      allSubmissions: [],
      role: req.session.role,
      user: req.session.user,
    });
  }
});

module.exports = router;
