import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safetyDb} from './support/submission-safety-db';
import {tenantRpc,SCHOOL_A,STUDENT,CATEGORY_A} from './support/tenant-db';
test('checked creation preserves receipts, holds unsafe text and charges quotas only once',async()=>{
 const db=await safetyDb();try{
 const args={p_owner_hash:'a'.repeat(64),p_request_id:'91000000-0000-4000-8000-000000000001',p_payload_hash:'b'.repeat(64),p_title:'Improve library seating',p_description:'Add comfortable seats to our campus library.',p_category_id:CATEGORY_A,p_anonymous:false,p_tracking_hash:null,p_form_version:null,p_answers:{},p_files:[]};
 const policy={limit:1,windowSeconds:3600,cooldownSeconds:0};
 const create=(input:typeof args,state='clear')=>tenantRpc(db,SCHOOL_A,STUDENT,'safe_submission_create',{p_args:input,p_verdict:{state,urgent:false},p_policy:policy});
 const first=await create(args,'flagged');const replay=await create(args,'flagged');assert.equal(first.id,replay.id);assert.equal(replay.replayed,true);
 assert.equal((await db.query<{safety_state:string}>('SELECT safety_state FROM submissions WHERE id=$1',[first.id])).rows[0].safety_state,'flagged');
 await assert.rejects(create({...args,p_request_id:'91000000-0000-4000-8000-000000000002'}),/Limit reached/);
 await assert.rejects(tenantRpc(db,SCHOOL_A,STUDENT,'moderate_submission',{p_submission_id:first.id,p_staff_id:STUDENT,p_status:'approved',p_note:'This cannot bypass safety.'}));
 }finally{await db.close();}
});

test('reports are unique, threshold hiding preserves workflow and review is admin-only',async()=>{
 const db=await safetyDb();try{
 const {IDEA_A,ADMIN_A,ADMIN_B}=await import('./support/tenant-db');
 await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'moderator')",[SCHOOL_A,ADMIN_B]);
 const action=(actor:string,name:string,data:Record<string,unknown>)=>tenantRpc(db,SCHOOL_A,actor,'submission_safety_action',{p_action:name,p_data:data});
 const policy={limit:20,windowSeconds:3600,reportThreshold:2};
 await action(STUDENT,'report',{id:IDEA_A,reason:'A report for administrator review.',policy});
 const duplicate=await action(STUDENT,'report',{id:IDEA_A,reason:'A duplicate must not count twice.',policy});assert.equal(duplicate.already_reported,true);
 await action(ADMIN_A,'report',{id:IDEA_A,reason:'A distinct report for school review.',policy});
 const row=(await db.query<{status:string;safety_state:string;safety_version:number}>('SELECT status,safety_state,safety_version FROM submissions WHERE id=$1',[IDEA_A])).rows[0];assert.equal(row.status,'approved');assert.equal(row.safety_state,'flagged');
 await assert.rejects(action(STUDENT,'queue',{}),/administrator/);await assert.rejects(action(ADMIN_B,'approve',{id:IDEA_A,version:row.safety_version,reason:'Moderators cannot approve safety flags.'}),/administrator/);
 assert.ok((await action(ADMIN_A,'queue',{})).items.some((r:{id:string})=>r.id===IDEA_A));
 await action(ADMIN_A,'approve',{id:IDEA_A,version:row.safety_version,reason:'Reviewed by a school administrator.'});assert.equal((await db.query<{safety_state:string}>('SELECT safety_state FROM submissions WHERE id=$1',[IDEA_A])).rows[0].safety_state,'clear');
 }finally{await db.close();}
});

test('urgent records stay private, alert admins with metadata only and never alert the submitter',async()=>{
 const db=await safetyDb();try{
 const args={p_owner_hash:'c'.repeat(64),p_request_id:'92000000-0000-4000-8000-000000000001',p_payload_hash:'d'.repeat(64),p_title:'A private urgent matter',p_description:'A protected record containing an urgent concern.',p_category_id:CATEGORY_A,p_anonymous:true,p_tracking_hash:'e'.repeat(64),p_form_version:null,p_answers:{},p_files:[]};
 const result=await tenantRpc(db,SCHOOL_A,STUDENT,'safe_submission_create',{p_args:args,p_verdict:{state:'clear',urgent:true},p_policy:{limit:5,windowSeconds:3600,cooldownSeconds:0}});
 assert.equal((await db.query<{safety_state:string}>('SELECT safety_state FROM submissions WHERE id=$1',[result.id])).rows[0].safety_state,'flagged');
 const notices=(await db.query<{user_id:string;kind:string}>('SELECT user_id,kind FROM submission_safety_notices WHERE submission_id=$1',[result.id])).rows;assert.ok(notices.length>0);assert.ok(notices.every(n=>n.user_id!==STUDENT&&n.kind==='urgent'));
 const inbox=await tenantRpc(db,SCHOOL_A,STUDENT,'submission_safety_action',{p_action:'notices',p_data:{}});assert.equal(inbox.items.length,0);
 }finally{await db.close();}
});

