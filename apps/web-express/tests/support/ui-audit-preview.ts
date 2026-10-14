// Local UI fixtures; no hosted authentication or database writes.
import express from 'express';
import path from 'node:path';
import {Eta} from 'eta';
import {createWorkspacePreview} from './workspace-preview';
const root=path.resolve(__dirname,'../..'),eta=new Eta({views:path.join(root,'views')});
export function createUIAuditPreview(){
 const app=express();app.use(express.json());
 const user={id:'00000000-0000-4000-8000-000000000010',full_name:'Alexandriaverylongdisplayname Reyes',email:'student@school.example',role:'student'};
 app.get('/',(_req,res)=>res.send(eta.render('home',{currentPath:'/',user:null,categories:['Facilities','Learning','Safety','Student life','Other'],feed:[]})));
 app.get('/profile',(req,res,next)=>req.query.persona?res.send(eta.render('profile',{currentPath:'/profile',user:req.query.persona==='guest'?null:user,profile:{display_name:user.full_name},submissions:[],bookmarks:[]})):next());
 for(const view of ['privacy','terms','403','404','500'])app.get('/'+view,(_req,res)=>res.send(eta.render(view,{currentPath:'/'+view,user:null,title:view+' — SuggFeed'})));
 for(const route of ['/auth/callback','/auth/recovery'])app.get(route,(_req,res)=>res.send(eta.render('auth-callback',{currentPath:route,user:null})));
 app.get('/digest/unsubscribe',(_req,res)=>res.send(eta.render('digest-unsubscribe',{currentPath:'/digest/unsubscribe',user:null,valid:false,done:false})));
 app.post('/profile/activity',(_req,res)=>res.json({success:true,rows:[],next:null}));
 app.get('/api/submission-context',(_req,res)=>res.json({success:true,actor:'a'.repeat(64),signedIn:false}));
 app.use(createWorkspacePreview());return app;
}
if(require.main===module)createUIAuditPreview().listen(4319,'127.0.0.1',()=>console.log('Local UI audit fixtures ready on 4319'));
