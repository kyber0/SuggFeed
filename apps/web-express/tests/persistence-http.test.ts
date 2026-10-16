import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import api from '../src/routes/api';
import savedSearches from '../src/routes/saved-searches';
import digestRoutes from '../src/routes/digests';
import { supabaseService } from '../src/lib/supabase';
import { sameOriginOnly } from '../src/lib/security';
import { createRoadmapDb,USER_ID,OTHER_USER_ID,CATEGORY_ID } from './support/roadmap-db';
import { runWithSchool } from '../src/lib/school-scope';
const SCHOOL={id:'10000000-0000-4000-8000-000000000001',slug:'demo',name:'Demo',actorId:null,role:null};
import { unsubscribeToken } from '../src/lib/digests';

async function serve(app:express.Express){const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));return {origin:'http://127.0.0.1:'+(server.address() as any).port,close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};}
test('real HTTP submit replays a lost response, recovers code, and rejects account changes and cross-origin writes',async()=>{
  const db=await createRoadmapDb(),originalRpc=supabaseService.rpc,originalFrom=supabaseService.from;
  let user:string|null=null;
  supabaseService.from=((table:string)=>{
    assert.equal(table,'categories');const q:any={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{id:CATEGORY_ID},error:null};}};return q;
  }) as any;
  supabaseService.rpc=(async(name:string,args:any)=>{
    try {
      const query=name==='create_submission_once'
        ?await db.query<any>('SELECT create_submission_once($1,$2::uuid,$3,$4,$5,$6::uuid,$7::uuid,$8) AS result',[args.p_owner_hash,args.p_request_id,args.p_payload_hash,args.p_title,args.p_description,args.p_category_id,args.p_user_id,args.p_tracking_hash])
        :await db.query<any>('SELECT read_submission_receipt($1,$2::uuid) AS result',[args.p_owner_hash,args.p_request_id]);
      return {data:query.rows[0].result,error:null};
    }catch(e:any){return {data:null,error:{code:e.code,message:e.message}};}
  }) as any;
  const app=express();app.use(express.json(),cookieParser(),sameOriginOnly);app.use((req,_res,next)=>{req.session={user:user?{id:user,role:'student'}:null} as any;runWithSchool({...SCHOOL,actorId:user,role:user?'student':null},next);});app.use('/api',api);
  const server=await serve(app);
  try {
    const contextResponse=await fetch(server.origin+'/api/submission-context'),context=await contextResponse.json() as any;
    const setCookie=contextResponse.headers.get('set-cookie')!;assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Lax/);
    assert.deepEqual(Object.keys(context).sort(),['actor','signedIn','success']);
    const cookie=setCookie.split(';')[0],body={title:'Improve school seating',description:'Add comfortable seats near the school reading area.',category:'Facilities',isAnonymous:true,requestId:crypto.randomUUID(),actor:context.actor};
    const send=(value:any=body,origin=server.origin)=>fetch(server.origin+'/api/submit',{method:'POST',headers:{'Content-Type':'application/json',cookie,origin},body:JSON.stringify(value)});
    const invalidTrack=await fetch(server.origin+'/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:body.requestId})});assert.equal(invalidTrack.status,400);
    const first=await send();assert.equal(first.status,201);const recorded=await first.json() as any;
    const replay=await send();assert.equal(replay.status,200);const repeated=await replay.json() as any;
    assert.equal(recorded.id,repeated.id);assert.equal(recorded.tracking_code,repeated.tracking_code);assert.equal(repeated.replayed,true);
    assert.equal((await send({...body,title:'Different school seating'})).status,409);
    assert.equal((await send(body,'https://other.example')).status,403);
    const recover=()=>fetch(server.origin+'/api/submission-receipt',{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({actor:body.actor,requestId:body.requestId})});
    assert.equal(((await (await recover()).json()) as any).tracking_code,recorded.tracking_code);
    user=USER_ID;assert.equal((await send()).status,409);assert.equal((await recover()).status,409);
    assert.equal((await db.query('SELECT * FROM submission_receipts')).rows.length,1);
  }finally{await server.close();supabaseService.rpc=originalRpc;supabaseService.from=originalFrom;await db.close();}
});
test('search rename uses the verified account, never the request owner field',async()=>{
  const original=supabaseService.from,filters:any[]=[];
  supabaseService.from=(()=>{const q:any={update(){return q;},eq(...args:any[]){filters.push(args);return q;},select(){return q;},async maybeSingle(){return {data:{id:crypto.randomUUID()},error:null};}};return q;}) as any;
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.session={user:{id:USER_ID}} as any;runWithSchool({...SCHOOL,actorId:USER_ID,role:'student'},next);});app.use(savedSearches);const server=await serve(app);
  try {const response=await fetch(server.origin+'/'+crypto.randomUUID(),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'My library search',user_id:OTHER_USER_ID})});assert.equal(response.status,200);assert.ok(filters.some(([key,value])=>key==='user_id' && value===USER_ID));assert.ok(!filters.some(([,value])=>value===OTHER_USER_ID));}
  finally{await server.close();supabaseService.from=original;}
});
test('unsubscribe HTML write redirects 303 to a GET without the private token',async()=>{
  const original=supabaseService.from,secret=process.env.DIGEST_UNSUBSCRIBE_SECRET;process.env.DIGEST_UNSUBSCRIBE_SECRET='x'.repeat(40);
  supabaseService.from=(()=>{const q:any={update(){return q;},async eq(){return {error:null};}};return q;}) as any;
  const app=express();app.use(express.urlencoded({extended:false}));app.use((_req,_res,next)=>runWithSchool(SCHOOL,next));app.use('/s/demo',digestRoutes);const server=await serve(app);
  try{const token=runWithSchool(SCHOOL,()=>unsubscribeToken(USER_ID));const response=await fetch(server.origin+'/s/demo/digest/unsubscribe',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})});assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/s/demo/digest/unsubscribed');assert.doesNotMatch(response.headers.get('location')!,/token|10000000/);}
  finally{await server.close();supabaseService.from=original;if(secret===undefined)delete process.env.DIGEST_UNSUBSCRIBE_SECRET;else process.env.DIGEST_UNSUBSCRIBE_SECRET=secret;}
});
