import { Router, Request, Response, NextFunction } from "express";
import { loadPublishedSubmissions, DEFAULT_CATEGORIES } from "../lib/data";

import { feedFilters } from '../lib/feed-filters';

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
    const { page, sort: sortBy, category, search, scope } = feedFilters(req.query);
    const following = scope === 'following';
    if (following && !req.session.user) return res.redirect('/notifications');
    if (following) res.setHeader('Cache-Control','private, no-store');

    const dataStarted=performance.now();
    const { data: feed, count, hasMore } = await loadPublishedSubmissions({
      page,
      sortBy: sortBy as any,
      category,
      search,
      followingUserId: following ? req.session.user!.id : undefined,
    });

    res.append('Server-Timing',`data;dur=${(performance.now()-dataStarted).toFixed(1)}`);
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
      following,
    });
  })
);

export default router;
