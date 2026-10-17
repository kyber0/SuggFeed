import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Eta } from 'eta';
import path from 'node:path';
import type { Server } from 'node:http';
import { supabasePlatform } from '../src/lib/supabase';
import { sameOriginOnly } from '../src/lib/security';
import schools from '../src/routes/schools';
import '../src/types';

const original={from:supabasePlatform.from,rpc:supabasePlatform.rpc,getUser:supabasePlatform.auth.getUser,name:process.env.PLATFORM_OPERATOR_NAME,email:process.env.PRIVACY_CONTACT_EMAIL};
let server:Server,origin:string;
let calls:{name:string,args:any}[]=[];
const school={id:'school-a',slug:'school-a',name:'School A',status:'pending'};
const policy={school_id:'school-a',version:2,...Object.fromEntries(['privacy_notice','terms_notice','age_policy'].map(key=>[key,'Reviewed school policy text.'])),privacy_contact:'privacy@example.test',school_contact:'school@example.test',publication_policy:'private',retention_days:365,approved_at:null};
let schoolRows:any[]=[school], applicationRows:any[]=[], policyRows:any[]=[policy];
let reads:{table:string;filters:Record<string,any>;start?:number;end?:number}[]=[];
before(async()=>{
 process.env.PLATFORM_OPERATOR_NAME='Test Business';process.env.PRIVACY_CONTACT_EMAIL='privacy@example.test';
 supabasePlatform.rpc=(async(name:string,args:any)=>{calls.push({name,args});return {data:name==='platform_operator_active'?args.p_actor==='operator':'school-a',error:null};}) as any;
 supabasePlatform.auth.getUser=(async(token:string)=>({data:{user:{id:token.replace('unverified:',''),email:'account@example.test',email_confirmed_at:token.startsWith('unverified:')?null:'2026-10-01'}},error:null})) as any;
 supabasePlatform.from=((table:string)=>{
  const filters:Record<string,any>={};
  const read:{table:string;filters:Record<string,any>;start?:number;end?:number}={table,filters};reads.push(read);
  const data=()=>{
   let rows=table==='schools'?schoolRows:table==='school_settings'?policyRows:table==='school_applications'?applicationRows:table==='school_memberships'?(['user-a','operator'].includes(filters.user_id)?[{school_id:'school-a',role:'admin',status:'active',schools:school}]:[]):[];
   if(filters.school_ids)rows=rows.filter(row=>filters.school_ids.includes(row.school_id));
   return read.start===undefined?rows:rows.slice(read.start,(read.end??read.start)+1);
  };
  const query:any={select(){return query;},eq(key:string,value:any){filters[key]=value;return query;},in(key:string,values:any[]){if(key==='school_id')filters.school_ids=values;return query;},ilike(key:string,value:string){filters[key+'_pattern']=value;return query;},not(){return query;},order(){return query;},limit(){return query;},range(start:number,end:number){read.start=start;read.end=end;return query;},async maybeSingle(){return {data:data()[0]||null,error:null};},then(resolve:any,reject:any){return Promise.resolve({data:data(),error:null}).then(resolve,reject);}};
  return query;
 }) as any;
 const app=express();app.use(express.urlencoded({extended:false}));app.use(sameOriginOnly);
 const eta=new Eta({views:path.resolve(__dirname,'../views')});
 app.engine('eta',(file,data,callback)=>{try{callback(null,eta.render(path.relative(path.resolve(__dirname,'../views'),file),data));}catch(error){callback(error as Error);}});
 app.set('view engine','eta');app.set('views',path.resolve(__dirname,'../views'));
 app.use((req,res,next)=>{
  const actor=req.get('x-user')||'user-a';
  req.session={user:actor==='anonymous'?null:{id:actor,email:'account@example.test',role:'admin'},accessToken:(req.get('x-unverified')?'unverified:':'')+actor,save:(cb:any)=>cb()} as any;
  res.locals.authAssurance=req.get('x-test-aal')==='aal1'?'aal1':'aal2'; // verified-identity fixture only
  res.locals.user=req.session.user;res.locals.currentPath=req.path;next();
 });
 app.use(schools);app.use((_error:any,_req:any,res:any,_next:any)=>res.status(500).send('Unexpected failure'));
 server=await new Promise<Server>(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 origin='http://127.0.0.1:'+(server.address() as any).port;
});
after(async()=>{
 supabasePlatform.from=original.from;supabasePlatform.rpc=original.rpc;supabasePlatform.auth.getUser=original.getUser;
 if(original.name===undefined)delete process.env.PLATFORM_OPERATOR_NAME;else process.env.PLATFORM_OPERATOR_NAME=original.name;
 if(original.email===undefined)delete process.env.PRIVACY_CONTACT_EMAIL;else process.env.PRIVACY_CONTACT_EMAIL=original.email;
 await new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());});
});
const body={slug:'school-new',name:'New School',contact_name:'Representative',authority_statement:'School authority verified through institutional records.',authority_confirmed:'yes',p_actor:'forged-actor',role:'admin'};
function post(url:string,values:Record<string,string>,headers:Record<string,string>={}){return fetch(origin+url,{method:'POST',redirect:'manual',headers:{Origin:origin,...headers},body:new URLSearchParams(values)});}

