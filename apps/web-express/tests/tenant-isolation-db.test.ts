import { test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createTenantDb,tenantRpc,DEMO_SCHOOL,SCHOOL_A,SCHOOL_B,ADMIN_A,ADMIN_B,STUDENT,CATEGORY_A,CATEGORY_B,IDEA_A,IDEA_B } from './support/tenant-db';

const savedFilters={sort:'all',category:'All',search:'',scope:'all'};
async function timestamp(db:PGlite,id:string) {return (await db.query<any>('SELECT updated_at::text value FROM submissions WHERE id=$1',[id])).rows[0].value;}
async function publicSettings(db:PGlite) {
 // The publication helper deliberately fails closed before the onboarding migration exists.
 await db.exec("CREATE TABLE school_settings(school_id uuid PRIMARY KEY,publication_policy text,approved_at timestamptz)");
 await db.query<any>("INSERT INTO school_settings VALUES($1,'public',now()),($2,'private',now())",[SCHOOL_A,SCHOOL_B]);
}
async function asRole(db:PGlite,role:string,sql:string,args:any[]=[]) {
 await db.exec('SET ROLE '+role);try{return (await db.query<any>(sql,args)).rows;}finally{await db.exec('RESET ROLE');}
}

test('all real migrations preserve demo rows, assign every owner, constrain ancestry and keep activation locked',async()=>{
 const db=await createTenantDb({through:'202610160001_school_registry.sql',seed:false});
 try {
  await db.query<any>("INSERT INTO auth.users(id,email) VALUES($1,'demo@example.invalid')",[STUDENT]);
  await db.query<any>("INSERT INTO submissions(title,description,category_id,user_id) SELECT 'Preserve this demo record','This demo record survives the migration.',id,$1 FROM categories LIMIT 1",[STUDENT]);
  const before=(await db.query<any>('SELECT id,title,description,user_id FROM submissions')).rows;
  assert.equal((await db.query<any>("SELECT has_table_privilege('anon','submissions','SELECT') allowed")).rows[0].allowed,true,'Exercise removal of the hosted default API grants');
  await db.exec(readFileSync(path.resolve(__dirname,'../../../supabase/migrations/202610160002_tenant_isolation.sql'),'utf8'));
  assert.deepEqual((await db.query<any>('SELECT id,title,description,user_id FROM submissions')).rows,before);
  assert.equal((await db.query<any>('SELECT school_id FROM submissions')).rows[0].school_id,DEMO_SCHOOL);
  assert.equal((await db.query<any>('SELECT count(*)::int n FROM platform_operators')).rows[0].n,0);
  assert.equal((await db.query<any>('SELECT isolation_verified FROM school_release_gate')).rows[0].isolation_verified,false);
  const tables=(await db.query<any>("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT IN('profiles','web_sessions','schools','school_memberships','school_registry_events','school_release_gate','platform_operators','tenant_rpc_catalog')")).rows;
  assert.equal(tables.length,30);
  for(const {relname} of tables) {
   const field=(await db.query<any>("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='school_id'",[relname])).rows[0];
   assert.equal(field?.attnotnull,true,relname+' must have nonnull school ownership');
   assert.equal((await db.query<any>(`SELECT count(*)::int n FROM ${relname} WHERE school_id<>$1`,[DEMO_SCHOOL])).rows[0].n,0);
  }
  const badFks=(await db.query<any>("SELECT c.conname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='school_id' JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attname='school_id' WHERE c.contype='f' AND NOT(a.attnum=ANY(c.conkey) AND b.attnum=ANY(c.confkey))")).rows;
  assert.deepEqual(badFks,[]);
 }finally{await db.close();}
});

