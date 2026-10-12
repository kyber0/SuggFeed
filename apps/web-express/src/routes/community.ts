import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { CommunityError, textField, idField, communityAction, privateInbox, replyToClarification, similarIdeas, staffCommunity } from '../lib/community';
import { staffRole, loadStaffMembers } from '../lib/staff-workspace';
import { supabaseService } from '../lib/supabase';
import { invalidateCache } from '../lib/data';
import { boardFilters, loadStaffBoard } from '../lib/staff-board';

export const communityRouter = Router();
export const communityPages = Router();
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => handler(req, res).catch(e => e instanceof CommunityError ? res.status(e.status).json({ success: false, error: e.message }) : next(e));
communityRouter.use((_req, res, next) => { res.setHeader('Cache-Control','private, no-store'); next(); });
communityRouter.use(rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
communityRouter.get('/similar', run(async (req,res) => res.json({ success: true, ideas: await similarIdeas(req.query.q) })));
communityRouter.post('/inbox', run(async (req,res) => res.json({ success: true, requests: await privateInbox(req.session.user?.id || null, req.body.trackingCode) })));
communityRouter.post('/reply', run(async (req,res) => res.json({ success: true, ...await replyToClarification(req.session.user?.id || null,req.body) })));
communityRouter.post('/report', run(async (req,res) => {
  if (!req.session.user) throw new CommunityError(401,'Sign in to report content.');
  const body = textField(req.body.body,10,500);
  const data = req.body.commentId ? {commentId:idField(req.body.commentId),body} : {submissionId:idField(req.body.submissionId),body};
  await communityAction(req.session.user.id,'report',data);
  return res.json({success:true});
}));
communityRouter.get('/report-history',run(async(req,res)=>{
  if(!req.session.user) throw new CommunityError(401,'Sign in to see report decisions.');
  const {data,error}=await supabaseService.from('reports').select('id,reason,resolution,resolution_reason,created_at,resolved_at').eq('user_id',req.session.user.id).order('created_at',{ascending:false}).limit(50);
  if(error) throw error;
  return res.json({success:true,reports:data || []});
}));
communityRouter.get('/merges/:id', run(async(req,res)=>{
  const id=idField(req.params.id);
  const publicIdea=await supabaseService.from('submissions').select('id').eq('id',id).in('status',['approved','in_progress','resolved']).maybeSingle();
  if(publicIdea.error) throw publicIdea.error;
  if(!publicIdea.data) throw new CommunityError(404,'Idea unavailable.');
  const {data,error}=await supabaseService.from('idea_merges').select('source_title,reason,created_at').eq('target_id',id).order('created_at').limit(50);
  if(error) throw error;
  return res.json({success:true,merges:data || []});
}));
communityRouter.post('/staff/:action',run(async(req,res)=>{
  const user=req.session.user;
  if(!user || !staffRole(user.role)) throw new CommunityError(user ? 403 : 401,'Staff access required.');
  const action=req.params.action as string, input=req.body;
  let data: Record<string,unknown>;
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
  await communityAction(user.id,action,data);
  invalidateCache('submission_');invalidateCache('feed_');invalidateCache('comments_');invalidateCache('roadmap');
  return res.json({success:true});
}));
communityRouter.get('/staff/idea/:id',run(async(req,res)=>{
  if(!req.session.user || !staffRole(req.session.user.role)) throw new CommunityError(403,'Staff access required.');
  const {data,error}=await supabaseService.from('submissions').select('id,title,status,updated_at').eq('id',idField(req.params.id)).maybeSingle();
  if(error) throw error;if(!data) throw new CommunityError(404,'Idea unavailable.');
  return res.json({success:true,idea:data});
}));
communityRouter.get('/staff/board',run(async(req,res)=>{
  const user=req.session.user;
  if(!user || !staffRole(user.role)) throw new CommunityError(user ? 403 : 401,'Staff access required.');
  return res.json({success:true,...await loadStaffBoard(boardFilters(req.query))});
}));
communityPages.get('/inbox',(_req,res)=>{res.setHeader('Cache-Control','private, no-store');res.render('private-inbox',{title:'Private school messages — SuggFeed'});});
communityPages.get('/admin/community',run(async(req,res)=>{
  const user=req.session.user;
  if(!user) return res.redirect('/admin');
  if(!staffRole(user.role)) return res.status(403).render('error',{title:'Access denied',message:'Staff access required.'});
  res.setHeader('Cache-Control','private, no-store');
  res.render('staff-community',{title:'Community care — SuggFeed',activeSection:'community',submissionId:typeof req.query.idea==='string' && /^[a-f0-9-]{36}$/i.test(req.query.idea) ? req.query.idea : '',...await staffCommunity(user),members:await loadStaffMembers()});
}));
communityPages.get('/admin/board',run(async(req,res)=>{
  const user=req.session.user;
  if(!user) return res.redirect('/admin');
  if(!staffRole(user.role)) return res.status(403).render('error',{title:'Access denied',message:'Staff access required.'});
  res.setHeader('Cache-Control','private, no-store');
  const [board,members]=await Promise.all([loadStaffBoard(boardFilters(req.query)),loadStaffMembers()]);
  res.render('staff-board',{title:'Work board — SuggFeed',activeSection:'board',...board,members});
}));