test('directory and settings render functional forms, pending workspace and private policy',async()=>{
 const directory=await fetch(origin+'/schools');assert.equal(directory.status,200);const html=await directory.text();assert.match(html,/School A/);assert.match(html,/action="\/schools\/apply"/);assert.match(html,/pending/);
 const settings=await fetch(origin+'/s/school-a/admin/school-settings');assert.equal(settings.status,200);const policyHtml=await settings.text();assert.match(policyHtml,/name="version" value="2"/);assert.match(policyHtml,/admin\/invitations/);
});
test('verified application uses only session actor, redirects after success and rejects missing business setup',async()=>{
 calls=[];const response=await post('/schools/apply',body);assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/schools?saved=1');
 assert.equal(calls[0].name,'apply_to_school');assert.equal(calls[0].args.p_actor,'user-a');assert.equal(calls[0].args.role,undefined);
 const unverified=await post('/schools/apply',body,{'x-unverified':'1'});assert.equal(unverified.status,403);
 delete process.env.PLATFORM_OPERATOR_NAME;
 try{assert.equal((await post('/schools/apply',body)).status,503);}finally{process.env.PLATFORM_OPERATOR_NAME='Test Business';}
});
test('global admin role grants no platform operator or other school authority',async()=>{
 const denied=await fetch(origin+'/platform/schools');assert.equal(denied.status,403);
 const crossSchool=await fetch(origin+'/s/school-a/admin/school-settings',{headers:{'x-user':'user-b'}});assert.equal(crossSchool.status,403);
 const operatorDirectory=await fetch(origin+'/schools',{redirect:'manual',headers:{'x-user':'operator'}});assert.equal(operatorDirectory.status,303);assert.equal(operatorDirectory.headers.get('location'),'/platform/schools');
 const platform=await fetch(origin+'/platform/schools',{headers:{'x-user':'operator'}});assert.equal(platform.status,200);assert.match(await platform.text(),/School policy review/);
 const invalidPage=await fetch(origin+'/platform/schools?page=-1',{headers:{'x-user':'operator'}});assert.equal(invalidPage.status,400);
});
test('onboarding mutations reject cross-origin requests before processing',async()=>{
 calls=[];const response=await post('/schools/apply',body,{Origin:'https://attacker.test'});assert.equal(response.status,403);assert.equal(calls.length,0);
});

test('privileged onboarding requires verified MFA before reading or mutating',async()=>{
 calls=[];
 const operator=await fetch(origin+'/platform/schools',{redirect:'manual',headers:{'x-user':'operator','x-test-aal':'aal1'}});
 assert.equal(operator.status,303);assert.match(operator.headers.get('location')||'',/^\/account\/security\?returnTo=/);
 const admin=await post('/s/school-a/admin/school-settings',{version:'2'},{'x-test-aal':'aal1'});
 assert.equal(admin.status,403);assert.equal((await admin.json() as {code:string}).code,'MFA_REQUIRED');
 assert.equal(calls.filter(call=>call.name!=='platform_operator_active').length,0);
});

test('super admin dashboard shows school setup blockers, scoped actions and dashboard recovery links',async()=>{
 calls=[];reads=[];
 const response=await fetch(origin+'/platform/schools',{headers:{'x-user':'operator'}});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const html=await response.text();
 assert.match(html,/Super admin workspace/);assert.match(html,/Platform overview/);assert.match(html,/School directory/);
 assert.match(html,/Authenticator verified for this visit/);
 assert.match(html,/href="\/platform\/schools\/school-a\/settings"/);
 assert.match(html,/<button[^>]+disabled[^>]*>Request activation<\/button>/);
 assert.doesNotMatch(html,/class="mobile-tab-bar"/);
 assert.match(html,/platform\.bundle\.css/);
 assert.equal(calls.some(call=>call.name==='change_school_status'),false);
 const alias=await fetch(origin+'/platform',{redirect:'manual'});assert.equal(alias.status,303);assert.equal(alias.headers.get('location'),'/platform/schools');
 const oldActivation=await fetch(origin+'/platform/schools/school-a/activate',{redirect:'manual'});assert.equal(oldActivation.status,303);assert.equal(oldActivation.headers.get('location'),'/platform/schools#schools');
 delete process.env.PLATFORM_OPERATOR_NAME;
 try{
  const blocked=await post('/platform/schools/school-a/activate',{}, {'x-user':'operator'});
  assert.equal(blocked.status,400);assert.match(await blocked.text(),/Back to super admin dashboard/);
  assert.equal(calls.some(call=>call.name==='change_school_status'),false);
 }finally{process.env.PLATFORM_OPERATOR_NAME='Test Business';}
});

