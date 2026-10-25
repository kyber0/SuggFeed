import rateLimit from 'express-rate-limit';
import {Router} from 'express';
import {schoolUser} from '../lib/school-scope';
import {sameOriginOnly} from '../lib/security';
import {assignmentAction,AssignmentError} from '../lib/assignment/service';
import {cronAuthorized} from '../lib/read-budget';
import {supabasePlatform} from '../lib/supabase';
const router=Router();
const writeLimit=rateLimit({windowMs:60000,limit:40,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,error:'Please wait before changing assignments again.'}});
router.get('/internal/assignment-escalation',async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(!cronAuthorized(req.get('authorization')))return res.status(401).json({success:false,error:'Unauthorized.'});
 const {data,error}=await supabasePlatform.rpc('assignment_tick',{p_limit:100});
 if(error)return res.status(503).json({success:false,error:'Assignment processing is temporarily unavailable.'});
 res.json({success:true,...data});
});
router.get('/admin/assignments',async(req,res,next)=>{
 const user=schoolUser(req);if(!user||!['admin','moderator'].includes(user.role||''))return res.status(403).render('403',{title:'Staff access required'});
 res.setHeader('Cache-Control','private, no-store');
 try{
 const views=user.role==='admin'?['mine','triage','all','overdue','rules','teams','workload','settings','history']:['mine','history'];
 const view=views.includes(String(req.query.view))?String(req.query.view):'mine';
 const [list,state]=await Promise.all([view==='history'?Promise.resolve({items:[],page:1}):assignmentAction(user.id,'list',{view,page:typeof req.query.page==='string'?req.query.page:'1'}),user.role==='admin'?assignmentAction(user.id,'state'):Promise.resolve(null)]);
 const history=view==='history'?await assignmentAction(user.id,'history',{kind:req.query.kind,id:req.query.id}):null;
 res.render('assignments',{history,title:'Assignments — SuggFeed',activeSection:'assignments',view,list,state,isAssignmentAdmin:user.role==='admin'});
 }catch(error){if(error instanceof AssignmentError)return res.status(error.status).render('school-message',{title:'Assignments unavailable',message:error.message,nextHref:'/admin',nextLabel:'Back to staff workspace'});next(error);}
});
router.post('/admin/assignments/action',sameOriginOnly,writeLimit,async(req,res,next)=>{
 const user=schoolUser(req);if(!user||!['admin','moderator'].includes(user.role||''))return res.status(403).json({success:false,error:'Staff access required.'});
 res.setHeader('Cache-Control','private, no-store');
 const action=req.body?.action;if(typeof action!=='string'||!['settings','team','assignee','rule','assign','retry','availability','preferences','acknowledge','history','notifications','read-notice'].includes(action))return res.status(400).json({success:false,error:'Choose an assignment action.'});
 try{res.json({success:true,...await assignmentAction(user.id,action,req.body?.data||{})});}catch(error){if(error instanceof AssignmentError)return res.status(error.status).json({success:false,error:error.message});next(error);}
});
export default router;
