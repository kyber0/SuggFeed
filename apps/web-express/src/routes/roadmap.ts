import { Router } from "express";
import { loadRoadmapSubmissions } from "../lib/data";

const router = Router();
router.get("/", async (_req, res, next) => {
  try {
    const submissions = await loadRoadmapSubmissions();
    // Only real public fields: approval does not imply an owner or delivery date.
    const items = submissions.map(s => ({
      id: s.id, title: s.title, description: s.description || "",
      status: s.status, category: s.category ?? s.categories?.name ?? "Other",
      votes: s.vote_count ?? 0, comments: s.comment_count ?? 0,
      created_at: s.created_at, updated_at: s.updated_at || s.created_at,
    }));
    res.render("roadmap", {
      title: "Campus roadmap — SuggFeed",
      description: "See which community ideas are planned, in progress, and completed.",
      items, categories: [...new Set(items.map(item => item.category))].sort(),
    });
  } catch (error) { next(error); }
});
export default router;
