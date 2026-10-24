import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {AddressInfo} from 'node:net';
import api from '../src/routes/api';
import {communityRouter} from '../src/routes/community';
import {supabaseService} from '../src/lib/supabase';
import {commentModerationConfig} from '../src/lib/comment-moderation-config';
import {withTestSchool} from './support/school-context';
const idea='30000000-0000-4000-8000-000000000001';
test('direct API creation and editing cannot request published status to bypass detection',async()=>{
 const originalFrom=supabaseService.from,originalRpc=supabaseService.rpc;const writes:Record<string,unknown>[]=[];
 const chain={select(){return chain;},eq(){return chain;},single:async()=>({data:{id:idea,status:'approved'},error:null})};
 supabaseService.from=(()=>chain) as unknown as typeof originalFrom;
 supabaseService.rpc=(async(_name:string,args:{p_data:Record<string,unknown>})=>{writes.push(args.p_data);return {error:null,data:{id:idea,status:args.p_data.status,body:args.p_data.status==='published'?args.p_data.body:null}};}) as unknown as typeof originalRpc;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.cookies={};req.session={user:{id:idea,role:'student'}} as typeof req.session;next();});app.use(withTestSchool);app.use('/api/community',communityRouter);app.use('/api',api);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const post=(url:string,body:unknown)=>fetch(origin+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  let response=await post('/api/comments/'+idea,{body:'gago ka talaga sa discussion na ito',status:'published',user_id:'fake'});assert.equal(response.status,200);const held=await response.json() as {data:{status:string;body:string|null}};assert.equal(held.data.status,'flagged');assert.equal(held.data.body,null);assert.equal(writes.at(-1)!.status,'flagged');assert.equal(writes.at(-1)!.user_id,undefined);
  response=await post('/api/community/comments/'+idea+'/edit',{body:'fuck this comment on the discussion',status:'published',version:1});assert.equal(response.status,200);assert.equal(writes.at(-1)!.status,'flagged');
  response=await post('/api/comments/'+idea,{body:'A constructive idea for our school.'});assert.equal(response.status,200);assert.equal(writes.at(-1)!.status,'published');
  commentModerationConfig.mode='reject';const before=writes.length;response=await post('/api/comments/'+idea,{body:'gago ka talaga sa discussion na ito'});assert.equal(response.status,422);assert.equal(writes.length,before);assert.doesNotMatch((await response.json() as {error:string}).error,/gago/i);
 }finally{commentModerationConfig.mode='flag';supabaseService.from=originalFrom;supabaseService.rpc=originalRpc;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
