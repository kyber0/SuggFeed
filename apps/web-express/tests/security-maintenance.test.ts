import {test} from 'node:test';
import assert from 'node:assert/strict';
import router from '../src/routes/security-maintenance';
import {supabasePlatform} from '../src/lib/supabase';
test('session cron bounds catch-up work and explicitly reports incomplete cleanup',async()=>{
 const secret=process.env.CRON_SECRET,original=supabasePlatform.rpc;process.env.CRON_SECRET='x'.repeat(40);
 const handler=(router as any).stack.find((layer:any)=>layer.route).route.stack[0].handle;
 const invoke=async(authorized=true)=>{let status=200,body:any,nextError:any;const headers:any={};const res:any={setHeader(k:string,v:string){headers[k]=v;},status(n:number){status=n;return this;},json(value:any){body=value;}};await handler({get:()=>authorized?'Bearer '+'x'.repeat(40):undefined},res,(e:any)=>{nextError=e;});return {status,body,headers,nextError};};
 try {
  let calls=0;supabasePlatform.rpc=(async()=>{calls++;return {error:null,data:{removed:1000,more:true}};}) as any;
  assert.equal((await invoke(false)).status,401);assert.equal(calls,0);
  const backlog=await invoke();assert.equal(calls,10);assert.equal(backlog.status,503);assert.equal(backlog.body.success,false);assert.equal(backlog.body.sessions.removed,10000);
  calls=0;supabasePlatform.rpc=(async()=>({error:null,data:{removed:++calls===1?1000:2,more:calls===1}})) as any;
  const complete=await invoke();assert.equal(complete.status,200);assert.equal(complete.body.sessions.removed,1002);assert.equal(calls,2);
  supabasePlatform.rpc=(async()=>({error:null,data:{removed:-1,more:false}})) as any;assert.equal((await invoke()).nextError.status,503);
 }finally{supabasePlatform.rpc=original;if(secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=secret;}
});