test('legacy REST/RPC grants fail closed, global admin sees only self and cannot change authority',async()=>{
 const db=await createTenantDb();try{
  await db.query<any>("UPDATE profiles SET role='admin' WHERE id=$1",[STUDENT]);
  await db.query<any>("SELECT set_config('request.jwt.claim.sub',$1,false)",[STUDENT]);
  for(const role of ['anon','authenticated']) {
   for(const table of ['submissions','categories','votes','comments','reports','status_history','staff_internal_notes','school_profiles','tenant_rpc_catalog']) {
    await assert.rejects(asRole(db,role,'SELECT * FROM '+table),/permission denied/,role+' '+table);
   }
   await assert.rejects(asRole(db,role,'SELECT tenant_rpc($1,$2,$3,$4)',[SCHOOL_A,STUDENT,'read_roadmap_activity',{}]),/permission denied/);
  }
  const own=await asRole(db,'authenticated','SELECT id FROM profiles');assert.deepEqual(own,[{id:STUDENT}]);
  await assert.rejects(asRole(db,'authenticated',"UPDATE profiles SET role='moderator' WHERE id=$1",[STUDENT]),/permission denied/);
  await assert.rejects(asRole(db,'service_role',"UPDATE profiles SET role='moderator' WHERE id=$1",[STUDENT]),/Global roles cannot/);
  const catalog=(await db.query<any>('SELECT function_signature FROM tenant_rpc_catalog')).rows;
  assert.equal(catalog.length,34);
  for(const {function_signature} of catalog) for(const role of ['anon','authenticated','service_role']) {
   assert.equal((await db.query<any>('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,function_signature])).rows[0].allowed,false,function_signature+' '+role);
  }
  const role=(await db.query<any>("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='tenant_executor'")).rows[0];
  assert.deepEqual(role,{rolcanlogin:false,rolsuper:false,rolbypassrls:false});
  assert.equal((await db.query<any>("SELECT has_schema_privilege('tenant_executor','public','CREATE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query<any>("SELECT pg_has_role('service_role','tenant_executor','MEMBER') m")).rows[0].m,false);
  const unsafe=(await db.query<any>("SELECT p.proname FROM pg_proc p JOIN tenant_rpc_catalog c ON p.oid=to_regprocedure(c.function_signature) JOIN pg_roles r ON r.oid=p.proowner WHERE r.rolname<>'tenant_executor' OR NOT p.prosecdef")).rows;
  assert.deepEqual(unsafe,[]);
 }finally{await db.close();}
});

test('membership authorizes staff, revocation/suspension/global roles/forged actors never do',async()=>{
 const db=await createTenantDb();try{
  const ctx=await tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_context',{p_submission_id:IDEA_A});assert.ok(ctx.allowedActions.includes('start'));
  await assert.rejects(tenantRpc(db,SCHOOL_B,ADMIN_A,'staff_workflow_context',{p_submission_id:IDEA_B}),/membership required/);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_context',{p_submission_id:IDEA_B}),/not found/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_context',{p_submission_id:IDEA_A,p_actor_id:ADMIN_B}),/actor mismatch/);
  await db.query<any>("UPDATE profiles SET role='admin' WHERE id=$1",[STUDENT]);
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'staff_workflow_context',{p_submission_id:IDEA_A}),/Staff access/);
  await db.query<any>("UPDATE school_memberships SET status='revoked' WHERE school_id=$1 AND user_id=$2",[SCHOOL_A,ADMIN_A]);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_context',{p_submission_id:IDEA_A}),/membership required/);
  await db.query<any>("UPDATE schools SET status='suspended' WHERE id=$1",[SCHOOL_B]);
  await assert.rejects(tenantRpc(db,SCHOOL_B,ADMIN_B,'read_public_submission_history',{p_submission_id:IDEA_B}),/School unavailable/);
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'set_config',{}),/RPC unavailable/);
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'read_roadmap_activity',{p_ids:[IDEA_A],injection:1}),/Unknown RPC/);
 }finally{await db.close();}
});