test('database similarity is school-scoped and never returns flagged or unpublished suggestions',async()=>{
 const db=await safetyDb();try{const {IDEA_A,IDEA_B,ADMIN_A}=await import('./support/tenant-db');
 const similar=()=>tenantRpc(db,SCHOOL_A,STUDENT,'safety_similar',{p_text:'library seating',p_threshold:0.1,p_limit:5});
 const rows=await similar();assert.ok(rows.some((r:{id:string})=>r.id===IDEA_A));assert.ok(rows.every((r:{id:string})=>r.id!==IDEA_B));
 await tenantRpc(db,SCHOOL_A,ADMIN_A,'submission_safety_action',{p_action:'hide',p_data:{id:IDEA_A,version:1,reason:'A private review is required for this idea.'}});
 assert.ok((await similar()).every((r:{id:string})=>r.id!==IDEA_A));
 }finally{await db.close();}
});

test('owner edits are scoped, versioned and stop as soon as staff review starts',async()=>{
 const db=await safetyDb();try{const {ADMIN_A,ADMIN_B}=await import('./support/tenant-db');
 const args={p_owner_hash:'f'.repeat(64),p_request_id:'93000000-0000-4000-8000-000000000001',p_payload_hash:'1'.repeat(64),p_title:'A new library suggestion',p_description:'Add accessible seats near the library entrance.',p_category_id:CATEGORY_A,p_anonymous:false,p_tracking_hash:null,p_form_version:null,p_answers:{},p_files:[]};const policy={limit:5,windowSeconds:3600,cooldownSeconds:0};
 const created=await tenantRpc(db,SCHOOL_A,STUDENT,'safe_submission_create',{p_args:args,p_verdict:{state:'clear',urgent:false},p_policy:policy});
 const action=(actor:string,name:string,data:Record<string,unknown>)=>tenantRpc(db,SCHOOL_A,actor,'submission_safety_action',{p_action:name,p_data:data});
 const edit={id:created.id,ownerHash:args.p_owner_hash,version:1,title:'Updated library suggestion',description:'Add accessible seats near the science library.',category:CATEGORY_A,verdict:{state:'clear',urgent:false},policy};
 await assert.rejects(action(ADMIN_A,'owner-edit',edit));
 const saved=await action(STUDENT,'owner-edit',edit);assert.equal(saved.version,2);await assert.rejects(action(STUDENT,'owner-edit',edit),/changed/);
 await tenantRpc(db,SCHOOL_A,ADMIN_A,'staff_workflow_context',{p_submission_id:created.id,p_actor_id:ADMIN_A});
 await assert.rejects(action(STUDENT,'owner-edit',{...edit,version:2}),/review already started/);
 assert.equal((await action(STUDENT,'owner-read',{id:created.id,ownerHash:args.p_owner_hash})).editable,false);
 await assert.rejects(tenantRpc(db,SCHOOL_A,ADMIN_B,'submission_safety_action',{p_action:'owner-read',p_data:{id:created.id}}));
 }finally{await db.close();}
});

test('admin analytics and append-only audit preserve previous values without leaking private content',async()=>{
 const db=await safetyDb();try{const {ADMIN_A,IDEA_A,SCHOOL_B}=await import('./support/tenant-db');
 const action=(actor:string,name:string,data:Record<string,unknown>={})=>tenantRpc(db,SCHOOL_A,actor,'submission_safety_action',{p_action:name,p_data:data});
 await assert.rejects(action(STUDENT,'analytics'),/administrator/);await assert.rejects(action(STUDENT,'audit'),/administrator/);
 await action(ADMIN_A,'hide',{id:IDEA_A,version:1,reason:'A private administrative safety review.'});
 const analytics=await action(ADMIN_A,'analytics');assert.equal(analytics.top.length,0);assert.equal(analytics.daily.length,30);
 const audit=await action(ADMIN_A,'audit');const changed=audit.items.find((r:{action:string})=>r.action==='submission_change');assert.equal(changed.metadata.previous.safety_state,'clear');assert.equal(changed.metadata.current.safety_state,'hidden');assert.ok(!JSON.stringify(changed).includes('Improve library seating'));
 await assert.rejects(db.exec("UPDATE audit_log SET action='changed'"),/append-only/);await assert.rejects(db.exec('DELETE FROM audit_log'),/append-only/);
 const other=await tenantRpc(db,SCHOOL_B,STUDENT,'submission_safety_action',{p_action:'notices',p_data:{}});assert.equal(other.items.length,0);
 }finally{await db.close();}
});

