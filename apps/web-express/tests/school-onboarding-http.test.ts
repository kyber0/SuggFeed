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
before(async()=>{
 process.env.PLATFORM_OPERATOR_NAME='Test Business';process.env.PRIVACY_CONTACT_EMAIL='privacy@example.test';
 supabasePlatform.rpc=(async(name:string,args:any)=>{calls.push({name,args});return {data:name==='platform_operator_active'?args.p_actor==='operator':'school-a',error:null};}) as any;
 supabasePlatform.auth.getUser=(async(token:string)=>({data:{user:{id:token.replace('unverified:',''),email:'account@example.test',email_confirmed_at:token.startsWith('unverified:')?null:'2026-10-01'}},error:null})) as any;
 supabasePlatform.from=((table:string)=>{
  const filters:Record<string,any>={};
  const data=()=>table==='schools'?[school]:table==='school_settings'?[policy]:table==='school_memberships'?(filters.user_id==='user-a'?[{school_id:'school-a',role:'admin',status:'active',schools:school}]:[]):[];
  const query:any={select(){return query;},eq(key:string,value:any){filters[key]=value;return query;},not(){return query;},order(){return query;},limit(){return query;},range(){return query;},async maybeSingle(){return {data:data()[0]||null,error:null};},then(resolve:any,reject:any){return Promise.resolve({data:data(),error:null}).then(resolve,reject);}};
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
 const operatorDirectory=await fetch(origin+'/schools',{headers:{'x-user':'operator'}});assert.match(await operatorDirectory.text(),/Platform school review/);
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
