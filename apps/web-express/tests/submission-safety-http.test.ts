import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import router from '../src/routes/submission-safety';
import {supabaseService} from '../src/lib/supabase';
import {sameOriginOnly} from '../src/lib/security';
import {withTestSchool} from './support/school-context';
const id='30000000-0000-4000-8000-000000000001',category='20000000-0000-4000-8000-000000000001';
test('direct owner edits are scanned server-side and ignore caller verdict, policy and identity',async()=>{
 const original=supabaseService.rpc;const calls:Array<{p_action:string;p_data:Record<string,any>}>=[];let role='student';
 supabaseService.rpc=(async(_name,args)=>{calls.push(args as any);return {error:null,data:(args as any).p_action==='owner-read'?{answers:{}}:{version:2}};}) as any;
 const app=express();app.use(express.json(),cookieParser(),sameOriginOnly);app.use((req,_res,next)=>{req.session={user:{id,role}} as any;next();});app.use(withTestSchool,router);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 const send=(source=origin)=>fetch(origin+'/api/safety/submissions/'+id+'/edit',{method:'POST',headers:{'Content-Type':'application/json',Origin:source,Cookie:'sf_submit_device='+'a'.repeat(64)},body:JSON.stringify({title:'putang ina this concern',description:'This describes a concern for the school to review.',category,version:1,verdict:{state:'clear',urgent:false},policy:{limit:999999},ownerHash:'fake'})});
 try{
  const response=await send();assert.equal(response.status,200);const edit=calls.find(c=>c.p_action==='owner-edit')!;assert.equal(edit.p_data.verdict.state,'flagged');assert.notEqual(edit.p_data.policy.limit,999999);assert.notEqual(edit.p_data.ownerHash,'fake');
  assert.equal((await send('https://attacker.invalid')).status,403);
  assert.equal((await fetch(origin+'/admin/safety',{headers:{Accept:'application/json'}})).status,403);
  role='moderator';assert.equal((await fetch(origin+'/admin/safety',{headers:{Accept:'application/json'}})).status,403);
 }finally{supabaseService.rpc=original;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
