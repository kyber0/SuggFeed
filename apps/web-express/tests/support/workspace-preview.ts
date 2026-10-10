// Local-only visual harness with in-memory fixtures. Never mounted in production.
import express from 'express';
import path from 'node:path';
import { Eta } from 'eta';
import { queueFilters } from '../../src/lib/staff-workspace';
import { roadmapFilters } from '../../src/lib/roadmap';

export function createWorkspacePreview() {
 const app=express();const root=path.resolve(__dirname,'../..');const eta=new Eta({views:path.join(root,'views')});
 const staffId='00000000-0000-4000-8000-000000000010';
 const titles=['More shaded seating near the science building','Keep the library open during exam week','Better lighting along the east walkway','Water refill stations in every building','A quieter space for independent study','Covered bicycle parking near the main gate'];
 const statuses=['pending','approved','in_progress','resolved','rejected','pending'];
 const items=titles.map((title,index)=>({
  id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),title,
  description:'Students use this area every day, but it could be more welcoming. A small improvement would make a real difference, especially between classes. Please consider this in the next round of campus improvements.',
  status:statuses[index],category:index%2?'Learning':'Facilities',created_at:'2026-10-08T10:00:00Z',updated_at:'2026-10-10T10:00:00Z',
  vote_count:24+index*7,comment_count:index+2,staff_note:index===1?'The library team is reviewing staffing for extended hours during exams. We will post an update after the next planning meeting.':'',
  assignee_id:index===2?staffId:'',assignee_name:index===2?'Alex Reyes':'',priority:index===2?'high':'normal',target_date:index===2?'2026-10-09':''
 }));
 for(let index=6;index<36;index++) items.push({...items[index%6],id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),title:titles[index%6]+' · Campus zone '+(index+1),status:['approved','in_progress','resolved'][index%3]});
 // Match the production inline-handler restriction for browser regression checks.
 app.use((_req,res,next)=>{res.setHeader('Content-Security-Policy',"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://challenges.cloudflare.com; script-src-attr 'none'");next();});
 app.use(express.json());app.use(express.static(path.join(root,'public')));
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
  const already_voted=voted.has(item.id);if(!already_voted){voted.add(item.id);item.vote_count++;}
  res.json({success:true,vote_count:item.vote_count,already_voted});
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
 const publicItem=(item:typeof items[number])=>({id:item.id,title:item.title,description:item.description,status:item.status,category:item.category,votes:item.vote_count,comments:item.comment_count,created_at:item.created_at,updated_at:item.updated_at,response:item.staff_note});
 app.get('/roadmap',(req,res)=>{
  const filters=roadmapFilters(req.query);
  const matched=req.query.empty?[]:items.filter(i=>['approved','in_progress','resolved'].includes(i.status) && (filters.category==='all' || filters.category===i.category) && (!filters.search || (i.title+' '+i.description).toLowerCase().includes(filters.search.toLowerCase())));
  const counts=Object.fromEntries(['approved','in_progress','resolved'].map(s=>[s,matched.filter(i=>i.status===s).length]));
  const pageItems=['approved','in_progress','resolved'].filter(s=>filters.stage==='all' || filters.stage===s).flatMap(s=>matched.filter(i=>i.status===s).slice((filters.page-1)*8,filters.page*8));
  res.send(eta.render('roadmap',{currentPath:'/roadmap',user:null,items:pageItems.map(publicItem),counts,totalCount:items.filter(i=>['approved','in_progress','resolved'].includes(i.status)).length,matchingCount:matched.length,pageCount:Math.max(1,...Object.entries(counts).filter(([s])=>filters.stage==='all' || filters.stage===s).map(([,count])=>Math.ceil(count/8))),perStage:8,filters,categories:['Facilities','Learning']}));
 });
 app.get('/roadmap/idea/:id',(req,res)=>{const item=items.find(i=>i.id===req.params.id && ['approved','in_progress','resolved'].includes(i.status));res.status(item?200:404).json(item?{success:true,item:publicItem(item)}:{success:false});});
 app.get('/admin',(req,res)=>{
  const filters=queueFilters({...req.query,status:req.query.status || 'all'});
  const page=Math.max(1,Number(req.query.page)||1);
  const matched=req.query.empty?[]:items.filter(i=>(filters.status==='all' || i.status===filters.status) && (filters.assignment==='all' || filters.assignment==='mine'?filters.assignment!=='mine' || i.assignee_id===staffId:!i.assignee_id) && (filters.priority==='all' || filters.priority===i.priority) && (filters.overdue==='false' || (!!i.target_date && i.target_date<'2026-10-11' && !['resolved','rejected'].includes(i.status))) && (!filters.search || (i.title+' '+i.description).toLowerCase().includes(filters.search.toLowerCase())));
  const counts=Object.fromEntries(['pending','approved','in_progress','resolved','rejected'].map(s=>[s,items.filter(i=>i.status===s).length]));
  res.send(eta.render('admin',{currentPath:'/admin',user:{id:staffId,display_name:'Alex Reyes',full_name:'Alex Reyes',role:'admin'},counts:{...counts,all:items.length},status:filters.status,search:filters.search,filters,page,pageCount:Math.max(1,Math.ceil(matched.length/15)),perPage:15,totalCount:matched.length,submissions:matched.slice((page-1)*15,page*15),staffMembers:[{id:staffId,display_name:'Alex Reyes',role:'admin'}],savedViews:views}));
 });
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
