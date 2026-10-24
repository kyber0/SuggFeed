import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safetyDb} from './support/submission-safety-db';
import {SCHOOL_A,SCHOOL_B,STUDENT,ADMIN_A} from './support/tenant-db';
test('assistant storage isolates school cache, versions, log reads and own-request ratings',async()=>{
 const db=await safetyDb(true);try{
 const action=async(school:string|null,actor:string|null,name:string,data:Record<string,unknown>={})=>{await db.exec('SET ROLE service_role');try{return (await db.query<{value:any}>('SELECT assistant_action($1::uuid,$2::uuid,$3,$4::jsonb) AS value',[school,actor,name,JSON.stringify(data)])).rows[0].value;}finally{await db.exec('RESET ROLE');}};
 const payload={hash:'a'.repeat(64),version:'v1',locale:'en',id:'submit-idea',answer:'A reviewed answer.',ttl:100};await action(SCHOOL_A,STUDENT,'cache-put',payload);assert.equal((await action(SCHOOL_A,STUDENT,'cache-get',payload)).id,'submit-idea');assert.equal(await action(SCHOOL_B,STUDENT,'cache-get',payload),null);assert.equal(await action(SCHOOL_A,STUDENT,'cache-get',{...payload,version:'v2'}),null);
 const row=await action(SCHOOL_A,STUDENT,'log',{topic:'submit idea',answered:false,source:'fallback',version:'v1',locale:'en',tokenHash:'b'.repeat(64)});await assert.rejects(action(SCHOOL_A,STUDENT,'admin'),/Administrator/);assert.equal((await action(SCHOOL_A,ADMIN_A,'admin')).stats.total,1);
 await assert.rejects(action(SCHOOL_B,STUDENT,'feedback',{id:row.id,tokenHash:'b'.repeat(64),rating:'down'}));await assert.rejects(action(SCHOOL_A,STUDENT,'feedback',{id:row.id,tokenHash:'c'.repeat(64),rating:'down'}));
 await action(SCHOOL_A,STUDENT,'feedback',{id:row.id,tokenHash:'b'.repeat(64),rating:'up'});await action(SCHOOL_A,STUDENT,'feedback',{id:row.id,tokenHash:'b'.repeat(64),rating:'down'});assert.equal((await db.query<{rating:string}>('SELECT rating FROM assistant_log WHERE id=$1',[row.id])).rows[0].rating,'up');
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM assistant_log'));await assert.rejects(db.query("INSERT INTO assistant_request_capabilities(request_id,token_hash,expires_at) VALUES($1,$2,now())",[row.id,'d'.repeat(64)]));await db.exec('RESET ROLE');
 assert.equal((await action(SCHOOL_A,STUDENT,'budget',{ip:'c'.repeat(64),account:'d'.repeat(64),ipLimit:1,accountLimit:1,seconds:600})).allowed,true);assert.equal((await action(SCHOOL_A,STUDENT,'budget',{ip:'c'.repeat(64),account:'d'.repeat(64),ipLimit:1,accountLimit:1,seconds:600})).allowed,false);
 }finally{await db.close();}
});

test('global admin boundaries, provider caps and retention hold without superuser function privileges',async()=>{
 const db=await safetyDb(true);try{
 const action=async(school:string|null,actor:string|null,name:string,data:Record<string,unknown>={})=>{await db.exec('SET ROLE service_role');try{return (await db.query<{value:any}>('SELECT assistant_action($1::uuid,$2::uuid,$3,$4::jsonb) AS value',[school,actor,name,JSON.stringify(data)])).rows[0].value;}finally{await db.exec('RESET ROLE');}};
 await assert.rejects(action(null,ADMIN_A,'admin'),/Operator/);await db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[ADMIN_A]);assert.equal((await action(null,ADMIN_A,'admin')).stats.total,0);
 const first=await action(null,null,'claim',{key:'e'.repeat(64),limit:1,concurrency:2});assert.ok(first.id);assert.equal(await action(null,null,'claim',{key:'e'.repeat(64),limit:1,concurrency:2}),null);await action(null,null,'release',{id:first.id,failed:true,pause:60});assert.equal(await action(null,null,'claim',{key:'f'.repeat(64),limit:1,concurrency:2}),null);
 const log=await action(null,null,'log',{topic:'unknown',answered:false,source:'fallback',version:'v1',locale:'en',tokenHash:'a'.repeat(64)});await db.query("UPDATE assistant_log SET created_at=now()-interval '16 days' WHERE id=$1",[log.id]);const cleanup=await action(null,null,'cleanup',{days:14});assert.equal(cleanup.removed,1);assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM assistant_request_capabilities')).rows[0].count,0);
 }finally{await db.close();}
});
