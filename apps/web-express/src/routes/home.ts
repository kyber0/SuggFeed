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
  asyncHandler(async (_req: Request, res: Response) => {
    const { data: feed, count } = await loadPublishedSubmissions({
      page: 1,
      sortBy: "latest",
      category: "All",
    });

    res.render("home", {
      title: "SuggFeed — Share feedback, track progress",
      description: "Share campus feedback, choose whether to attach your account, and check submission progress with a private tracking code.",
      feed,
      totalCount: count,
      categories: DEFAULT_CATEGORIES,
    });
  })
);

export default router;
