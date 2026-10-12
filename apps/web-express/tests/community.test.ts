import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { communityRouter } from '../src/routes/community';
import { supabaseService } from '../src/lib/supabase';
import { sameOriginOnly } from '../src/lib/security';
const id='10000000-0000-4000-8000-000000000001',idea='30000000-0000-4000-8000-000000000001';
test('community routes enforce staff roles, ignore caller identity and reject cross-origin writes',async()=>{
 const rpc=supabaseService.rpc;const calls:any[]=[];let role:string|null=null;
 supabaseService.rpc=(async(name,args)=>{calls.push([name,args]);return {error:null,data:{success:true}};}) as any;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.session={user:role?{id,role}:undefined} as any;next();});app.use(sameOriginOnly);app.use('/api/community',communityRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+(server.address() as any).port;
 const send=(path:string,body:any,source=origin)=>fetch(origin+'/api/community/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:source},body:JSON.stringify(body)});
 try {
  assert.equal((await send('report',{submissionId:idea,body:'A report should need a verified signed-in account.'})).status,401);
  role='student';assert.equal((await send('staff/request',{submissionId:idea,body:'A student must not send a staff clarification.'})).status,403);
  assert.equal((await send('report',{submissionId:idea,body:'Cross-origin reports must not be accepted.'},'https://attacker.test')).status,403);
  assert.equal((await send('report',{submissionId:'bad',body:'A malformed idea ID must not reach the database.'})).status,400);
  assert.equal((await send('report',{submissionId:idea,body:'The report uses the session user rather than caller data.',userId:'fake'})).status,200);
  assert.equal(calls.at(-1)[1].p_actor,id);
  role='moderator';assert.equal((await send('staff/request',{submissionId:idea,body:'Please explain which part of campus is affected.',staffId:'fake'})).status,200);
  assert.equal(calls.at(-1)[1].p_actor,id);
  assert.equal((await send('staff/merge',{submissionId:idea,targetId:id,body:'These two ideas should be merged after reviewing.'})).status,400);
  assert.equal((await send('staff/bulk_assign',{items:new Array(26).fill({id:idea,updatedAt:new Date().toISOString()})})).status,400);
  assert.equal((await send('reply',{id:idea,body:'An anonymous reply needs a tracking capability.',trackingCode:idea})).status,400);
 }finally{supabaseService.rpc=rpc;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
