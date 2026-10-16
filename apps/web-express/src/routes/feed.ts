import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from "express";
import { loadPublishedSubmissions, DEFAULT_CATEGORIES } from "../lib/data";

import { feedFilters } from '../lib/feed-filters';
import { verifiedFeedAccountState } from '../lib/feed-account';

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
    if (following && !schoolUser(req)) return res.redirect('/notifications');
    if (following) res.setHeader('Cache-Control','private, no-store');

    const dataStarted=performance.now();
    const [result, accountState] = await Promise.all([loadPublishedSubmissions({
      page,
      sortBy: sortBy as any,
      category,
      search,
      followingUserId: following ? schoolUser(req)!.id : undefined,
      includeTotal:false,
    }),verifiedFeedAccountState(req,res)]);
    const {data:feed,count,hasMore}=result;

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
      accountState,
    });
  })
);

export default router;
