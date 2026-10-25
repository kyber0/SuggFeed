import {schoolCategories} from '../lib/school-customization';
import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from "express";
import { loadPublishedSubmissions } from "../lib/data";

import { feedFilters } from '../lib/feed-filters';
import { verifiedFeedAccountState,feedVoteState } from '../lib/feed-account';

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
    if(following&&!schoolUser(req)){res.setHeader('Cache-Control','private, no-store');return res.render('student-following-signin',{title:'Followed ideas — SuggFeed',following:true});}
    res.setHeader('Cache-Control','private, no-store');

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
    const voteState=await feedVoteState(req,feed.map(item=>item.id));
    res.render("feed", {...voteState,
      title: "Community Ideas — SuggFeed",
      description: "Browse all community feedback and ideas on SuggFeed.",
      feed,
      totalCount: count,
      hasMore,
      page,
      sortBy,
      category,
      search,
      categories: schoolCategories().map(c=>c.name),
      following,
      accountState,
    });
  })
);

export default router;
