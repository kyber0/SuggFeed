import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRoadmapDb,STAFF_ID,USER_ID,IDEA_ID,HIDDEN_ID,postProgress} from './support/roadmap-db';
type DB=Awaited<ReturnType<typeof createRoadmapDb>>;
const actions=['approve','decline','start','update','milestone','pause','resume','complete','correction','reopen','withdraw'];
const code=(value:string)=>(error:any)=>error.code===value;
async function version(db:DB,id=IDEA_ID){return (await db.query<any>('SELECT updated_at::text FROM submissions WHERE id=$1',[id])).rows[0].updated_at;}
async function today(db:DB){return (await db.query<any>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS d`)).rows[0].d;}
async function action(db:DB,name:string,opts:{id?:string;actor?:string;request?:string;at?:string;date?:string;body?:string}={}){
 const id=opts.id||IDEA_ID;
 return (await db.query<any>(`SELECT perform_workflow_action($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::text,$6::text,$7::date,NULL::smallint,$8::text,NULL::text,'School administration',true) AS result`,
 [id,opts.actor||STAFF_ID,opts.request||randomUUID(),opts.at||await version(db,id),name,opts.body||'Verified school update explaining this action.',opts.date||await today(db),name==='pause'?'parts':null])).rows[0].result;
}
async function enabled(db:DB){await db.exec('UPDATE workflow_rollout SET enabled=true');}
test('guided actions reject legacy bypasses, unauthorized and invalid transitions; replay is idempotent',async()=>{
 const db=await createRoadmapDb();try{
  await enabled(db);
  await assert.rejects(()=>action(db,'complete'),code('P0101'));
  await assert.rejects(()=>action(db,'start',{actor:USER_ID}),code('42501'));
  await assert.rejects(()=>db.query(`UPDATE submissions SET status='in_progress' WHERE id=$1`,[IDEA_ID]),code('P0101'));
  await assert.rejects(()=>postProgress(db,{kind:'milestone'}),code('P0101'));
  const at=await version(db),request=randomUUID();const saved=await action(db,'start',{at,request});
  assert.equal(saved.submission.status,'in_progress');assert.ok(saved.workflow.allowedActions.includes('complete'));
  assert.equal(JSON.stringify(saved).includes('anonymous_tracking_hash'),false);
  assert.equal((await action(db,'start',{at,request})).replayed,true);
  assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM idea_updates')).rows[0].n,1);
  await assert.rejects(()=>action(db,'start',{at,request,body:'Different payload.'}),code('23505'));
  await assert.rejects(()=>action(db,'update',{at}),code('40001'));
  await action(db,'pause');await action(db,'update');
  assert.equal((await db.query<any>('SELECT is_blocked FROM submissions WHERE id=$1',[IDEA_ID])).rows[0].is_blocked,true);
  await action(db,'resume');
  assert.equal((await db.query<any>('SELECT is_blocked FROM submissions WHERE id=$1',[IDEA_ID])).rows[0].is_blocked,false);
  await action(db,'approve',{id:HIDDEN_ID});
  assert.equal((await db.query<any>('SELECT status::text FROM submissions WHERE id=$1',[HIDDEN_ID])).rows[0].status,'approved');
 }finally{await db.close();}
});
test('new completion requires ready evidence bound to the same request and idea; reopen is admin only',async()=>{
 const db=await createRoadmapDb();try{
  await enabled(db);await action(db,'start');
  await assert.rejects(()=>action(db,'complete'),code('P0104'));
  const request=randomUUID(),file=randomUUID();
  await db.query('SELECT bind_progress_draft($1::uuid,$2::uuid,$3::uuid)',[STAFF_ID,request,IDEA_ID]);
  await db.query(`SELECT * FROM reserve_progress_upload($1::uuid,$2::uuid,'proof.png','image/png',100,'Completed library seating.',$3::uuid)`,[STAFF_ID,request,file]);
  await assert.rejects(()=>action(db,'complete',{request}),code('P0104'));
  await db.query(`SELECT * FROM finalize_progress_upload($1::uuid,$2::uuid,$3::text,'image/webp',80)`,[STAFF_ID,file,`${file}/final.webp`]);
  await assert.rejects(()=>action(db,'complete',{request:randomUUID()}),code('P0104'));
  await db.query(`UPDATE idea_update_uploads SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1`,[file]);
  await assert.rejects(()=>action(db,'complete',{request}),code('P0104'));
  await db.query(`UPDATE idea_update_uploads SET expires_at=clock_timestamp()+interval '1 day',actor_id=$2 WHERE id=$1`,[file,USER_ID]);
  await assert.rejects(()=>action(db,'complete',{request}),code('P0104'));
  await db.query('UPDATE idea_update_uploads SET actor_id=$2 WHERE id=$1',[file,STAFF_ID]);
  await db.query('UPDATE idea_update_drafts SET submission_id=$2 WHERE request_id=$1',[request,HIDDEN_ID]);
  await assert.rejects(()=>action(db,'complete',{request}),code('P0104'));
  await db.query('UPDATE idea_update_drafts SET submission_id=$2 WHERE request_id=$1',[request,IDEA_ID]);
  await action(db,'complete',{request});
  assert.deepEqual((await db.query<any>('SELECT status::text,progress_percent,is_blocked FROM submissions WHERE id=$1',[IDEA_ID])).rows[0],{status:'resolved',progress_percent:100,is_blocked:false});
  await assert.rejects(()=>action(db,'reopen'),code('42501'));
  await db.query(`UPDATE profiles SET role='admin' WHERE id=$1`,[STAFF_ID]);
  await action(db,'reopen');
  assert.deepEqual((await db.query<any>('SELECT status::text,progress_percent,resolved_at FROM submissions WHERE id=$1',[IDEA_ID])).rows[0],{status:'in_progress',progress_percent:null,resolved_at:null});
  assert.equal((await db.query<any>(`SELECT count(*)::int AS n FROM idea_updates WHERE kind='completed'`)).rows[0].n,1);
  await action(db,'withdraw');
  assert.equal((await db.query<any>('SELECT status::text FROM submissions WHERE id=$1',[IDEA_ID])).rows[0].status,'rejected');
  assert.equal((await db.query('SELECT * FROM read_roadmap_activity($1::uuid[])',[[IDEA_ID]])).rows.length,0);
 }finally{await db.close();}
});
test('historical dates require private administrator verification, permit old dates and do not rewrite events',async()=>{
 const db=await createRoadmapDb();try{
  await db.query(`UPDATE submissions SET status='in_progress',started_at=NULL WHERE id=$1`,[IDEA_ID]);await enabled(db);
  await assert.rejects(()=>action(db,'update'),code('P0102'));
  const repair=async(actor=STAFF_ID,date='2000-01-01')=>db.query(`SELECT repair_work_dates($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::date,NULL::date,'Signed work log, office archive','Verified historical date')`,[IDEA_ID,actor,randomUUID(),await version(db),date]);
  await assert.rejects(()=>repair(),code('42501'));
  await db.query(`UPDATE profiles SET role='admin' WHERE id=$1`,[STAFF_ID]);
  await assert.rejects(()=>repair(),code('22023'));
  assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM work_date_repairs')).rows[0].n,0);
  const date=(await db.query<any>(`SELECT to_char(created_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS d FROM submissions WHERE id=$1`,[IDEA_ID])).rows[0].d;
  await repair(STAFF_ID,date);await action(db,'update');
  assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM work_date_repairs')).rows[0].n,1);
  assert.equal((await db.query<any>('SELECT count(*)::int AS n FROM idea_updates')).rows[0].n,1);
  await db.exec('UPDATE workflow_rollout SET paused=true');
  await assert.rejects(()=>action(db,'update'),code('P0103'));
 }finally{await db.close();}
});
test('enforcement prevents moderator report withdrawals and merging; admins preserve withdrawal history',async()=>{
 const db=await createRoadmapDb();try{
  await enabled(db);
  await db.query(`SELECT community_action($1::uuid,'report',$2::jsonb)`,[USER_ID,JSON.stringify({submissionId:IDEA_ID,body:'Please review this suggestion carefully.'})]);
  const report=(await db.query<any>('SELECT id FROM reports WHERE submission_id=$1',[IDEA_ID])).rows[0].id;
  const resolve=()=>db.query(`SELECT community_action($1::uuid,'resolve',$2::jsonb)`,[STAFF_ID,JSON.stringify({id:report,resolution:'removed',body:'Withdrawn after administrator verification.'})]);
  await assert.rejects(resolve,code('42501'));
  assert.equal((await db.query<any>('SELECT resolved_at FROM reports WHERE id=$1',[report])).rows[0].resolved_at,null);
  await db.query(`UPDATE profiles SET role='admin' WHERE id=$1`,[STAFF_ID]);await resolve();
  assert.equal((await db.query<any>(`SELECT kind FROM idea_updates WHERE submission_id=$1`,[IDEA_ID])).rows[0].kind,'withdrawn');
  await db.exec('SET ROLE anon');
  await assert.rejects(()=>db.query('SELECT * FROM work_date_repairs'),code('42501'));
  await assert.rejects(()=>db.query('SELECT * FROM workflow_rollout'),code('42501'));
  await assert.rejects(()=>db.query('SELECT staff_workflow_context($1::uuid,$2::uuid)',[IDEA_ID,STAFF_ID]),code('42501'));
 }finally{await db.close();}
});
test('all five database states reject every unavailable guided action without side effects',async()=>{
 const db=await createRoadmapDb();try{
  await db.query(`UPDATE profiles SET role='admin' WHERE id=$1`,[STAFF_ID]);
  const allowed:Record<string,string[]>={pending:['approve','decline'],approved:['start','withdraw'],in_progress:['update','milestone','pause','complete','correction','withdraw'],resolved:['correction','reopen','withdraw'],rejected:[]};
  for(const state of Object.keys(allowed)){
   await db.exec('UPDATE workflow_rollout SET enabled=false');
   await db.query(`UPDATE submissions SET status=$2::submission_status,progress_percent=CASE WHEN $2='resolved' THEN 100::smallint ELSE NULL END,started_at=CASE WHEN $2 IN ('in_progress','resolved') THEN clock_timestamp()-interval '1 day' ELSE NULL END,is_blocked=false WHERE id=$1`,[IDEA_ID,state]);
   await enabled(db);const before=await db.query('SELECT status,updated_at,started_at,resolved_at,progress_percent FROM submissions WHERE id=$1',[IDEA_ID]);
   for(const name of actions.filter(name=>!allowed[state].includes(name)))await assert.rejects(()=>action(db,name),code('P0101'),`${state} must reject ${name}`);
   assert.deepEqual((await db.query('SELECT status,updated_at,started_at,resolved_at,progress_percent FROM submissions WHERE id=$1',[IDEA_ID])).rows,before.rows);
  }
  await db.exec('UPDATE workflow_rollout SET enabled=false');
  await action(db,'decline',{id:HIDDEN_ID});
  assert.equal((await db.query<any>('SELECT status::text,staff_note FROM submissions WHERE id=$1',[HIDDEN_ID])).rows[0].status,'rejected');
 }finally{await db.close();}
});
