import { Router, Request, Response, NextFunction } from "express";
import { loadPublishedSubmissions, DEFAULT_CATEGORIES } from "../lib/data";

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const sortBy = (req.query["sort"] as string) || "all";
    const category = (req.query["category"] as string) || "All";
    const search = (req.query["search"] as string) || "";

    const { data: feed, count, hasMore } = await loadPublishedSubmissions({
      page,
      sortBy: sortBy as any,
      category,
      search,
    });

    res.render("feed", {
      title: "Community Ideas — SuggFeed",
      description: "Browse all community feedback and ideas on SuggFeed.",
      feed,
      totalCount: count,
      hasMore,
      page,
      sortBy,
      category,
      search,
      categories: DEFAULT_CATEGORIES,
    });
  })
);

export default router;
