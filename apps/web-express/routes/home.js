const express = require("express");
const router = express.Router();
const { loadFeed, loadCategories, lookupTrackingCode, DEFAULT_CATEGORIES } = require("../lib/data");

router.get("/", async (req, res) => {
  try {
    const { items, total } = await loadFeed({ sortBy: "popular", limit: 6 });
    const categories = await loadCategories().catch(() => DEFAULT_CATEGORIES);
    res.render("home", {
      title: "SuggFeed — A safer way to make your school better",
      feed: items,
      total,
      categories,
    });
  } catch (err) {
    console.error(err);
    res.render("home", { title: "SuggFeed", feed: [], total: 0, categories: DEFAULT_CATEGORIES });
  }
});

/* POST: track a submission by code (HTMX-style or regular form submit) */
router.post("/track", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ error: "No code provided" });
  try {
    const result = await lookupTrackingCode(code.trim().toUpperCase());
    if (!result) return res.json({ error: "Submission not found. Check your tracking code." });
    res.json({ ok: true, submission: result });
  } catch {
    res.json({ error: "Could not look up that code." });
  }
});

module.exports = router;
