import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import routes from '../src/routes/digests';
import { supabasePlatform } from '../src/lib/supabase';
import { runWithSchool } from '../src/lib/school-scope';
import { unsubscribeToken } from '../src/lib/digests';

const user='10000000-0000-4000-8000-000000000001';
const schoolA={id:'20000000-0000-4000-8000-000000000001',slug:'school-a',name:'A',actorId:null,role:null};
const schoolB={...schoolA,id:'20000000-0000-4000-8000-000000000002',slug:'school-b',name:'B'};
test('unsubscribe HTTP capabilities only update the issuing school, regardless of forged body scope',async()=>{
 const original=supabasePlatform.from,secret=process.env.DIGEST_UNSUBSCRIBE_SECRET,updates:any[]=[],filters:any[]=[];
 process.env.DIGEST_UNSUBSCRIBE_SECRET='s'.repeat(40);
 supabasePlatform.from=((table:string)=>{assert.equal(table,'notification_preferences');const q:any={update(value:any){updates.push(value);return q;},eq(...args:any[]){filters.push(args);return q;},then(resolve:any){resolve({error:null});}};return q;}) as any;
 const app=express();app.use(express.urlencoded({extended:false}));
 app.use((_req,res,next)=>{res.render=((_view:string,value:any)=>res.status(res.statusCode).json({valid:value.valid})) as any;next();});
 app.use('/s/:school',(req,_res,next)=>runWithSchool(req.params.school==='school-a'?schoolA:schoolB,next),routes);
 app.use(routes);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+(server.address() as any).port,token=runWithSchool(schoolA,()=>unsubscribeToken(user));
 const write=(path:string,body:any)=>fetch(origin+path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
 try {
  assert.equal((await write('/s/school-b/digest/unsubscribe',{token})).status,400);assert.equal(updates.length,0);
  const response=await write('/s/school-a/digest/unsubscribe',{token,school_id:schoolB.id,user_id:'forged'});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/s/school-a/digest/unsubscribed');
  assert.deepEqual(filters,[['school_id',schoolA.id],['user_id',user]]);assert.equal(updates.length,1);assert.equal(updates[0].weekly_digest,false);
  assert.equal((await write('/digest/unsubscribe',{token})).status,410);assert.equal(updates.length,1);
 }finally{
  supabasePlatform.from=original;if(secret===undefined)delete process.env.DIGEST_UNSUBSCRIBE_SECRET;else process.env.DIGEST_UNSUBSCRIBE_SECRET=secret;
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
