import {reportSubmission} from '../lib/submission-safety';
import {commentAction,reportComment,saveComment,ownCommentUpdates} from '../lib/comments';
import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { CommunityError, textField, idField, communityAction, privateInbox, replyToClarification, similarIdeas, staffCommunity, loadReportDecisions, loadPublicMergeHistory, loadCommunityStaffIdea } from '../lib/community';
import { staffWorkReturn, staffRole, loadStaffMembers, loadSavedViews, UUID } from '../lib/staff-workspace';
import { supabaseService } from '../lib/supabase';
import { invalidateCache, loadModerationCounts } from '../lib/data';
import { boardFilters, loadStaffBoard, loadStaffCalendar, WORK_STAGES } from '../lib/staff-board';

export const communityRouter = Router();
export const communityPages = Router();
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(e => e instanceof CommunityError ? res.status(e.status).json({ success: false, error: e.message }) : next(e));
communityRouter.use((_req, res, next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
communityRouter.use(rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
communityRouter.post('/similar',run(async(req,res)=>res.json({success:true,ideas:await similarIdeas(req.body.q)})));
communityRouter.get('/similar', run(async (req,res) => res.json({ success: true, ideas: await similarIdeas(req.query.q) })));
communityRouter.post('/inbox', run(async (req,res) => res.json({ success: true, ...await privateInbox(schoolUser(req)?.id || null, req.body.trackingCode,{view:req.body.view,page:req.body.page}) })));
communityRouter.post('/reply', run(async (req,res) => res.json({ success: true, ...await replyToClarification(schoolUser(req)?.id || null,req.body) })));
communityRouter.post('/report', run(async (req,res) => {
  if (!schoolUser(req)) throw new CommunityError(401,'Sign in to report content.');
  const body = req.body.commentId?textField(req.body.body,10,500):typeof req.body.body==='string'?req.body.body:'';
  const data = req.body.commentId ? {commentId:idField(req.body.commentId),body} : {submissionId:idField(req.body.submissionId),body};
  if(req.body.commentId)return res.json({success:true,...await reportComment(req.body.commentId,body,req.body.textRevision)});
  return res.json({success:true,...await reportSubmission(data.submissionId,body)});
}));
communityRouter.post('/comments/:id/edit',run(async(req,res)=>{
 if(!schoolUser(req))throw new CommunityError(401,'Sign in to edit your own comment.');
 const data=await saveComment({id:req.params.id,body:req.body.body,version:req.body.version});
 return res.json({success:true,data});
}));
communityRouter.get('/comments/:id/current',run(async(req,res)=>{
 if(!schoolUser(req))throw new CommunityError(401,'Sign in to view your comment.');
 res.json({success:true,data:await commentAction('owner-current',{id:idField(req.params.id)})});
}));
communityRouter.get('/comments/mine/:submissionId',run(async(req,res)=>{
 if(!schoolUser(req))throw new CommunityError(401,'Sign in to view your pending comments.');
 res.json({success:true,...await ownCommentUpdates(req.params.submissionId)});
}));
communityRouter.post('/comments/notices/:id/read',run(async(req,res)=>{
 if(!schoolUser(req))throw new CommunityError(401,'Sign in required.');
 await commentAction('read-notice',{id:idField(req.params.id)});res.json({success:true});
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
    if(!['approve','hide','delete'].includes(input.decision)||!Number.isSafeInteger(input.version)||!Number.isSafeInteger(input.textRevision)||input.textRevision<1)throw new CommunityError(400,'Choose a valid comment decision.');
    await commentAction(input.decision,{id:idField(input.id),version:input.version,textRevision:input.textRevision,body:textField(input.body,10,500)});
    return res.json({success:true});
  }
  if(action==='request') data={submissionId:idField(input.submissionId),body:textField(input.body)};
  else if(action==='close') data={id:idField(input.id)};
  else if(action==='resolve') {throw new CommunityError(403,'Use the school administrator safety review queue.');
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
communityPages.get('/inbox',(_req,res)=>{res.setHeader('Cache-Control','private, no-store');res.render('private-inbox',{title:'Private school questions — SuggFeed',profileSection:'inbox',inboxView:['needs-reply','waiting','resolved','all'].includes(String(_req.query.view))?String(_req.query.view):'needs-reply'});});
communityPages.get('/admin/community',run(async(req,res)=>{
  const user=schoolUser(req);
  if(!user) return res.redirect('/admin');
  if(!staffRole(user.role)) return res.status(403).render('school-message',{title:'Access denied',message:'Staff access required.'});
  if(user.role==='admin'&&req.query.section==='reports')return res.redirect(302,'/admin/safety');
  if(user.role==='admin'&&req.query.section==='comments'){const query=new URLSearchParams({section:'comments'});for(const key of ['commentView','commentsPage'])if(typeof req.query[key]==='string')query.set(key,String(req.query[key]));return res.redirect(302,'/admin/safety?'+query.toString());}
  res.setHeader('Cache-Control','private, no-store');
  res.render('staff-community',{title:'Follow-ups — SuggFeed',activeSection:'community',mergeSelected:req.query.task==='merge' && user.role==='admin',submissionId:typeof req.query.idea==='string' && /^[a-f0-9-]{36}$/i.test(req.query.idea) ? req.query.idea : '',...await staffCommunity(user,{...req.query,section:req.query.task==='merge'&&user.role==='admin'?'duplicates':req.query.section}),members:await loadStaffMembers()});
}));
communityPages.get('/admin/board',(req,res)=>{
  const query=new URLSearchParams();for(const [key,value] of Object.entries(req.query))if(typeof value==='string')query.set(key,value);
  if(!['board','calendar'].includes(query.get('presentation')||''))query.set('presentation','board');
  return res.redirect(302,'/admin/work?'+query.toString());
});
communityPages.get('/admin/work',run(async(req,res)=>{
  const user=schoolUser(req);
  if(!user) return res.redirect('/admin');
  if(!staffRole(user.role)) return res.status(403).render('school-message',{title:'Access denied',message:'Staff access required.'});
  res.setHeader('Cache-Control','private, no-store');
  if(typeof req.query.idea==='string'&&UUID.test(req.query.idea)){
    const result=await supabaseService.from('submissions').select('status').eq('id',req.query.idea).maybeSingle();
    if(result.error)throw result.error;
    if(result.data&&['pending','rejected'].includes(result.data.status))return res.redirect('/admin/reviews?idea='+encodeURIComponent(req.query.idea)+staffWorkReturn(req.query));
  }
  const presentation=['board','calendar'].includes(String(req.query.presentation))?String(req.query.presentation):'board';
  try {
  const [board,members,counts,savedViews,calendar]=await Promise.all([loadStaffBoard(boardFilters(req.query), WORK_STAGES),loadStaffMembers(),loadModerationCounts(),loadSavedViews(user.id),presentation==='calendar'?loadStaffCalendar(boardFilters(req.query),req.query):Promise.resolve(null)]);
  res.render('staff-board',{title:'Work — SuggFeed',activeSection:'board',...board,members,counts,savedViews,presentation,calendar});
  } catch {
    console.warn('Staff work could not be loaded');
    const query=new URLSearchParams();for(const [key,value] of Object.entries(req.query))if(typeof value==='string')query.set(key,value);query.set('presentation',presentation);
    return res.status(503).render('school-message',{title:'Work is temporarily unavailable',message:'Your ideas and assignments have not changed. Retry loading your current view.',nextHref:'/admin/work?'+query.toString(),nextLabel:'Retry loading work'});
  }
}));