test('all public read projections and aggregates exclude the other school and private fields',async()=>{
 const db=await createTenantDb();try{
  await assert.rejects(tenantRpc(db,SCHOOL_A,null,'read_roadmap_activity',{p_ids:[IDEA_A]}),/School membership/);
  await publicSettings(db);
  const activity=await tenantRpc(db,SCHOOL_A,null,'read_roadmap_activity',{p_ids:[IDEA_A,IDEA_B]});assert.deepEqual(activity.map((x:any)=>x.id),[IDEA_A]);
  assert.deepEqual(Object.keys(activity[0]).sort(),['id','last_public_update','outcome']);
  const counts=await tenantRpc(db,SCHOOL_A,null,'roadmap_category_counts',{});assert.equal(counts.reduce((n:number,c:any)=>n+c.total,0),1);
  for(const name of ['read_public_idea_updates','read_public_idea_update_files']) {
   assert.deepEqual(await tenantRpc(db,SCHOOL_A,null,name,{p_submission_id:IDEA_B}),[]);
   assert.deepEqual(await tenantRpc(db,SCHOOL_A,null,name,{p_submission_id:IDEA_A}),[]);
  }
  assert.deepEqual(await tenantRpc(db,SCHOOL_A,null,'read_public_submission_history',{p_submission_id:IDEA_B}),null);
  await assert.rejects(tenantRpc(db,SCHOOL_B,null,'read_roadmap_activity',{p_ids:[IDEA_B]}),/School membership/);
  await db.query<any>("UPDATE school_settings SET publication_policy='private' WHERE school_id=$1",[SCHOOL_A]);
  await assert.rejects(tenantRpc(db,SCHOOL_A,null,'read_public_submission_history',{p_submission_id:IDEA_A}),/School membership/);
 }finally{await db.close();}
});

test('composite parent/account constraints prevent cross-school service writes and ownership transfer',async()=>{
 const db=await createTenantDb();try{
  await assert.rejects(db.query<any>("INSERT INTO submissions(school_id,title,description,category_id) VALUES($1,'Wrong tenant category','This cannot refer to another school category.',$2)",[SCHOOL_A,CATEGORY_B]),/foreign key/);
  await assert.rejects(db.query<any>('INSERT INTO bookmarks(school_id,user_id,submission_id) VALUES($1,$2,$3)',[SCHOOL_A,STUDENT,IDEA_B]),/foreign key/);
  await assert.rejects(db.query<any>('INSERT INTO submission_workflow(school_id,submission_id,assignee_id) VALUES($1,$2,$3)',[SCHOOL_A,IDEA_A,ADMIN_B]),/foreign key/);
  await assert.rejects(db.query<any>("INSERT INTO idea_merges(school_id,source_id,target_id,source_title,reason) VALUES($1,$2,$3,'Source title','A valid merge reason.')",[SCHOOL_A,IDEA_A,IDEA_B]),/foreign key/);
  await assert.rejects(db.query<any>('UPDATE submissions SET school_id=$1 WHERE id=$2',[SCHOOL_B,IDEA_A]),/immutable/);
  await assert.rejects(asRole(db,'service_role',"INSERT INTO categories(name,slug) VALUES('No school','no-school')"),/null value/);
 }finally{await db.close();}
});

