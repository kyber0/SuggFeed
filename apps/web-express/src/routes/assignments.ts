import rateLimit from 'express-rate-limit';
import {Router} from 'express';
import {schoolUser} from '../lib/school-scope';
import {sameOriginOnly} from '../lib/security';
import {assignmentAction,AssignmentError} from '../lib/assignment/service';
import {cronAuthorized} from '../lib/read-budget';
import {supabaseService,supabasePlatform} from '../lib/supabase';
const router=Router();
const writeLimit=rateLimit({windowMs:60000,limit:40,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,error:'Please wait before changing assignments again.'}});
router.get('/internal/assignment-escalation',async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(!cronAuthorized(req.get('authorization')))return res.status(401).json({success:false,error:'Unauthorized.'});
 const {data,error}=await supabasePlatform.rpc('assignment_tick',{p_limit:100});
 if(error)return res.status(503).json({success:false,error:'Assignment processing is temporarily unavailable.'});
 res.json({success:true,...data});
});
router.get(['/admin/assignments','/admin/my-work','/admin/work','/admin/routing'],async(req,res,next)=>{
 const user=schoolUser(req);if(!user||!['admin','moderator'].includes(user.role||''))return res.status(403).render('403',{title:'Staff access required'});
 res.setHeader('Cache-Control','private, no-store');
 if(req.path==='/admin/work'&&req.query.presentation==='list'){const query=new URLSearchParams();for(const [key,value] of Object.entries(req.query))if(typeof value==='string')query.set(key,value);query.set('presentation','board');return res.redirect(302,'/admin/work?'+query.toString());}
 const configuration=['rules','teams','workload','settings'];
 if(req.path==='/admin/assignments'||req.path==='/admin/my-work'){
  const params=new URLSearchParams();for(const key of ['view','page','kind','id'])if(typeof req.query[key]==='string')params.set(key,String(req.query[key]));
  return res.redirect(302,(configuration.includes(String(req.query.view))?'/admin/routing':'/admin/work')+(params.size?'?'+params.toString():''));
 }
 if(req.path==='/admin/work'&&(['board','calendar'].includes(String(req.query.presentation))||req.query.idea&&!req.query.presentation))return next();
 const routing=req.path==='/admin/routing';
 if(routing&&user.role!=='admin')return res.status(403).render('403',{title:'School administrator access required'});
 try{
 const views=routing?configuration:user.role==='admin'?['mine','triage','all','overdue','history']:['mine','history'];
 const view=views.includes(String(req.query.view))?String(req.query.view):routing?'teams':'mine';
 const [list,state]=await Promise.all([routing||view==='history'?Promise.resolve({items:[],page:1}):assignmentAction(user.id,'list',{view,page:typeof req.query.page==='string'&&/^\d{1,6}$/.test(req.query.page)?req.query.page:'1'}),user.role==='admin'?assignmentAction(user.id,'state'):Promise.resolve(null)]);
 if(user.role==='admin'){
  const reports=list.items.filter((item:{item_kind:string;item_id:string;queueHref?:string})=>item.item_kind==='report');
  if(reports.length){const result=await supabaseService.from('reports').select('id,comment_id').in('id',reports.map((item:{item_id:string})=>item.item_id));if(result.error)throw result.error;for(const item of reports)item.queueHref=result.data?.find(report=>report.id===item.item_id)?.comment_id?'/admin/safety?section=comments':'/admin/safety';}
 }
 if(!routing&&view!=='history'&&list.page>1&&!list.items.length)return res.redirect(302,'/admin/work?'+new URLSearchParams({view,notice:'page-changed'}).toString());
 const history=view==='history'?await assignmentAction(user.id,'history',{kind:req.query.kind,id:req.query.id}):null;
 res.render('assignments',{pageChanged:req.query.notice==='page-changed',routing,presentation:'tasks',assignmentBase:routing?'/admin/routing':'/admin/work',history,title:(routing?'Routing & teams':'Work')+' — SuggFeed',activeSection:routing?'routing':'work',view,list,state,isAssignmentAdmin:user.role==='admin'});
 }catch(error){if(error instanceof AssignmentError)return res.status(error.status).render('school-message',{title:'Assignments unavailable',message:error.message,nextHref:routing?'/admin/routing':'/admin/work',nextLabel:'Try again'});next(error);}
});
router.post('/admin/assignments/action',sameOriginOnly,writeLimit,async(req,res,next)=>{
 const user=schoolUser(req);if(!user||!['admin','moderator'].includes(user.role||''))return res.status(403).json({success:false,error:'Staff access required.'});
 res.setHeader('Cache-Control','private, no-store');
 const action=req.body?.action;if(typeof action!=='string'||!['settings','team','assignee','rule','assign','retry','availability','preferences','acknowledge','history','notifications','read-notice'].includes(action))return res.status(400).json({success:false,error:'Choose an assignment action.'});
 try{res.json({success:true,...await assignmentAction(user.id,action,req.body?.data||{})});}catch(error){if(error instanceof AssignmentError)return res.status(error.status).json({success:false,error:error.message});next(error);}
});
export default router;
