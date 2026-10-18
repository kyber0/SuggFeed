// Local UI fixtures; no hosted authentication or database writes.
import express from 'express';
import path from 'node:path';
import {Eta} from 'eta';
import {invitationRoles} from '../../src/lib/invitation-email';
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
 const school={id:'00000000-0000-4000-8000-000000000001',slug:'demo',name:'SuggFeed demo school',status:'active'};
 const staff={...user,role:'admin'};const settings={version:1,approved_at:'2026-10-17T05:00:00Z',privacy_notice:'Fictional preview privacy notice. No hosted data is used.',terms_notice:'Fictional preview participation terms for UI review only.',age_policy:'Fictional preview eligibility policy.',privacy_contact:'privacy@example.test',school_contact:'school@example.test',publication_policy:'private',retention_days:365};
 app.get('/schools',(req,res)=>res.send(eta.render('school-directory',{currentPath:'/schools',accountArea:true,user:req.query.member?user:null,schools:[],applications:[],applicationEnabled:true,legal:{operatorName:'Preview service',privacyEmail:'privacy@example.test'}})));
 app.get('/account/security',(_req,res)=>res.send(eta.render('account-security',{currentPath:'/account/security',accountArea:true,user:staff,securityUserId:user.id,securityReturnTo:'/schools'})));
 app.get('/preview/school-settings',(_req,res)=>res.send(eta.render('school-settings',{currentPath:'/admin/school-settings',accountArea:true,user:staff,school,settings,settingsAction:'/preview/school-settings',invitationAction:'/preview/invitations'})));
 app.get('/preview/invitations',(_req,res)=>res.send(eta.render('school-invitations',{currentPath:'/admin/invitations',accountArea:true,user:staff,school,roles:invitationRoles,ready:true,emailReady:true,invitations:[],action:'/preview/invitations',settingsUrl:'/preview/school-settings'})));
 app.get('/preview/invitation',(req,res)=>res.send(eta.render('school-invitation',{currentPath:'/schools/invitations/'+ 'a'.repeat(64),accountArea:true,user:null,roles:invitationRoles,token:'a'.repeat(64),invitation:{school_name:school.name,school_slug:school.slug,role:'student',state:req.query.state || 'pending',expires_at:'2026-11-01T00:00:00Z',recipient:'s•••@example.test'}})));
 app.get('/preview/platform',(_req,res)=>res.send(eta.render('platform-schools',{currentPath:'/platform/schools',platformDashboard:true,isPlatformOperator:true,user:staff,schools:[],applications:[],settings:[],page:0,applicationPage:0,businessReady:false,search:'',status:'',legal:{}})));
 app.get('/preview/school-notice',(_req,res)=>res.send(eta.render('school-notice',{currentPath:'/privacy',school,settings,notice:settings.privacy_notice,legal:{}})));
 app.get('/preview/message',(_req,res)=>res.send(eta.render('school-message',{currentPath:'/schools',accountArea:true,user,title:'Workspace unavailable',message:'Your school is not open yet.',nextHref:'/schools',nextLabel:'Your schools'})));
 app.use(createWorkspacePreview());return app;
}
if(require.main===module)createUIAuditPreview().listen(4319,'127.0.0.1',()=>console.log('Local UI audit fixtures ready on 4319'));