test('receipt/idempotency/search/preferences/digest keys are local to a school',async()=>{
 const db=await createTenantDb();try{
  const request=crypto.randomUUID(),hash='a'.repeat(64);
  const args={p_owner_hash:hash,p_request_id:request,p_payload_hash:hash,p_title:'More library seating',p_description:'Add additional seating inside the library.',p_tracking_hash:null};
  const a=await tenantRpc(db,SCHOOL_A,STUDENT,'create_submission_once',{...args,p_category_id:CATEGORY_A});
  const b=await tenantRpc(db,SCHOOL_B,STUDENT,'create_submission_once',{...args,p_category_id:CATEGORY_B});assert.notEqual(a.id,b.id);
  assert.equal((await tenantRpc(db,SCHOOL_A,STUDENT,'create_submission_once',{...args,p_category_id:CATEGORY_A})).replayed,true);
  assert.equal((await tenantRpc(db,SCHOOL_B,STUDENT,'read_submission_receipt',{p_owner_hash:hash,p_request_id:request})).id,b.id);
  for(const school of [SCHOOL_A,SCHOOL_B]) {
   const s=await tenantRpc(db,school,STUDENT,'save_student_search',{p_name:'Library',p_filters:savedFilters});assert.equal(s.name,'Library');
   await db.query<any>('INSERT INTO notification_preferences(school_id,user_id,weekly_digest) VALUES($1,$2,true)',[school,STUDENT]);
  }
  const ja=await tenantRpc(db,SCHOOL_A,null,'claim_weekly_digests');const jb=await tenantRpc(db,SCHOOL_B,null,'claim_weekly_digests');
  assert.equal(ja.length,1);assert.equal(jb.length,1);assert.equal(ja[0].school_id,SCHOOL_A);assert.equal(jb[0].school_id,SCHOOL_B);
  assert.deepEqual(await tenantRpc(db,SCHOOL_A,null,'claim_weekly_digests'),[]);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'claim_weekly_digests'),/Server job/);
 }finally{await db.close();}
});

test('evidence reservation/finalization/reads/cleanup preserve tenant paths and deny resource swaps',async()=>{
 const db=await createTenantDb();try{
  const request=crypto.randomUUID(),args={p_request_id:request,p_name:'Document.pdf',p_mime:'application/pdf',p_size:100,p_alt:null};
  const a=await tenantRpc(db,SCHOOL_A,ADMIN_A,'reserve_progress_upload',args);
  const b=await tenantRpc(db,SCHOOL_B,ADMIN_B,'reserve_progress_upload',args);
  assert.ok(a.temp_path.startsWith(SCHOOL_A+'/'));assert.ok(b.temp_path.startsWith(SCHOOL_B+'/'));
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'finalize_progress_upload',{p_file_id:b.id,p_path:b.final_path,p_mime:'application/pdf',p_size:100}),/not found|unavailable/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'cancel_progress_upload',{p_file_id:b.id}),/not found|unavailable/i);
  assert.deepEqual(await tenantRpc(db,SCHOOL_A,ADMIN_A,'read_authorized_progress_file',{p_file_id:b.id}),[]);
  assert.deepEqual(await tenantRpc(db,SCHOOL_A,ADMIN_A,'read_staff_idea_update_files',{p_submission_id:IDEA_B}),[]);
  const ready=await tenantRpc(db,SCHOOL_A,ADMIN_A,'finalize_progress_upload',{p_file_id:a.id,p_path:a.final_path,p_mime:'application/pdf',p_size:100});assert.equal(ready.state,'ready');
  await tenantRpc(db,SCHOOL_A,ADMIN_A,'bind_progress_draft',{p_request_id:request,p_submission_id:IDEA_A});
  await tenantRpc(db,SCHOOL_A,ADMIN_A,'cancel_progress_upload',{p_file_id:a.id});
  await db.query<any>("UPDATE idea_update_uploads SET upload_token_expires_at=now()-interval '1 day',expires_at=now()-interval '1 day'");
  const claimed=await tenantRpc(db,SCHOOL_A,null,'claim_progress_upload_cleanup',{});assert.ok(claimed.length>=1);assert.ok(claimed.every((x:any)=>x.school_id===SCHOOL_A));
  await tenantRpc(db,SCHOOL_A,null,'finish_progress_upload_cleanup',{p_file_id:a.id});
  await tenantRpc(db,SCHOOL_A,null,'finish_progress_source_cleanup',{p_file_id:b.id});
  const other=(await db.query<any>('SELECT state,source_cleaned_at FROM idea_update_uploads WHERE id=$1',[b.id])).rows[0];assert.equal(other.state,'pending');assert.equal(other.source_cleaned_at,null);
  assert.ok((await tenantRpc(db,SCHOOL_A,null,'list_progress_sources_to_clean',{})).every((x:any)=>x.id!==b.id));
 }finally{await db.close();}
});

