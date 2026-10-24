import {supabaseService} from '../lib/supabase';
import {commentAction,reportComment,commentReviewQueue,saveComment} from '../lib/comments';
import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { CommunityError, textField, idField, communityAction, privateInbox, replyToClarification, similarIdeas, staffCommunity, loadReportDecisions, loadPublicMergeHistory, loadCommunityStaffIdea } from '../lib/community';
import { staffRole, loadStaffMembers } from '../lib/staff-workspace';
import { invalidateCache } from '../lib/data';
import { boardFilters, loadStaffBoard, WORK_STAGES } from '../lib/staff-board';

export const communityRouter = Router();
export const communityPages = Router();
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(e => e instanceof CommunityError ? res.status(e.status).json({ success: false, error: e.message }) : next(e));
communityRouter.use((_req, res, next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
communityRouter.use(rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
communityRouter.get('/similar', run(async (req,res) => res.json({ success: true, ideas: await similarIdeas(req.query.q) })));
communityRouter.post('/inbox', run(async (req,res) => res.json({ success: true, requests: await privateInbox(schoolUser(req)?.id || null, req.body.trackingCode) })));
communityRouter.post('/reply', run(async (req,res) => res.json({ success: true, ...await replyToClarification(schoolUser(req)?.id || null,req.body) })));
communityRouter.post('/report', run(async (req,res) => {
  if (!schoolUser(req)) throw new CommunityError(401,'Sign in to report content.');
  const body = textField(req.body.body,10,500);
  const data = req.body.commentId ? {commentId:idField(req.body.commentId),body} : {submissionId:idField(req.body.submissionId),body};
  if(req.body.commentId)return res.json({success:true,...await reportComment(req.body.commentId,body)});
  await communityAction(schoolUser(req)!.id,'report',data);
  return res.json({success:true});
}));
communityRouter.post('/comments/:id/edit',run(async(req,res)=>{
 if(!schoolUser(req))throw new CommunityError(401,'Sign in to edit your own comment.');
 const data=await saveComment({id:req.params.id,body:req.body.body,version:req.body.version});
 return res.json({success:true,data});
}));
communityRouter.get('/report-history',run(async(req,res)=>{
  if(!schoolUser(req)) throw new CommunityError(401,'Sign in to see report decisions.');
  return res.json({success:true,reports:await loadReportDecisions(schoolUser(req)!.id)});
}));
communityRouter.get('/merges/:id', run(async(req,res)=>{
  return res.json({success:true,merges:await loadPublicMergeHistory(req.params.id)});
}));
communityRouter.post('/staff/:action',run(async(req,res)=>{
  const user=schoolUser(req);
  if(!user || !staffRole(user.role)) throw new CommunityError(user ? 403 : 401,'Staff access required.');
  const action=req.params.action as string, input=req.body;
  let data: Record<string,unknown>;
  if(action==='comment-review'){
    if(user.role!=='admin')throw new CommunityError(403,'Administrator access required.');
    if(!['approve','hide','delete'].includes(input.decision)||!Number.isSafeInteger(input.version))throw new CommunityError(400,'Choose a valid comment decision.');
    await commentAction(input.decision,{id:idField(input.id),version:input.version,body:textField(input.body,10,500)});
    return res.json({success:true});
  }
  if(action==='request') data={submissionId:idField(input.submissionId),body:textField(input.body)};
  else if(action==='close') data={id:idField(input.id)};
  else if(action==='resolve') {
    if(!['dismissed','removed'].includes(input.resolution)) throw new CommunityError(400,'Choose a report decision.');
    data={id:idField(input.id),resolution:input.resolution,body:textField(input.body,10,500)};
  } else if(action==='merge') {
    if(![input.updatedAt,input.targetUpdatedAt].every(x=>typeof x==='string' && Number.isFinite(Date.parse(x)))) throw new CommunityError(400,'Refresh both ideas before merging.');
    data={submissionId:idField(input.submissionId),targetId:idField(input.targetId),updatedAt:input.updatedAt,targetUpdatedAt:input.targetUpdatedAt,body:textField(input.body,10,500)};
  } else if(action==='bulk_assign') {
    if(!Array.isArray(input.items) || input.items.length<1 || input.items.length>25) throw new CommunityError(400,'Select 1–25 ideas.');
    data={assigneeId:input.assigneeId ? idField(input.assigneeId) : null,items:input.items.map((x:any)=>{
      if(typeof x.updatedAt!=='string' || !Number.isFinite(Date.parse(x.updatedAt))) throw new CommunityError(400,'Refresh your selection.');
      return {id:idField(x.id),updatedAt:x.updatedAt};
    })};
  } else throw new CommunityError(404,'Unknown action.');
  if(action==='resolve'){const report=await supabaseService.from('reports').select('comment_id').eq('id',String(data.id)).maybeSingle();if(report.error)throw report.error;if(report.data?.comment_id)throw new CommunityError(403,'Use the administrator comment review list.');}
  await communityAction(user.id,action,data);
  invalidateCache('submission_');invalidateCache('feed_');invalidateCache('published_count_');invalidateCache('comments_');invalidateCache('roadmap');
  return res.json({success:true});
}));
communityRouter.get('/staff/idea/:id',run(async(req,res)=>{
  if(!schoolUser(req) || !staffRole(schoolUser(req)!.role)) throw new CommunityError(403,'Staff access required.');
  return res.json({success:true,idea:await loadCommunityStaffIdea(schoolUser(req)!,req.params.id)});
}));
communityRouter.get('/staff/board',run(async(req,res)=>{
  const user=schoolUser(req);
  if(!user || !staffRole(user.role)) throw new CommunityError(user ? 403 : 401,'Staff access required.');
  return res.json({success:true,...await loadStaffBoard(boardFilters(req.query), WORK_STAGES)});
}));
communityPages.get('/inbox',(_req,res)=>{res.setHeader('Cache-Control','private, no-store');res.render('private-inbox',{title:'Private school messages — SuggFeed'});});
communityPages.get('/admin/community',run(async(req,res)=>{
  const user=schoolUser(req);
  if(!user) return res.redirect('/admin');
  if(!staffRole(user.role)) return res.status(403).render('school-message',{title:'Access denied',message:'Staff access required.'});
  res.setHeader('Cache-Control','private, no-store');
  res.render('staff-community',{title:'Follow-ups — SuggFeed',activeSection:'community',mergeSelected:req.query.task==='merge' && user.role==='admin',submissionId:typeof req.query.idea==='string' && /^[a-f0-9-]{36}$/i.test(req.query.idea) ? req.query.idea : '',...await staffCommunity(user,req.query),commentQueue:user.role==='admin'?await commentReviewQueue(req.query.commentsPage):{items:[],page:1,count:0},members:await loadStaffMembers()});
}));
communityPages.get('/admin/board',run(async(req,res)=>{
  const user=schoolUser(req);
  if(!user) return res.redirect('/admin');
  if(!staffRole(user.role)) return res.status(403).render('school-message',{title:'Access denied',message:'Staff access required.'});
  res.setHeader('Cache-Control','private, no-store');
  const [board,members]=await Promise.all([loadStaffBoard(boardFilters(req.query), WORK_STAGES),loadStaffMembers()]);
  res.render('staff-board',{title:'Work board — SuggFeed',activeSection:'board',...board,members});
}));
