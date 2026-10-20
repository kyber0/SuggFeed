import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedReadBudget,cronAuthorized} from '../src/lib/read-budget';
import {supabasePlatform} from '../src/lib/supabase';

test('read budget rejects across instances before downstream session work and fails closed',async()=>{
 const oldRpc=supabasePlatform.rpc,oldSecret=process.env.SESSION_SECRET,oldMode=process.env.NODE_ENV;
 process.env.NODE_ENV='production';
 process.env.SESSION_SECRET='fixture-secret-with-at-least-thirty-two-characters';
 let count=0;const keys:string[]=[];
 supabasePlatform.rpc=(async(_name:string,args:any)=>{keys.push(args.p_key);return {data:[{allowed:++count<=2,retry_after:60}],error:null};}) as any;
 const invoke=async(query:any={},method='GET',path='/s/demo/feed',ip='192.0.2.1')=>{
  let status=200,continued=false;const headers:any={};
  const res:any={status(n:number){status=n;return this;},json(){return this;},setHeader(k:string,v:string){headers[k]=v;}};
  await sharedReadBudget({method,path,query,ip,get:()=>undefined} as any,res,(error?:any)=>{if(error)status=error.status;else continued=true;});return {status,continued,headers};
 };
 try {
  assert.equal((await invoke()).continued,true);assert.equal((await invoke()).continued,true);
  assert.equal((await invoke()).status,429);assert.equal(keys[0],keys[2]);
  const blocked=await invoke();assert.equal(blocked.continued,false);assert.equal(blocked.headers['Retry-After'],'60');
  const n=count;assert.equal((await invoke({},'POST')).continued,true);assert.equal(count,n);
  assert.equal((await invoke({},'GET','/internal/security-maintenance')).status,401);assert.equal(count,n);
  await invoke({},'GET','/s/demo/feed','2001:db8:abcd:1200::1');
  await invoke({},'GET','/s/demo/feed','2001:db8:abcd:12ff::2');
  await invoke({},'GET','/s/demo/feed','2001:db8:abcd:1300::1');
  assert.equal(keys.at(-3),keys.at(-2),'IPv6 rotation within /56 shares a durable counter');
  assert.notEqual(keys.at(-2),keys.at(-1),'unrelated IPv6 subnets remain separate');
  supabasePlatform.rpc=(async()=>({data:null,error:{message:'private provider failure'}})) as any;
  assert.equal((await invoke({search:'fixture'})).status,503);
 }finally{supabasePlatform.rpc=oldRpc;if(oldSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;}
});

test('cron bearer requires an independent strong exact secret',()=>{
 const before=process.env.CRON_SECRET;
 try{delete process.env.CRON_SECRET;assert.equal(cronAuthorized('Bearer undefined'),false);process.env.CRON_SECRET='x'.repeat(40);assert.equal(cronAuthorized('Bearer '+'x'.repeat(40)),true);assert.equal(cronAuthorized('Bearer '+'y'.repeat(40)),false);}finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;}
});
