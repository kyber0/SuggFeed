const express = require("express");
const router = express.Router();
const { loadFeed, loadCategories, DEFAULT_CATEGORIES } = require("../lib/data");

router.get("/", async (req, res) => {
  const { sort = "popular", cat = "All", search = "", page = "0" } = req.query;
  const pageNum = Math.max(0, parseInt(page, 10) || 0);
  const limit = 12;

  try {
    const categories = await loadCategories().catch(() => DEFAULT_CATEGORIES);
    const { items, total } = await loadFeed({
      sortBy: sort,
      filterCat: cat,
      search,
      page: pageNum,
      limit,
    });

    const hasMore = (pageNum + 1) * limit < total;

    res.render("feed", {
      title: "Community Ideas — SuggFeed",
      feed: items,
      total,
      categories: ["All", ...categories],
      sort,
      cat,
      search,
      page: pageNum,
      hasMore,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.render("feed", {
      title: "Community Ideas — SuggFeed",
      feed: [],
      total: 0,
      categories: ["All", ...DEFAULT_CATEGORIES],
      sort,
      cat,
      search,
      page: 0,
      hasMore: false,
      limit,
    });
  }
});

module.exports = router;