test('community, follow/vote/notification and staff saves cannot affect another school; mixed batch is atomic',async()=>{
 const db=await createTenantDb();try{
  const before=(await db.query<any>('SELECT id,status,vote_count FROM submissions ORDER BY id')).rows;
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'set_idea_follow',{p_submission_id:IDEA_B,p_following:true}),/not found|unavailable/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'set_idea_vote',{p_submission_id:IDEA_B,p_action:'vote',p_anon_token:null,p_device_hash:null,p_ip_hash:null}),/not found|unavailable|invalid/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'cast_idea_vote',{p_submission_id:IDEA_B}),/not found|unavailable/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'community_action',{p_action:'bulk_assign',p_data:{assigneeId:ADMIN_A,items:[{id:IDEA_A,updatedAt:await timestamp(db,IDEA_A)},{id:IDEA_B,updatedAt:await timestamp(db,IDEA_B)}]}}),/Not found/);
  assert.deepEqual((await db.query<any>('SELECT id,status,vote_count FROM submissions ORDER BY id')).rows,before);
  assert.equal((await db.query<any>('SELECT count(*)::int n FROM audit_log')).rows[0].n,0);
  assert.equal(await tenantRpc(db,SCHOOL_A,STUDENT,'set_idea_follow',{p_submission_id:IDEA_A,p_following:true}),null);
  const v=await tenantRpc(db,SCHOOL_A,STUDENT,'set_idea_vote',{p_submission_id:IDEA_A,p_action:'vote',p_anon_token:null,p_device_hash:null,p_ip_hash:null});assert.ok(v);
  await tenantRpc(db,SCHOOL_A,ADMIN_A,'save_staff_view',{p_name:'Queue',p_filters:{}});
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'save_staff_review',{p_submission_id:IDEA_B,p_expected_updated_at:await timestamp(db,IDEA_B),p_status:'approved',p_note:'Reviewed',p_assignee_id:null,p_priority:'normal',p_target_date:null}),/Not found/);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'moderate_submission',{p_submission_id:IDEA_B,p_status:'rejected',p_note:'Reviewed'}),/Not found/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'review_submission_transition',{p_submission_id:IDEA_B,p_expected_status:'approved',p_status:'rejected',p_note:'Reviewed'}),/Not found/i);
  const staff=await tenantRpc(db,SCHOOL_A,ADMIN_A,'admin_search_students',{});assert.ok(staff.every((x:any)=>x.id!==ADMIN_B));
  assert.equal(await tenantRpc(db,SCHOOL_A,STUDENT,'mark_idea_notification_read',{p_notification_id:crypto.randomUUID()}),false);
 }finally{await db.close();}
});

test('workflow posts/snapshots/dates and notification trigger read only their school',async()=>{
 const db=await createTenantDb();try{
  const day=(await db.query<any>("SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS day")).rows[0].day;
  assert.equal(await tenantRpc(db,SCHOOL_A,STUDENT,'set_idea_follow',{p_submission_id:IDEA_A,p_following:true}),null);
  const post={p_submission_id:IDEA_A,p_request_id:crypto.randomUUID(),p_expected_updated_at:await timestamp(db,IDEA_A),p_kind:'update',p_body:'The school reviewed this work and published a progress update.',p_visibility:'public',p_percent:null,p_blocked_reason:null,p_next_step:null,p_occurred_on:day,p_office_label:'School administration',p_notify:true};
  const published=await tenantRpc(db,SCHOOL_A,ADMIN_A,'post_idea_update',post);assert.ok(published.update.id);
  assert.equal((await db.query<any>('SELECT school_id FROM idea_notifications')).rows[0].school_id,SCHOOL_A);
  const snapshot=await tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_snapshot',{p_submission_id:IDEA_A});assert.ok(snapshot);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_snapshot',{p_submission_id:IDEA_B}),/not found/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'post_idea_update',{...post,p_submission_id:IDEA_B,p_request_id:crypto.randomUUID(),p_expected_updated_at:await timestamp(db,IDEA_B)}),/Not found/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'repair_work_dates',{p_submission_id:IDEA_B,p_request_id:crypto.randomUUID(),p_expected_updated_at:await timestamp(db,IDEA_B),p_started_on:'2026-10-10',p_completed_on:null,p_source:'Verified school record',p_reason:'Repair from verified school record.'}),/not found|eligible|dates/i);
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'perform_workflow_action',{p_submission_id:IDEA_B,p_request_id:crypto.randomUUID(),p_expected_updated_at:await timestamp(db,IDEA_B),p_action:'start',p_body:'Work has begun on this school improvement.',p_occurred_on:day}),/not found|disabled|preview/i);
  const note=(await db.query<any>('SELECT id FROM idea_notifications WHERE school_id=$1',[SCHOOL_A])).rows[0].id;
  assert.equal(await tenantRpc(db,SCHOOL_B,STUDENT,'mark_idea_notification_read',{p_notification_id:note}),false);
  assert.equal(await tenantRpc(db,SCHOOL_A,STUDENT,'mark_idea_notification_read',{p_notification_id:note}),true);
 }finally{await db.close();}
});

