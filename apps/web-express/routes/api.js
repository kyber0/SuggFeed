const express = require("express");
const router = express.Router();
const { supabase, getSupabase } = require("../lib/supabase");

/* ── Vote on a submission ────────────────────────────────────────────────── */
router.post("/vote/:id", async (req, res) => {
  const { id } = req.params;
  const { action, deviceId } = req.body; // action: "up" | "remove"

  try {
    if (action === "up") {
      await supabase.from("votes").upsert({ submission_id: id, device_id: deviceId });
    } else {
      await supabase.from("votes").delete().eq("submission_id", id).eq("device_id", deviceId);
    }
    // Return updated vote count
    const { data } = await supabase
      .from("submissions")
      .select("vote_count")
      .eq("id", id)
      .single();
    res.json({ ok: true, vote_count: data?.vote_count ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Submit an idea ──────────────────────────────────────────────────────── */
router.post("/submit", async (req, res) => {
  const { title, description, category, isAnonymous, deviceFingerprint } = req.body;
  const user = req.session.user;

  const client = user ? getSupabase(req.session.access_token) : supabase;

  // Resolve category ID
  const { data: catRow } = await client
    .from("categories")
    .select("id")
    .eq("name", category)
    .single();

  const payload = {
    title,
    description,
    category_id: catRow?.id ?? null,
    status: "pending",
    is_anonymous: isAnonymous ?? true,
    user_id: isAnonymous || !user ? null : user.id,
    device_fingerprint: deviceFingerprint ?? null,
  };

  const { data, error } = await client.from("submissions").insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, id: data.id, tracking_code: data.tracking_code });
});

/* ── Post a comment ──────────────────────────────────────────────────────── */
router.post("/comment", async (req, res) => {
  const { submission_id, body, parent_id, display_name } = req.body;
  const user = req.session.user;

  const client = user ? getSupabase(req.session.access_token) : supabase;

  const { data, error } = await client
    .from("comments")
    .insert({
      submission_id,
      body,
      parent_id: parent_id || null,
      display_name: display_name || null,
      user_id: user?.id ?? null,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, comment: data });
});

/* ── Admin: update submission status ─────────────────────────────────────── */
router.post("/admin/submission/:id/status", async (req, res) => {
  const role = req.session.role;
  if (!role || (role !== "admin" && role !== "moderator")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { status, note } = req.body;
  const client = getSupabase(req.session.access_token);

  const { error } = await client
    .from("submissions")
    .update({ status })
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

/* ── Admin: update staff role ────────────────────────────────────────────── */
router.post("/admin/staff/:id/role", async (req, res) => {
  const role = req.session.role;
  if (role !== "admin") return res.status(403).json({ error: "Admin only" });

  const { newRole } = req.body;
  const client = getSupabase(req.session.access_token);

  const { error } = await client
    .from("profiles")
    .update({ role: newRole })
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

/* ── Health check ────────────────────────────────────────────────────────── */
router.get("/health", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

module.exports = router;
