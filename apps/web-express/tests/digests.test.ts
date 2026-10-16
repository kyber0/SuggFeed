import { test as nodeTest } from 'node:test';
import { runWithSchool } from '../src/lib/school-scope';
const SCHOOL={id:'10000000-0000-4000-8000-000000000001',slug:'demo',name:'Demo',actorId:null,role:null};
const test=(name:string,fn:()=>void|Promise<void>)=>nodeTest(name,()=>runWithSchool(SCHOOL,fn));
import assert from 'node:assert/strict';
import { digestEnabled,unsubscribeToken,unsubscribeUser,digestText,deliverWeeklyDigests } from '../src/lib/digests';
import { supabaseService, supabasePlatform } from '../src/lib/supabase';
import { createRoadmapDb,USER_ID,OTHER_USER_ID } from './support/roadmap-db';

test('digest capabilities only authorize unsubscribe; delivery is disabled without full configuration',async()=>{
 const previous={...process.env};
 try {
  process.env.WEEKLY_DIGEST_ENABLED='false';assert.equal(digestEnabled(),false);
  process.env.DIGEST_UNSUBSCRIBE_SECRET='s'.repeat(40);
  const token=unsubscribeToken(USER_ID);assert.equal(unsubscribeUser(token),USER_ID);assert.equal(unsubscribeUser(token.replace(USER_ID,OTHER_USER_ID)),null);assert.equal(unsubscribeUser(token+'x'),null);
  assert.equal((await deliverWeeklyDigests(async()=>{throw new Error('Must never call transport');})).enabled,false);
  const text=digestText([{title:'A public school idea',kind:'completed',office_label:'School office'}],'https://www.suggfeed.me','https://www.suggfeed.me/digest/unsubscribe');
  assert.match(text,/A public school idea/);assert.match(text,/Stop weekly emails/);assert.doesNotMatch(text,/CV-[A-F0-9]{32}/);
 }finally{for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key];Object.assign(process.env,previous);}
});
test('weekly claims are once per account per week and client-private',async()=>{
 const db=await createRoadmapDb();
 try {
  await db.query('INSERT INTO notification_preferences(user_id,weekly_digest) VALUES($1,true),($2,false)',[USER_ID,OTHER_USER_ID]);
  const first=await db.query<any>('SELECT * FROM claim_weekly_digests()');assert.equal(first.rows.length,1);assert.equal(first.rows[0].user_id,USER_ID);
  assert.equal((await db.query('SELECT * FROM claim_weekly_digests()')).rows.length,0);
  await db.query("UPDATE weekly_digest_jobs SET created_at=now()-interval '16 minutes'");
  assert.equal((await db.query('SELECT * FROM claim_weekly_digests()')).rows.length,0);
  assert.equal((await db.query<any>('SELECT state FROM weekly_digest_jobs')).rows[0].state,'uncertain');
  await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM weekly_digest_jobs'),/permission denied/);await assert.rejects(db.query('SELECT * FROM claim_weekly_digests()'),/permission denied/);
 }finally{await db.close();}
});
test('digest delivery uses verified email, current consent and public filters; network uncertainty never triggers a second send',async()=>{
 const previous={...process.env},from=supabaseService.from,rpc=supabaseService.rpc,identity=supabaseService.auth.admin.getUserById,platformFrom=supabasePlatform.from;
 let optedIn=true,processed=false;const filters:any[]=[],states:string[]=[],calls:any[]=[];
 Object.assign(process.env,{WEEKLY_DIGEST_ENABLED:'true',RESEND_API_KEY:'test-only',RESEND_FROM_EMAIL:'School <updates@example.test>',DIGEST_UNSUBSCRIBE_SECRET:'s'.repeat(40),APP_ORIGIN:'https://www.suggfeed.me',CRON_SECRET:'c'.repeat(40)});
 supabasePlatform.from=(()=>{const q:any={select(){return q;},not(){return q;},eq(){return q;},async maybeSingle(){return {error:null,data:{user_id:USER_ID}};}};return q;}) as any;
 supabaseService.rpc=(async()=>({error:null,data:processed?[]:[{id:'60000000-0000-4000-8000-000000000001',user_id:USER_ID,week_start:'2026-10-05'}]})) as any;
 supabaseService.auth.admin.getUserById=(async()=>({error:null,data:{user:{email:'verified@example.test',email_confirmed_at:'2026-10-01'}}})) as any;
 supabaseService.from=((table:string)=>{
  const query:any={then(resolve:any){resolve({error:null,data:table==='idea_follows'?[{submission_id:'public-idea'}]:table==='idea_notifications'?[{title:'Library improvement',kind:'completed',office_label:'School office',submission_id:'public-idea'},{title:'Unfollowed idea',kind:'update',office_label:'School office',submission_id:'other'}]:null});},async maybeSingle(){return {error:null,data:{weekly_digest:optedIn}};}};
  for(const method of ['select','eq','gte','lt','in','is','order','limit']) query[method]=(...args:any[])=>{filters.push([table,method,...args]);return query;};
  query.update=(value:any)=>{states.push(value.state);processed=true;return query;};return query;
 }) as any;
 try {
  const result=await deliverWeeklyDigests(async(url:any,options:any)=>{calls.push([url,options]);throw new Error('Provider accepted, response lost');});
  assert.equal(result.failed,1);assert.equal(states[0],'uncertain');assert.equal(calls.length,1);
  assert.match(JSON.parse(calls[0][1].body).text,/Library improvement/);assert.match(JSON.parse(calls[0][1].body).text,/https:\/\/www.suggfeed.me\/s\/demo\/notifications/);assert.match(JSON.parse(calls[0][1].body).html,/https:\/\/www.suggfeed.me\/s\/demo\/notifications/);assert.doesNotMatch(JSON.parse(calls[0][1].body).text,/Unfollowed idea/);
  assert.deepEqual(JSON.parse(calls[0][1].body).to,['verified@example.test']);assert.match(calls[0][1].headers['Idempotency-Key'],/^weekly-digest-/);
  assert.ok(filters.some(f=>f[0]==='idea_notifications' && f[1]==='eq' && f[2]==='update.visibility' && f[3]==='public'));
  await deliverWeeklyDigests(async()=>{throw new Error('Must not send twice');});assert.equal(calls.length,1);
  processed=false;optedIn=false;const cancelled=await deliverWeeklyDigests(async()=>{throw new Error('Must not send when consent is withdrawn');});assert.equal(cancelled.skipped,1);assert.equal(states.at(-1),'cancelled');
 }finally{supabasePlatform.from=platformFrom;supabaseService.from=from;supabaseService.rpc=rpc;supabaseService.auth.admin.getUserById=identity;for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key];Object.assign(process.env,previous);}
});

