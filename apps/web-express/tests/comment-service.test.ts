import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveComment,reportComment} from '../src/lib/comments';
import {supabaseService} from '../src/lib/supabase';
const id='00000000-0000-4000-8000-000000000001';
test('server service moderates creation and edits before persistence and owns report threshold',async()=>{
 const original=supabaseService.rpc;const calls:{name:string;args:Record<string,unknown>}[]=[];
 supabaseService.rpc=(async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:{status:(args.p_data as Record<string,unknown>).status},error:null};}) as unknown as typeof original;
 try{
  // Cache invalidation needs an authoritative school context, just like real requests.
  const {runWithSchool}=await import('../src/lib/school-scope');
  await runWithSchool({id,slug:'demo',name:'Demo',actorId:id,role:'student'},async()=>{
   await saveComment({submissionId:id,body:' Please improve the library area. '});
   assert.equal((calls.at(-1)!.args.p_data as Record<string,unknown>).status,'published');
   assert.equal((calls.at(-1)!.args.p_data as Record<string,unknown>).body,'Please improve the library area.');
   await saveComment({submissionId:id,body:'gago ka talaga sa comment na ito'});assert.equal((calls.at(-1)!.args.p_data as Record<string,unknown>).status,'flagged');
   await saveComment({id,version:1,body:'fuck this terrible comment here'});assert.equal((calls.at(-1)!.args.p_data as Record<string,unknown>).status,'flagged');
   await assert.rejects(saveComment({id,version:0,body:'A valid body with invalid version.'}));
   const before=calls.length;await assert.rejects(saveComment({submissionId:id,body:'a'.repeat(501)}));assert.equal(calls.length,before);
   await reportComment(id,'Please review this comment carefully.');assert.equal((calls.at(-1)!.args.p_data as Record<string,unknown>).threshold,3);
  });
 }finally{supabaseService.rpc=original;}
});
