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
      description: "A safer way to make your school better. Share feedback anonymously and follow its progress.",
      feed,
      totalCount: count,
      categories: DEFAULT_CATEGORIES,
    });
  })
);

export default router;
