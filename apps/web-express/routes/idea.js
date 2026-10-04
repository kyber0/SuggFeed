const express = require("express");
const router = express.Router();
const { loadSubmission, loadComments, readableStatus } = require("../lib/data");

router.get("/:id", async (req, res) => {
  try {
    const idea = await loadSubmission(req.params.id);
    if (!idea) return res.status(404).render("404", { title: "Idea Not Found" });

    const comments = await loadComments(req.params.id);

    // Build comment tree
    const rootComments = [];
    const map = {};
    comments.forEach((c) => { map[c.id] = { ...c, replies: [] }; });
    comments.forEach((c) => {
      if (c.parent_id && map[c.parent_id]) {
        map[c.parent_id].replies.push(map[c.id]);
      } else {
        rootComments.push(map[c.id]);
      }
    });

    res.render("idea", {
      title: `${idea.title} — SuggFeed`,
      idea,
      comments: rootComments,
      readableStatus,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("error", { title: "Error", message: "Could not load idea." });
  }
});

module.exports = router;
