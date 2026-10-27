import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runWithSchool} from '../src/lib/school-scope';
import {privateSubmission} from '../src/lib/private-submission';
import {supabasePlatform} from '../src/lib/supabase';
const school={id:'00000000-0000-4000-8000-00000000000a',slug:'school-a',name:'Synthetic School A'};
const id='30000000-0000-4000-8000-00000000000a',actor='10000000-0000-4000-8000-000000000003';
test('private submissions check assignment independently of route prefix and preserve owner/receipt access',async()=>{
 const from=supabasePlatform.from,rpc=supabasePlatform.rpc;let assigned=false,owner=false,receipt=false,permissionError=false,calls=0;
 supabasePlatform.from=((table:string)=>{const filters:any[]=[];const q:any={select(){return q;},eq(k:string,v:any){filters.push([k,v]);return q;},limit(){return q;},maybeSingle(){return q;},then(resolve:any){assert.ok(filters.some(([k,v])=>k==='school_id'&&v===school.id));return resolve({data:table==='submissions'?{id,title:'Synthetic private idea',user_id:owner?actor:'another-owner',form_version_id:null}:receipt?[{request_id:'synthetic-receipt'}]:[],error:null});}};return q;}) as any;
 supabasePlatform.rpc=(async(name,args)=>{calls++;assert.equal(name,'assignment_can_access');assert.deepEqual(args,{p_school:school.id,p_actor:actor,p_kind:'suggestion',p_id:id});return {data:assigned,error:permissionError?{code:'unavailable'}:null};}) as any;
 const req:any={session:{user:{id:actor}},cookies:{sf_submit_device:'a'.repeat(64)}};
 const read=(role:'student'|'moderator'|'admin')=>runWithSchool({...school,actorId:actor,role},()=>privateSubmission(req,id));
 try{
  assert.equal(await read('moderator'),null);assigned=true;assert.equal((await read('moderator'))?.id,id);
  assigned=false;assert.equal(await read('admin'),null,'revoked database permission must override cached role');
  const before=calls;owner=true;assert.equal((await read('moderator'))?.id,id);assert.equal((await read('student'))?.id,id);assert.equal(calls,before);
  owner=false;receipt=true;assert.equal((await read('student'))?.id,id);receipt=false;assert.equal(await read('student'),null);
  permissionError=true;await assert.rejects(read('moderator'),/permissions unavailable/);
 }finally{supabasePlatform.from=from;supabasePlatform.rpc=rpc;}
});