test('signed members retain intentional anonymity and cannot impersonate any other account',async()=>{
 const db=await createTenantDb();try{
  const request=crypto.randomUUID(),hash='b'.repeat(64);
  const anon=await tenantRpc(db,SCHOOL_A,STUDENT,'create_submission_once',{p_owner_hash:hash,p_request_id:request,p_payload_hash:hash,p_title:'Anonymous school feedback',p_description:'Keep the author anonymous inside this school.',p_category_id:CATEGORY_A,p_user_id:null,p_tracking_hash:hash});
  assert.equal((await db.query<any>('SELECT user_id FROM submissions WHERE id=$1',[anon.id])).rows[0].user_id,null);
  await tenantRpc(db,SCHOOL_A,STUDENT,'cast_idea_vote',{p_submission_id:IDEA_A,p_user_id:null,p_anon_token:'opaque-anonymous-vote-token'});
  const vote=(await db.query<any>('SELECT user_id,school_id FROM votes WHERE submission_id=$1',[IDEA_A])).rows[0];assert.equal(vote.user_id,null);assert.equal(vote.school_id,SCHOOL_A);
  await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'cast_idea_vote',{p_submission_id:IDEA_A,p_user_id:ADMIN_A}),/actor mismatch/);
 }finally{await db.close();}
});

test('guided actions and date repair succeed atomically with school-local operation IDs',async()=>{
 const db=await createTenantDb();try{
  const day=(await db.query<any>("SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS day")).rows[0].day;
  const request=crypto.randomUUID();
  for(const [school,admin,idea] of [[SCHOOL_A,ADMIN_A,IDEA_A],[SCHOOL_B,ADMIN_B,IDEA_B]]) {
   await db.query<any>('UPDATE workflow_rollout SET enabled=true WHERE school_id=$1',[school]);
   const args={p_submission_id:idea,p_request_id:request,p_expected_updated_at:await timestamp(db,idea),p_action:'start',p_body:'Start work after the school reviewed this proposal.',p_occurred_on:day};
   const result=await tenantRpc(db,school,admin,'perform_workflow_action',args);assert.equal(result.submission.status,'in_progress');
   assert.equal((await tenantRpc(db,school,admin,'perform_workflow_action',args)).replayed,true);
   const repair=await tenantRpc(db,school,admin,'repair_work_dates',{p_submission_id:idea,p_request_id:crypto.randomUUID(),p_expected_updated_at:await timestamp(db,idea),p_started_on:day,p_completed_on:null,p_source:'Verified school work record',p_reason:'Dates checked against the school work record.'});assert.equal(repair.success,true);
  }
  const keys=(await db.query<any>('SELECT school_id FROM workflow_requests WHERE request_id=$1 ORDER BY school_id',[request])).rows;assert.equal(keys.length,2);
  assert.equal((await db.query<any>('SELECT count(*)::int n FROM work_date_repairs')).rows[0].n,2);
 }finally{await db.close();}
});