test('anonymous owner editing needs the original receipt and urgency cannot be cleared by editing',async()=>{
 const db=await safetyDb();try{
 const args={p_owner_hash:'2'.repeat(64),p_request_id:'94000000-0000-4000-8000-000000000001',p_payload_hash:'3'.repeat(64),p_title:'A private urgent suggestion',p_description:'A protected concern for the school to review.',p_category_id:CATEGORY_A,p_anonymous:true,p_tracking_hash:'4'.repeat(64),p_form_version:null,p_answers:{},p_files:[]};const policy={limit:5,windowSeconds:3600,cooldownSeconds:0};
 const created=await tenantRpc(db,SCHOOL_A,STUDENT,'safe_submission_create',{p_args:args,p_verdict:{state:'flagged',urgent:true},p_policy:policy});
 const action=(name:string,data:Record<string,unknown>)=>tenantRpc(db,SCHOOL_A,STUDENT,'submission_safety_action',{p_action:name,p_data:data});
 await assert.rejects(action('owner-read',{id:created.id,ownerHash:'5'.repeat(64)}));const own=await action('owner-read',{id:created.id,ownerHash:args.p_owner_hash});assert.equal(own.is_urgent,undefined);
 await action('owner-edit',{id:created.id,ownerHash:args.p_owner_hash,version:1,title:'An updated private suggestion',description:'Updated context for this private school concern.',category:CATEGORY_A,verdict:{state:'clear',urgent:false},policy});
 const row=(await db.query<{is_urgent:boolean;safety_state:string}>('SELECT is_urgent,safety_state FROM submissions WHERE id=$1',[created.id])).rows[0];assert.equal(row.is_urgent,true);assert.equal(row.safety_state,'flagged');
 }finally{await db.close();}
});

test('status notifications go only to the named owner and preserve progress stages',async()=>{
 const db=await safetyDb();try{const {IDEA_A,ADMIN_A}=await import('./support/tenant-db');
 await db.exec("SELECT set_config('suggfeed.school_id','"+SCHOOL_A+"',false),set_config('suggfeed.actor_id','"+ADMIN_A+"',false)");
 await db.query("UPDATE submissions SET status='rejected',staff_note='This requires a different school service.' WHERE id=$1",[IDEA_A]);
 const inbox=await tenantRpc(db,SCHOOL_A,STUDENT,'submission_safety_action',{p_action:'notices',p_data:{}});assert.equal(inbox.items.length,1);assert.equal(inbox.items[0].workflow_status,'rejected');assert.equal(inbox.items[0].kind,'status');assert.equal(inbox.items[0].is_urgent,undefined);
 await tenantRpc(db,SCHOOL_A,STUDENT,'submission_safety_action',{p_action:'notice-read',p_data:{id:inbox.items[0].id}});
 const read=await tenantRpc(db,SCHOOL_A,STUDENT,'submission_safety_action',{p_action:'notices',p_data:{}});assert.ok(read.items[0].read_at);
 }finally{await db.close();}
});

test('safety migration runs without superuser and returns schema creation privileges',async()=>{
 const db=await safetyDb(true);try{const result=await db.query<{allowed:boolean}>("SELECT has_schema_privilege('tenant_executor','public','CREATE') AS allowed");assert.equal(result.rows[0].allowed,false);}finally{await db.close();}
});

test('administrators can browse clean items for manual category overrides without exposing the queue',async()=>{
 const db=await safetyDb();try{const {ADMIN_A,IDEA_A}=await import('./support/tenant-db');const result=await tenantRpc(db,SCHOOL_A,ADMIN_A,'submission_safety_action',{p_action:'queue',p_data:{all:true}});assert.ok(result.items.some((r:{id:string})=>r.id===IDEA_A));const definition=(await db.query<{body:string}>("SELECT pg_get_functiondef('public.read_authorized_progress_file(uuid,uuid)'::regprocedure) AS body")).rows[0].body;assert.ok(definition.includes('s.id IS NOT NULL'));}finally{await db.close();}
});
