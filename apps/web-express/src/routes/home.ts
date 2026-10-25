import {studentHomeBrief,studentIdeaState} from '../lib/student-experience';
import {loadKnowledge} from '../lib/assistant/school-knowledge';
import {knowledgeStoreFor} from '../lib/assistant/store';
import {currentSchool} from '../lib/school-scope';
import {supabaseService} from '../lib/supabase';
import {schoolUser} from '../lib/school-scope';
import {ENGAGEMENT_UUID} from '../lib/engagement';
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
    const token=req.cookies?.sf_anon_token;
    let votedIds:string[]=[];
    if(feed.length && (user || typeof token==='string' && ENGAGEMENT_UUID.test(token))){
      let query=supabaseService.from('votes').select('submission_id').in('submission_id',feed.map(item=>item.id));
      query=user?query.eq('user_id',user.id):query.is('user_id',null).eq('anon_token',token);
      const {data,error}=await query;if(error)throw error;
      votedIds=(data||[]).map(row=>row.submission_id);
    }

    res.append('Server-Timing',`data;dur=${(performance.now()-dataStarted).toFixed(1)}`);
    const studentBrief=await briefPromise;
    res.render("home", {studentBrief,studentIdeaState,
      title: "SuggFeed — Share feedback, track progress",
      description: "Share campus feedback, choose whether to attach your account, and check submission progress with a private tracking code.",
      assistantKnowledge:await help,
      feed,
      votedIds,
      totalCount: count,
      categories: schoolCategories().map(c=>c.name),
    });
  })
);

export default router;