test('dashboard pages schools and applications independently and only loads policies for visible schools',async()=>{
 schoolRows=Array.from({length:25},(_,index)=>({...school,id:'school-'+index,slug:'school-'+index,name:index===0?'<script>unsafe</script>':'School '+index}));
 applicationRows=Array.from({length:13},(_,index)=>({id:'application-'+index,slug:'application-'+index,name:'Application '+index,contact_name:'Representative',contact_email:'school@example.test',authority_statement:'Institutional authority statement.'}));
 policyRows=[{...policy,school_id:'school-0'},{...policy,school_id:'school-24'}];reads=[];
 try{
  const response=await fetch(origin+'/platform/schools',{headers:{'x-user':'operator'}});assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/school-23/);assert.doesNotMatch(html,/school-24/);assert.match(html,/application-11/);assert.doesNotMatch(html,/application-12/);
  assert.match(html,/page=1&amp;applicationPage=0#schools/);assert.match(html,/page=0&amp;applicationPage=1#applications/);
  assert.doesNotMatch(html,/<script>unsafe<\/script>/);assert.match(html,/&lt;script&gt;unsafe/);
  const policies=reads.find(read=>read.table==='school_settings')!;
  assert.equal(policies.filters.school_ids.length,24);assert.equal(policies.filters.school_ids.includes('school-24'),false);
  assert.deepEqual(reads.filter(read=>read.start!==undefined).map(read=>[read.table,read.start,read.end]),[['schools',0,24],['school_applications',0,12]]);
  const second=await fetch(origin+'/platform/schools?page=1&applicationPage=0',{headers:{'x-user':'operator'}});const secondHtml=await second.text();
  assert.match(secondHtml,/school-24/);assert.match(secondHtml,/Version 2/);assert.doesNotMatch(secondHtml,/id="school-school-0"/);
  assert.equal((await fetch(origin+'/platform/schools?applicationPage=-1',{headers:{'x-user':'operator'}})).status,400);
 }finally{schoolRows=[school];applicationRows=[];policyRows=[policy];}
});

test('dashboard denies school admins and unverified operators before loading school records',async()=>{
 reads=[];
 const schoolAdmin=await fetch(origin+'/platform/schools',{headers:{'x-user':'user-a'}});assert.equal(schoolAdmin.status,403);assert.equal(reads.length,0);
 const unverified=await fetch(origin+'/platform/schools',{redirect:'manual',headers:{'x-user':'operator','x-test-aal':'aal1'}});assert.equal(unverified.status,303);assert.equal(reads.length,0);
});

test('a reviewed school still honors a database activation rejection and keeps the operator on the dashboard',async()=>{
 const rpc=supabasePlatform.rpc;
 policyRows=[{...policy,approved_at:'2026-10-17T00:00:00Z'}];
 supabasePlatform.rpc=(async(name:string,args:any)=>name==='change_school_status'?{data:null,error:{code:'42501'}}:rpc.call(supabasePlatform,name,args)) as any;
 try{
  const response=await post('/platform/schools/school-a/activate',{}, {'x-user':'operator'});
  assert.equal(response.status,409);const html=await response.text();
  assert.match(html,/Activation locked/);assert.match(html,/Back to super admin dashboard/);
 }finally{supabasePlatform.rpc=rpc;policyRows=[policy];}
});

test('account home honors role landing and platform settings remain inside the platform shell',async()=>{
 const platform=await fetch(origin+'/account/home',{redirect:'manual',headers:{'x-user':'operator'}});assert.equal(platform.headers.get('location'),'/platform/schools');
 const pending=await fetch(origin+'/account/home',{redirect:'manual'});assert.equal(pending.headers.get('location'),'/s/school-a/admin/school-settings');
 const settings=await fetch(origin+'/platform/schools/school-a/settings',{headers:{'x-user':'operator'}});assert.equal(settings.status,200);const html=await settings.text();
 assert.match(html,/action="\/platform\/schools\/school-a\/settings"/);assert.doesNotMatch(html,/id="school-invitations"|class="mobile-tab-bar"/);
 const denied=await fetch(origin+'/platform/schools/school-a/settings');assert.equal(denied.status,403);
 const filters=await fetch(origin+'/platform/schools?q=School&status=pending',{headers:{'x-user':'operator'}});assert.equal(filters.status,200);assert.ok(reads.some(r=>r.filters.name_pattern==='%School%'&&r.filters.status==='pending'));
});

test('rejected policy edits retain input while readiness reflects only persisted settings',async()=>{
 const rpc=supabasePlatform.rpc;
 supabasePlatform.rpc=(async(name:string,args:any)=>name==='update_school_settings'?{data:null,error:{code:'40001'}}:rpc.call(supabasePlatform,name,args)) as any;
 const fields={version:'2',privacy_notice:'Unsaved notice text that must remain editable.',terms_notice:'Unsaved terms text that must remain editable.',age_policy:'Adult evaluators only.',privacy_contact:'privacy@example.test',school_contact:'school@example.test',publication_policy:'private',retention_days:'30'};
 policyRows=[];
 try{
  const response=await post('/s/school-a/admin/school-settings',fields);assert.equal(response.status,400);const html=await response.text();
  assert.match(html,/Unsaved notice text/);assert.match(html,/Complete and save school settings first/);assert.doesNotMatch(html,/Awaiting review of the saved policy version/);
 }finally{supabasePlatform.rpc=rpc;policyRows=[policy];}
});
