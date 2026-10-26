import {summarizeAnalytics} from '../../src/lib/analytics';
import { DEFAULT_DIGEST_KINDS, nextDigestWindow } from '../../src/lib/digest-preferences';
// Local-only visual harness with in-memory fixtures. Never mounted in production.
import express from 'express';
import path from 'node:path';
import { Eta } from 'eta';
import { queueFilters } from '../../src/lib/staff-workspace';
import { boardFilters, BOARD_STAGES, WORK_STAGES, BOARD_WINDOW_LIMIT } from '../../src/lib/staff-board';
import { roadmapFilters, groupTreeByCategory, groupTimelineByMonth, formatManilaDate, buildWorkTimeline } from '../../src/lib/roadmap';

export function createWorkspacePreview() {
 const app=express();const root=path.resolve(__dirname,'../..');const eta=new Eta({views:path.join(root,'views')});
 const staffId='00000000-0000-4000-8000-000000000010';
 const titles=['More shaded seating near the science building','Keep the library open during exam week','Better lighting along the east walkway','Water refill stations in every building','A quieter space for independent study','Covered bicycle parking near the main gate'];
 const statuses=['pending','approved','in_progress','resolved','rejected','pending'];
 const items=titles.map((title,index)=>({
  id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),title,
  description:'Students use this area every day, but it could be more welcoming. A small improvement would make a real difference, especially between classes. Please consider this in the next round of campus improvements.',
  status:statuses[index],category:index%2?'Learning':'Facilities',created_at:'2026-09-01T10:00:00Z',updated_at:'2026-10-10T10:00:00Z',
  resolved_at:statuses[index]==='resolved'?'2026-10-10T12:00:00Z':null,
  vote_count:24+index*7,comment_count:index+2,staff_note:index===1?'The library team is reviewing staffing for extended hours during exams. We will post an update after the next planning meeting.':'',
  assignee_id:index===2?staffId:'',assignee_name:index===2?'Alex Reyes':'',priority:index===2?'high':'normal',target_date:index===2?'2026-10-09':''
 }));
 for(let index=6;index<36;index++) items.push({...items[index%6],id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),title:titles[index%6]+' · Campus zone '+(index+1),status:['approved','in_progress','resolved'][index%3],resolved_at:['approved','in_progress','resolved'][index%3]==='resolved'?'2026-10-10T12:00:00Z':null});
 // Match the production inline-handler restriction for browser regression checks.
 app.use((_req,res,next)=>{res.setHeader('Content-Security-Policy',"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://challenges.cloudflare.com; script-src-attr 'none'");next();});
 app.use(express.json());app.use(express.static(path.join(root,'public')));
 const privateRequests=[{id:'50000000-0000-4000-8000-000000000001',submission_id:items[0].id,title:items[0].title,prompt:'Which campus zone would benefit most from shaded seating?',reply:null as string|null,created_at:'2026-10-01T10:00:00Z',replied_at:null as string|null,closed_at:null as string|null}];
 app.get('/profile',(_req,res)=>res.send(eta.render('profile',{currentPath:'/profile',user:{id:staffId,display_name:'Preview member',role:'student'},profile:{display_name:'Preview member'},submissions:[],bookmarks:[]})));
 app.get('/inbox',(_req,res)=>res.send(eta.render('private-inbox',{currentPath:'/inbox',user:{id:staffId,display_name:'Preview member',role:'student'}})));
 app.get('/notifications',(_req,res)=>res.send(eta.render('notifications',{currentPath:'/notifications',user:{id:staffId,display_name:'Preview member',role:'student'},signedIn:true})));
 app.get('/api/notifications/preferences',(_req,res)=>res.json({success:true,preferences:{update_mode:'all',weekly_digest:false,digest_paused:false,digest_kinds:DEFAULT_DIGEST_KINDS},digestAvailable:false,nextDigestWindow:nextDigestWindow()}));
 app.post('/api/notifications/preferences',(_req,res)=>res.json({success:true}));
 app.get('/api/notifications',(_req,res)=>res.json({success:true,notifications:[],unreadCount:0,nextCursor:null}));
 app.get('/api/community/report-history',(_req,res)=>res.json({success:true,reports:[{reason:'A comment included personal details.',resolution:'removed',resolution_reason:'Removed to protect student privacy.'}]}));
 app.get('/api/community/merges/:id',(_req,res)=>res.json({success:true,merges:[]}));
 app.get('/api/community/similar',(_req,res)=>res.json({success:true,ideas:items.filter(s=>['approved','in_progress','resolved'].includes(s.status)).slice(0,3)}));
 app.post('/api/community/inbox',(_req,res)=>res.json({success:true,requests:privateRequests}));
 app.post('/api/community/reply',(req,res)=>{const entry=privateRequests.find(x=>x.id===req.body.id);if(!entry)return res.status(404).json({success:false});entry.reply=req.body.body;entry.replied_at=new Date().toISOString();return res.json({success:true});});
 app.post('/api/community/report',(_req,res)=>res.json({success:true}));
 const boardItems=items.map(s=>({...s,categories:{name:s.category}}));
 for(let index=36;index<186;index++) boardItems.push({...boardItems[index%36],id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),title:titles[index%6]+' · Campus zone '+(index+1),status:BOARD_STAGES[index%5].status,categories:{name:index%2?'Learning':'Facilities'}});
 app.get('/admin/board',(req,res)=>{
  const filters=boardFilters(req.query);
  const lanes=WORK_STAGES.map(stage=>{
   const all=req.query.empty?[]:boardItems.filter(item=>item.status===stage.status && (!filters.search || (item.title+' '+item.description).toLowerCase().includes(filters.search.toLowerCase())));
   all.sort((a,b)=>{const comparison=a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);return filters.sort==='newest'?-comparison:comparison;});
   const count=all.length,pageCount=Math.max(1,Math.ceil(count/filters.pageSize)),page=Math.min(filters.pages[stage.status],pageCount);
   const rows=all.slice((page-1)*filters.pageSize,page*filters.pageSize);
   return {...stage,count,page,pageCount,from:count?(page-1)*filters.pageSize+1:0,to:count?Math.min(page*filters.pageSize,count):0,hasPrevious:page>1,hasNext:page<pageCount,items:rows};
  });
  const pages=Object.fromEntries(lanes.map(lane=>[lane.status,lane.page]));
  res.send(eta.render('staff-board',{windowLimit:BOARD_WINDOW_LIMIT,currentPath:'/admin/board',activeSection:'board',user:{id:staffId,display_name:'Alex Reyes',full_name:'Alex Reyes',role:'admin'},items:lanes.flatMap(lane=>lane.items),lanes,filters:{...filters,pages},totalCount:lanes.reduce((sum,lane)=>sum+lane.count,0),members:[{id:staffId,display_name:'Alex Reyes'}]}));
 });
 app.get('/admin/community',(_req,res)=>res.send(eta.render('staff-community',{currentPath:'/admin/community',activeSection:'community',user:{id:staffId,display_name:'Alex Reyes',full_name:'Alex Reyes',role:'admin'},alerts:items.slice(0,3).map(s=>({id:s.id,title:s.title,reason:'No public update for 30 days'})),coverage:'Local visual fixtures only; no live database writes.',requests:privateRequests.map(r=>({...r,submission:{title:r.title}})),reports:[{id:'60000000-0000-4000-8000-000000000001',reason:'Contains a student name and phone number.',comment:{body:'[Preview of a reported comment]'}}],members:[{id:staffId,display_name:'Alex Reyes'}]})));
 app.post('/api/community/staff/bulk_assign',(_req,res)=>res.json({success:true}));
 const comments:Array<{id:string;submission_id:string;body:string;display_name:string;created_at:string;parent_id:string|null}>=[];
 const feedPage=(query:Record<string,unknown>)=>{
  const page=Math.max(1,Number(query.page)||1);
  const sortBy=String(query.sort||'all'),category=String(query.category||'All'),search=String(query.search||'').trim();
  const matched=query.empty?[]:items.filter(i=>['approved','in_progress','resolved'].includes(i.status) && (category==='All'||i.category===category) && (!search||(i.title+' '+i.description).toLowerCase().includes(search.toLowerCase())));
  if(['top','popular'].includes(sortBy))matched.sort((a,b)=>b.vote_count-a.vote_count);
  return {feed:matched.slice((page-1)*15,page*15),totalCount:matched.length,hasMore:page*15<matched.length,page,sortBy,category,search};
 };
 app.get('/feed',(req,res)=>{
  res.send(eta.render('feed',{currentPath:'/feed',user:null,...feedPage(req.query),categories:['Facilities','Learning','Safety','Student life','Other']}));
 });
 app.get('/api/feed',(req,res)=>{
  res.json({success:true,...feedPage(req.query)});
 });
 const voted=new Set<string>();let voteAttempts=0;
 app.post('/api/vote/:id',(req,res)=>{
  const item=items.find(i=>i.id===req.params.id);if(!item)return res.sendStatus(404);
  if(voteAttempts++===0)return res.status(503).json({success:false});
  const already_voted=voted.has(item.id),support=req.body?.action!=='unvote';if(support&&!already_voted){voted.add(item.id);item.vote_count++;}else if(!support&&already_voted){voted.delete(item.id);item.vote_count--;}
  res.json({success:true,vote_count:item.vote_count,voted:support,already_voted});
 });
 app.get('/idea/:id',(req,res)=>{
  const submission=items.find(i=>i.id===req.params.id);if(!submission)return res.sendStatus(404);
  res.send(eta.render('idea',{currentPath:'/feed',user:null,submission,comments:comments.filter(c=>c.submission_id===submission.id)}));
 });
 app.get('/api/idea/:id',(req,res)=>{
  const submission=items.find(i=>i.id===req.params.id);if(!submission)return res.sendStatus(404);
  res.json({success:true,submission,comments:comments.filter(c=>c.submission_id===submission.id)});
 });
 app.post('/api/comments/:id',(req,res)=>{
  const submission=items.find(i=>i.id===req.params.id);if(!submission)return res.sendStatus(404);
  if(!['approved','in_progress','resolved'].includes(submission.status))return res.status(403).json({success:false,error:'Comments are not open for this submission.'});
  if(typeof req.body.body!=='string' || req.body.body.trim().length<10 || req.body.body.trim().length>500)return res.status(400).json({success:false,error:'Comment must contain 10–500 characters.'});
  const data={id:String(comments.length+1),submission_id:submission.id,body:req.body.body.trim(),display_name:'Preview Student',created_at:new Date().toISOString(),parent_id:req.body.parentId || null};
  comments.push(data);submission.comment_count++;res.json({success:true,data});
 });
 const notes:Array<{id:string;submission_id:string;body:string;created_at:string;actor:{display_name:string}}>=[];
 const history:Array<any>=[];
 const views:Array<any>=[];
 const publicItem=(item:typeof items[number])=>({id:item.id,title:item.title,description:item.description,status:item.status,category:item.category,votes:item.vote_count,comments:item.comment_count,created_at:item.created_at,updated_at:item.updated_at,resolved_at:(item as any).resolved_at || null,resolved_at_estimated:false,progress_percent:item.status==='resolved'?100:item.status==='in_progress'?35:null,started_at:item.status==='resolved'?'2026-09-20T08:00:00Z':item.status==='in_progress'?'2026-09-10T08:00:00Z':null,is_blocked:false,response:item.staff_note,last_public_update:null,outcome:''});
 const progressUpdates:Array<any>=[];
 const progressSnapshot=(item:typeof items[number])=>({...item,progress_percent:item.status==='resolved'?100:null,started_at:['in_progress','resolved'].includes(item.status)?'2026-09-10T08:00:00Z':null,is_blocked:false});
 const previewWorkflow=(item:typeof items[number])=>({mode:'guided',paused:false,issues:[],canRepair:false,allowedActions:item.status==='pending'?['approve','decline']:item.status==='approved'?['start','withdraw']:item.status==='in_progress'?['update','milestone','pause','complete','correction','withdraw']:item.status==='resolved'?['reopen','correction','withdraw']:[]});
 app.get('/staff/workspace/:id/updates',(req,res)=>{const item=items.find(i=>i.id===req.params.id);if(!item)return res.status(404).json({success:false});res.json({success:true,submission:progressSnapshot(item),workflow:previewWorkflow(item),updates:progressUpdates.filter(update=>update.submission_id===item.id),limit:100});});
 app.post('/staff/workspace/:id/updates',(req,res)=>{
  const item=items.find(i=>i.id===req.params.id);if(!item)return res.status(404).json({success:false});
  const replay=progressUpdates.find(update=>update.request_id===req.body.requestId);
  if(replay)return res.json({success:true,update:replay,submission:progressSnapshot(item),replayed:true});
  if(item.updated_at!==req.body.updatedAt)return res.status(409).json({success:false,error:'This submission changed. Refresh it before posting; keep your draft.'});
  const update={id:'00000000-0000-4000-8000-'+String(1000+progressUpdates.length).padStart(12,'0'),submission_id:item.id,request_id:req.body.requestId,kind:req.body.kind,body:req.body.body,visibility:req.body.visibility,percent:req.body.percent??null,blocked_reason:req.body.blockedReason||null,next_step:req.body.nextStep||null,occurred_on:req.body.occurredOn,office_label:'School administration',created_at:new Date().toISOString(),files:[]};
  if(update.visibility==='public'){if(update.kind==='completed'){item.status='resolved';item.staff_note=update.body;item.resolved_at=update.created_at;}else if(item.status==='approved'&&['started','update','milestone'].includes(update.kind))item.status='in_progress';item.updated_at=update.created_at;}
  progressUpdates.unshift(update);res.status(201).json({success:true,update,submission:progressSnapshot(item),replayed:false});
 });
 app.get('/roadmap',(req,res)=>{
  const filters=roadmapFilters(req.query);
  const matched=req.query.empty?[]:items.filter(i=>['approved','in_progress','resolved'].includes(i.status) && (filters.category==='all' || filters.category===i.category) && (!filters.search || (i.title+' '+i.description).toLowerCase().includes(filters.search.toLowerCase())));
  const counts=Object.fromEntries(['approved','in_progress','resolved'].map(s=>[s,matched.filter(i=>i.status===s).length]));
  const selected=matched.filter(i=>filters.stage==='all' || filters.stage===i.status);
  const pageItems=['done','timeline'].includes(filters.view)?selected.slice((filters.page-1)*20,filters.page*20):filters.view==='tree'?selected: ['approved','in_progress','resolved'].filter(s=>filters.stage==='all' || filters.stage===s).flatMap(s=>matched.filter(i=>i.status===s).slice((filters.page-1)*8,filters.page*8));
  const mappedItems=pageItems.map(publicItem);
  const recentlyCompleted=items.filter(i=>i.status==='resolved').map(publicItem).slice(0,3);
  const categories=['Facilities','Learning'];
  const treeData=groupTreeByCategory(selected.map(publicItem),categories).map(branch=>({...branch,leaves:branch.leaves.slice(filters.category==='all'?0:(filters.page-1)*8,filters.category==='all'?8:filters.page*8)}));
  const timelineData=groupTimelineByMonth(mappedItems);
  res.send(eta.render('roadmap',{currentPath:'/roadmap',user:null,items:filters.view==='tree'?treeData.flatMap(branch=>branch.leaves):mappedItems,counts,totalCount:items.filter(i=>['approved','in_progress','resolved'].includes(i.status)).length,matchingCount:selected.length,pageCount:['done','timeline'].includes(filters.view)?Math.max(1,Math.ceil(selected.length/20)):filters.view==='tree'?(filters.category==='all'?1:Math.max(1,Math.ceil(selected.length/8))):Math.max(1,...Object.entries(counts).filter(([s])=>filters.stage==='all' || filters.stage===s).map(([,count])=>Math.ceil(count/8))),perStage:8,filters,categories,recentlyCompleted,treeData,timelineData,workTimeline:buildWorkTimeline(mappedItems),formatManilaDate}));
 });
 app.get('/roadmap/idea/:id',(req,res)=>{const item=items.find(i=>i.id===req.params.id && ['approved','in_progress','resolved'].includes(i.status));res.status(item?200:404).json(item?{success:true,item:publicItem(item),updates:progressUpdates.filter(update=>update.submission_id===item.id&&update.visibility==='public').map(({submission_id,request_id,visibility,...update})=>update)}:{success:false});});
 app.get('/admin',(req,res)=>{
  const filters=queueFilters({...req.query,status:req.query.status || 'all'});
  const page=Math.max(1,Number(req.query.page)||1);
  const matched=req.query.empty?[]:items.filter(i=>(filters.status==='all' || i.status===filters.status) && (filters.assignment==='all' || filters.assignment==='mine'?filters.assignment!=='mine' || i.assignee_id===staffId:!i.assignee_id) && (filters.priority==='all' || filters.priority===i.priority) && (filters.overdue==='false' || (!!i.target_date && i.target_date<'2026-10-11' && !['resolved','rejected'].includes(i.status))) && (!filters.search || (i.title+' '+i.description).toLowerCase().includes(filters.search.toLowerCase())));
  const counts=Object.fromEntries(['pending','approved','in_progress','resolved','rejected'].map(s=>[s,items.filter(i=>i.status===s).length]));
  res.send(eta.render('admin',{currentPath:'/admin',user:{id:staffId,display_name:'Alex Reyes',full_name:'Alex Reyes',role:'admin'},counts:{...counts,all:items.length},status:filters.status,search:filters.search,filters,page,pageCount:Math.max(1,Math.ceil(matched.length/15)),perPage:15,totalCount:matched.length,submissions:matched.slice((page-1)*15,page*15),staffMembers:[{id:staffId,display_name:'Alex Reyes',role:'admin'}],savedViews:views}));
 });
 app.get('/admin/analytics',(req,res)=>{
  const counts=Object.fromEntries(['pending','approved','in_progress','resolved','rejected'].map(s=>[s,items.filter(i=>i.status===s).length]));
  const analytics=summarizeAnalytics(items.map(item=>({...item,categories:{name:item.category},created_at:'2026-10-16T10:00:00Z'})),req.query,new Date('2026-10-18T05:00:00Z'));
  res.send(eta.render('admin-analytics',{currentPath:'/admin/analytics',user:{id:staffId,display_name:'Alex Reyes',role:'admin'},counts:{...counts,all:items.length},analytics,activeSection:'analytics'}));
 });
 app.get('/admin/staff',(req,res)=>{
  const counts=Object.fromEntries(['pending','approved','in_progress','resolved','rejected'].map(s=>[s,items.filter(i=>i.status===s).length]));
  const staffMembers=[{id:staffId,display_name:'Alex Reyes',email:'alex@school.edu.ph',role:'admin',created_at:'2026-08-01'},{id:'00000000-0000-4000-8000-000000000020',display_name:'Maria Santos',email:'maria@school.edu.ph',role:'moderator',created_at:'2026-08-15'}];
  const students=[{id:'00000000-0000-4000-8000-000000000030',display_name:'Juan Dela Cruz',email:'juan@school.edu.ph',role:'student',created_at:'2026-09-01'}];
  res.send(eta.render('admin-staff',{currentPath:'/admin/staff',user:{id:staffId,display_name:'Alex Reyes',role:'admin'},counts:{...counts,all:items.length},staffMembers,students,activeSection:'staff'}));
 });
 app.get('/api/staff/members',(_req,res)=>res.json({success:true,members:[{id:staffId,display_name:'Alex Reyes',email:'alex@school.edu.ph',role:'admin'}]}));
 app.get('/api/staff/submissions/:id',(req,res)=>{const item=items.find(i=>i.id===req.params.id);res.status(item?200:404).json(item?{success:true,item:{id:item.id,title:item.title,description:item.description,status:item.status,category:item.category,created_at:item.created_at,updated_at:item.updated_at,staff_note:item.staff_note || '',assignee_id:item.assignee_id || '',priority:item.priority || 'normal',target_date:item.target_date || '',started_at:progressSnapshot(item).started_at,resolved_at:item.resolved_at,is_blocked:false,workflow:previewWorkflow(item)}}:{success:false});});
 app.get('/api/staff/students',(_req,res)=>res.json({success:true,students:[{id:'00000000-0000-4000-8000-000000000030',display_name:'Juan Dela Cruz',email:'juan@school.edu.ph'}]}));
 app.patch('/api/staff/members/:id/role',(_req,res)=>res.json({success:true}));
 app.post('/api/staff/invite',(req,res)=>res.json({success:true,isExisting:false,inviteUrl:'/staff-login?invite='+encodeURIComponent(req.body.email)}));
 app.get('/staff-login',(_req,res)=>res.send(eta.render('staff-login',{currentPath:'/admin',user:null})));
 app.get('/api/staff/submissions/:id/activity',(req,res)=>res.json({success:true,history:history.filter(e=>e.submission_id===req.params.id),transitions:[],notes:notes.filter(e=>e.submission_id===req.params.id)}));
 app.post('/api/staff/submissions/:id/notes',(req,res)=>{notes.unshift({id:String(notes.length+1),submission_id:req.params.id,body:req.body.body,created_at:new Date().toISOString(),actor:{display_name:'Alex Reyes'}});res.status(201).json({success:true});});
 app.post('/api/staff/views',(req,res)=>{views.push({id:'00000000-0000-4000-8000-'+String(100+views.length).padStart(12,'0'),name:req.body.name,filters:req.body.filters});res.status(201).json({success:true});});
 app.delete('/api/staff/views/:id',(req,res)=>{const index=views.findIndex(v=>v.id===req.params.id);if(index>=0)views.splice(index,1);res.json({success:true});});
 let attempts=0;
 app.patch('/api/staff/submissions/:id/review',(req,res)=>{
  attempts++;if(attempts===1)return res.status(503).json({error:'Fixture save failure'});
  const item=items.find(i=>i.id===req.params.id);if(!item)return res.status(404).json({success:false});
  if(item.updated_at!==req.body.updatedAt)return res.status(409).json({success:false});
  const previous={status:item.status,assignee_id:item.assignee_id || null,priority:item.priority,target_date:item.target_date || null,response:item.staff_note || null};
  Object.assign(item,{status:req.body.status,staff_note:req.body.note,assignee_id:req.body.assignee || '',assignee_name:req.body.assignee?'Alex Reyes':'',priority:req.body.priority,target_date:req.body.targetDate || '',updated_at:new Date().toISOString()});
  history.unshift({submission_id:item.id,previous,current:{status:item.status,assignee_id:item.assignee_id || null,priority:item.priority,target_date:item.target_date || null,response:item.staff_note || null},created_at:item.updated_at,actor:{display_name:'Alex Reyes'}});
  return res.json({success:true});
 });
 return app;
}
if(require.main===module)createWorkspacePreview().listen(4317,'127.0.0.1',()=>console.log('Local fixture preview: http://127.0.0.1:4317'));
