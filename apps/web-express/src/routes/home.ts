import {feedVoteState} from '../lib/feed-account';
import {studentHomeBrief,studentIdeaState} from '../lib/student-experience';
import {loadKnowledge} from '../lib/assistant/school-knowledge';
import {knowledgeStoreFor} from '../lib/assistant/store';
import {currentSchool} from '../lib/school-scope';
import {schoolUser} from '../lib/school-scope';
import {schoolCategories} from '../lib/school-customization';
import { Router, Request, Response, NextFunction } from "express";
import { loadPublishedSubmissions } from "../lib/data";

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
    const school=currentSchool();const help=loadKnowledge(school?.id||null,school?knowledgeStoreFor(school.id,schoolUser(req)?.id||null):undefined);
    const dataStarted=performance.now();
    const user=schoolUser(req);const briefPromise=user?studentHomeBrief(user.id).catch(()=>{console.warn('student_home_brief_unavailable');return {items:[],itemsUnavailable:true,needsReply:null};}):Promise.resolve(null);
    const { data: feed, count } = await loadPublishedSubmissions({
      page: 1,
      sortBy: "latest",
      category: "All",
      includeTotal:false,
    });

    // Vote state belongs to this verified account or anonymous browser, never a shared page cache.
    res.setHeader('Cache-Control','private, no-store');
    const voteState=await feedVoteState(req,feed.slice(0,6).map(item=>item.id));

    res.append('Server-Timing',`data;dur=${(performance.now()-dataStarted).toFixed(1)}`);
    const studentBrief=await briefPromise;
    res.render("home", {studentBrief,studentIdeaState,
      title: "SuggFeed — Share feedback, track progress",
      description: "Share campus feedback, choose whether to attach your account, and check submission progress with a private tracking code.",
      assistantKnowledge:await help,
      feed,
      ...voteState,
      totalCount: count,
      categories: schoolCategories().map(c=>c.name),
    });
  })
);

export default router;