test('legacy staff review succeeds with membership assignees and denies cross-school assignees',async()=>{
 const db=await createTenantDb();try{
  const args={p_submission_id:IDEA_A,p_expected_updated_at:await timestamp(db,IDEA_A),p_status:'approved',p_note:'The school reviewed this proposal.',p_assignee_id:ADMIN_A,p_priority:'normal',p_target_date:null};
  await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_A,'save_staff_review',{...args,p_assignee_id:ADMIN_B}),/Assignee must be staff/);
  await tenantRpc(db,SCHOOL_A,ADMIN_A,'save_staff_review',args);
  await tenantRpc(db,SCHOOL_A,ADMIN_A,'review_submission_transition',{p_submission_id:IDEA_A,p_expected_status:'approved',p_status:'rejected',p_note:'Reviewed by this school.'});
  assert.equal((await db.query<any>('SELECT status FROM submissions WHERE id=$1',[IDEA_A])).rows[0].status,'rejected');
  assert.equal((await db.query<any>('SELECT status FROM submissions WHERE id=$1',[IDEA_B])).rows[0].status,'approved');
  const view=await asRole(db,'service_role','SELECT school_id,assignee_id FROM staff_submission_queue WHERE school_id=$1',[SCHOOL_A]);assert.equal(view.length,1);assert.equal(view[0].assignee_id,ADMIN_A);
 }finally{await db.close();}
});