test('digest delivery rechecks pause and chosen kinds immediately before sending',async()=>{
 const previous={...process.env},from=supabaseService.from,rpc=supabaseService.rpc,identity=supabaseService.auth.admin.getUserById,platformFrom=supabasePlatform.from;
 Object.assign(process.env,{WEEKLY_DIGEST_ENABLED:'true',RESEND_API_KEY:'test-only',RESEND_FROM_EMAIL:'updates@example.test',DIGEST_UNSUBSCRIBE_SECRET:'s'.repeat(40),APP_ORIGIN:'https://www.suggfeed.me',CRON_SECRET:'c'.repeat(40)});
 let reads=0,paused=false,member=true,state='',text='',calls=0;
 supabasePlatform.from=(()=>{const q:any={select(){return q;},not(){return q;},eq(){return q;},async maybeSingle(){return {error:null,data:member?{user_id:USER_ID}:null};}};return q;}) as any;
 supabaseService.rpc=(async()=>({error:null,data:[{id:crypto.randomUUID(),user_id:USER_ID,week_start:'2026-10-05'}]})) as any;
 supabaseService.auth.admin.getUserById=(async()=>({error:null,data:{user:{email:'verified@example.test',email_confirmed_at:'2026-10-01'}}})) as any;
 supabaseService.from=((table:string)=>{
   const q:any={then(resolve:any){resolve({error:null,data:table==='idea_follows'?[{submission_id:'idea'}]:table==='idea_notifications'?[{title:'Completed only',kind:'completed',office_label:'School',submission_id:'idea'},{title:'Unselected update',kind:'update',office_label:'School',submission_id:'idea'}]:null});},async maybeSingle(){reads++;return {error:null,data:{weekly_digest:true,digest_paused:reads>1 && paused,digest_kinds:reads>1?['completed']:['update','completed']}};}};
   for(const method of ['select','eq','gte','lt','in','is','order','limit'])q[method]=()=>q;
   q.update=(value:any)=>{state=value.state;return q;};return q;
 }) as any;
 try {
   const transport=async(_url:any,options:any)=>{calls++;text=JSON.parse(options.body).text;return new Response('{}',{status:200});};
   assert.equal((await deliverWeeklyDigests(transport)).delivered,1);assert.equal(calls,1);assert.match(text,/Completed only/);assert.doesNotMatch(text,/Unselected update/);
   reads=0;paused=true;assert.equal((await deliverWeeklyDigests(transport)).skipped,1);assert.equal(state,'cancelled');assert.equal(calls,1,'Pause enabled during preparation prevents delivery');
   reads=0;paused=false;member=false;assert.equal((await deliverWeeklyDigests(transport)).skipped,1);assert.equal(state,'cancelled');assert.equal(calls,1,'Revoked school membership prevents delivery despite verified global email');
 }finally{supabasePlatform.from=platformFrom;supabaseService.from=from;supabaseService.rpc=rpc;supabaseService.auth.admin.getUserById=identity;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});

nodeTest('unsubscribe capabilities require the issuing school and reject legacy account-only signatures',()=>{
 const original=process.env.DIGEST_UNSUBSCRIBE_SECRET;process.env.DIGEST_UNSUBSCRIBE_SECRET='s'.repeat(40);
 try {
  assert.throws(()=>unsubscribeToken(USER_ID),/School context/);
  const token=runWithSchool(SCHOOL,()=>unsubscribeToken(USER_ID));
  assert.equal(unsubscribeUser(token),null);
  assert.equal(runWithSchool({...SCHOOL,id:OTHER_USER_ID},()=>unsubscribeUser(token)),null);
  assert.equal(runWithSchool(SCHOOL,()=>unsubscribeUser(token)),USER_ID);
  assert.equal(runWithSchool(SCHOOL,()=>unsubscribeUser(USER_ID+'.legacy-signature')),null);
 }finally{if(original===undefined)delete process.env.DIGEST_UNSUBSCRIBE_SECRET;else process.env.DIGEST_UNSUBSCRIBE_SECRET=original;}
});

test('a job completion outage is counted and does not prevent completing the next job',async()=>{
 const originalRpc=supabaseService.rpc,originalFrom=supabaseService.from,previous={...process.env};let finishes=0;
 Object.assign(process.env,{WEEKLY_DIGEST_ENABLED:'true',RESEND_API_KEY:'test-only',RESEND_FROM_EMAIL:'updates@example.test',DIGEST_UNSUBSCRIBE_SECRET:'s'.repeat(40),APP_ORIGIN:'https://example.test',CRON_SECRET:'s'.repeat(40)});
 supabaseService.rpc=(async()=>({error:null,data:[{id:'first',user_id:USER_ID},{id:'second',user_id:OTHER_USER_ID}]})) as any;
 supabaseService.from=((table:string)=>{const q:any={select(){return q;},not(){return q;},eq(){return q;},async maybeSingle(){return {error:null,data:{weekly_digest:false}};},update(){finishes++;if(finishes===1)throw new Error('Completion connection lost');return q;},then(resolve:any){resolve({error:null});}};return q;}) as any;
 try{assert.deepEqual(await deliverWeeklyDigests(async()=>{throw new Error('No consent');}),{enabled:true,delivered:0,failed:1,skipped:1});assert.equal(finishes,2);}
 finally{supabaseService.rpc=originalRpc;supabaseService.from=originalFrom;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
