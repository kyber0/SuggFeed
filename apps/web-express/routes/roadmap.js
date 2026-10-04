const express = require("express");
const router = express.Router();
const { loadRoadmap } = require("../lib/data");

router.get("/", async (req, res) => {
  try {
    const columns = await loadRoadmap();
    res.render("roadmap", {
      title: "Roadmap — SuggFeed",
      columns,
    });
  } catch (err) {
    console.error(err);
    res.render("roadmap", {
      title: "Roadmap — SuggFeed",
      columns: { approved: [], in_progress: [], resolved: [] },
    });
  }
});

module.exports = router;