test('revoked memberships are excluded from digest claims and follower notification fanout',async()=>{
 const db=await createTenantDb();try{
  assert.equal(await tenantRpc(db,SCHOOL_A,STUDENT,'set_idea_follow',{p_submission_id:IDEA_A,p_following:true}),null);
  await db.query<any>('INSERT INTO notification_preferences(school_id,user_id,weekly_digest) VALUES($1,$2,true)',[SCHOOL_A,STUDENT]);
  await db.query<any>("UPDATE school_memberships SET status='revoked' WHERE school_id=$1 AND user_id=$2",[SCHOOL_A,STUDENT]);
  assert.deepEqual(await tenantRpc(db,SCHOOL_A,null,'claim_weekly_digests'),[]);
  const day=(await db.query<any>("SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS day")).rows[0].day;
  await tenantRpc(db,SCHOOL_A,ADMIN_A,'post_idea_update',{p_submission_id:IDEA_A,p_request_id:crypto.randomUUID(),p_expected_updated_at:await timestamp(db,IDEA_A),p_kind:'update',p_body:'School progress is available to current followers.',p_visibility:'public',p_percent:null,p_blocked_reason:null,p_next_step:null,p_occurred_on:day,p_notify:true});
  assert.equal((await db.query<any>('SELECT count(*)::int n FROM idea_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

test('combined isolation/onboarding migration gates public access on current approved publication settings',async()=>{
 const db=await createTenantDb();try{
  await db.exec(readFileSync(path.resolve(__dirname,'../../../supabase/migrations/202610160003_school_onboarding.sql'),'utf8'));
  await db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[ADMIN_A]);
  const policies={privacy_notice:'Reviewed school privacy notice for this service.',terms_notice:'Reviewed school service terms and responsibilities.',privacy_contact:'privacy@example.invalid',school_contact:'school@example.invalid',age_policy:'School eligibility and age rules reviewed.',publication_policy:'public',retention_days:365};
  await asRole(db,'service_role','SELECT update_school_settings($1,$2,1,$3::jsonb)',[SCHOOL_A,ADMIN_A,JSON.stringify(policies)]);
  await assert.rejects(tenantRpc(db,SCHOOL_A,null,'read_roadmap_activity',{p_ids:[IDEA_A,IDEA_B]}),/School membership/);
  await asRole(db,'service_role','SELECT approve_school_settings($1,$2,2,$3)',[SCHOOL_A,ADMIN_A,'Verified institutional agreement and public notice review']);
  assert.deepEqual((await tenantRpc(db,SCHOOL_A,null,'read_roadmap_activity',{p_ids:[IDEA_A,IDEA_B]})).map((x:any)=>x.id),[IDEA_A]);
  await asRole(db,'service_role','SELECT update_school_settings($1,$2,2,$3::jsonb)',[SCHOOL_A,ADMIN_A,JSON.stringify({...policies,publication_policy:'private'})]);
  await assert.rejects(tenantRpc(db,SCHOOL_A,null,'read_roadmap_activity',{p_ids:[IDEA_A]}),/School membership/);
  assert.equal((await db.query<any>('SELECT isolation_verified FROM school_release_gate')).rows[0].isolation_verified,false);
  assert.equal((await tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_context',{p_submission_id:IDEA_A})).mode,'preview');
 }finally{await db.close();}
});

test('tenant page queries use a school-prefixed index with representative synthetic rows',async()=>{
 const db=await createTenantDb();try{
  for(const [school,category] of [[SCHOOL_A,CATEGORY_A],[SCHOOL_B,CATEGORY_B]]) {
   await db.query<any>(`INSERT INTO submissions(school_id,title,description,category_id,status,created_at)
    SELECT $1,'Synthetic school feedback','Synthetic content for local query planning.',$2,'pending',now()-n*interval '1 minute' FROM generate_series(1,1500) n`,[school,category]);
  }
  await db.exec('ANALYZE submissions');
  const plan=(await db.query<any>("EXPLAIN (FORMAT JSON) SELECT id,title FROM submissions WHERE school_id=$1 AND status='pending' ORDER BY created_at DESC,id DESC LIMIT 25",[SCHOOL_A])).rows[0]['QUERY PLAN'];
  assert.match(JSON.stringify(plan),/submissions_school_status_page_idx/);
 }finally{await db.close();}
});

test('migration ownership transfer works without superuser or RLS bypass privileges',async()=>{
 const db=await createTenantDb({seed:false,migrationRole:true});try{
  const role=(await db.query<any>("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='migration_owner'")).rows[0];assert.deepEqual(role,{rolsuper:false,rolbypassrls:false});
  const owners=(await db.query<any>("SELECT p.proname FROM pg_proc p JOIN tenant_rpc_catalog c ON p.oid=to_regprocedure(c.function_signature) JOIN pg_roles r ON r.oid=p.proowner WHERE r.rolname<>'tenant_executor'")).rows;assert.deepEqual(owners,[]);
  assert.equal((await db.query<any>("SELECT has_schema_privilege('tenant_executor','public','CREATE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});

test('bookmark/share upserts match scoped conflict keys and reject a foreign-school parent',async()=>{
 const db=await createTenantDb();try{
  for(const table of ['bookmarks','shared_posts']) {
   const sql=`INSERT INTO ${table}(school_id,user_id,submission_id) VALUES($1,$2,$3)
    ON CONFLICT(school_id,user_id,submission_id) DO UPDATE SET user_id=excluded.user_id RETURNING id,school_id`;
   const first=await asRole(db,'service_role',sql,[SCHOOL_A,STUDENT,IDEA_A]);
   const replay=await asRole(db,'service_role',sql,[SCHOOL_A,STUDENT,IDEA_A]);assert.equal(replay[0].id,first[0].id);
   const other=await asRole(db,'service_role',sql,[SCHOOL_B,STUDENT,IDEA_B]);assert.equal(other[0].school_id,SCHOOL_B);assert.notEqual(other[0].id,first[0].id);
   await assert.rejects(asRole(db,'service_role',sql,[SCHOOL_A,STUDENT,IDEA_B]),/foreign key/);
   assert.equal((await db.query<any>(`SELECT count(*)::int n FROM ${table} WHERE school_id=$1`,[SCHOOL_A])).rows[0].n,1);
   assert.equal((await db.query<any>(`SELECT count(*)::int n FROM ${table} WHERE school_id=$1`,[SCHOOL_B])).rows[0].n,1);
  }
 }finally{await db.close();}
});
