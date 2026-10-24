import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router from '../src/routes/assistant';
import admin from '../src/routes/assistant-admin';
import {sameOriginOnly} from '../src/lib/security';
import {supabasePlatform} from '../src/lib/supabase';
import {runWithSchool} from '../src/lib/school-scope';
test('help endpoint validates direct input, ignores caller scope and denies student admin access',async()=>{
 const original=supabasePlatform.rpc,secret=process.env.ASSISTANT_HMAC_SECRET;process.env.ASSISTANT_HMAC_SECRET='http-test-only-secret-'.repeat(3);let role='student';const calls:any[]=[];supabasePlatform.rpc=((name,args)=>{calls.push([name,args]);return {abortSignal:async()=>({error:{message:'unavailable'},data:null})};}) as any;
 const app=express();app.use(express.json(),sameOriginOnly);app.use((req,_res,next)=>{req.session={user:{id:'10000000-0000-4000-8000-000000000002',role}} as any;runWithSchool({id:'00000000-0000-4000-8000-00000000000a',slug:'a',name:'School A',actorId:req.session.user!.id,role:role as 'student'},()=>{next();});});app.use(router,admin);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 try{const send=(question:unknown,source=origin)=>fetch(origin+'/help/ask',{method:'POST',headers:{'Content-Type':'application/json',Origin:source},body:JSON.stringify({question,school:'other-school',actor:'someone-else',model:'evil'})});assert.equal((await send({text:'test'})).status,400);assert.equal((await send('x'.repeat(301))).status,400);const response=await send('How do I submit an idea?');assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/no-store/);assert.equal((await response.json() as any).faqId,'submit-idea');assert.equal((await send('test','https://evil.invalid')).status,403);assert.equal((await fetch(origin+'/admin/assistant/data')).status,403);role='moderator';assert.equal((await fetch(origin+'/admin/assistant/data')).status,403);assert.ok(!JSON.stringify(calls).includes('other-school'));assert.equal(calls.find(c=>c[0]==='assistant_action')[1].p_school,'00000000-0000-4000-8000-00000000000a');}
 finally{if(secret===undefined)delete process.env.ASSISTANT_HMAC_SECRET;else process.env.ASSISTANT_HMAC_SECRET=secret;supabasePlatform.rpc=original;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
