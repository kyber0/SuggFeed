import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {safetyDb} from './support/submission-safety-db';
import {SCHOOL_A,SCHOOL_B,ADMIN_A,ADMIN_B,STUDENT,IDEA_A,tenantRpc} from './support/tenant-db';

test('current migrations enforce assignment on private files while preserving public audience reads',async()=>{
 const db=await safetyDb(true);const assigned=randomUUID(),outsider=randomUUID();
 try{
  for(const actor of [assigned,outsider]){await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[actor,actor+'@example.invalid']);await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'moderator')",[SCHOOL_A,actor]);}
  await db.query("SELECT assignment_write($1,'suggestion',$2,$3,NULL,'synthetic-fixture',(SELECT slas->'normal' FROM assignment_settings WHERE school_id=$1))",[SCHOOL_A,IDEA_A,assigned]);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  for(const visibility of ['staff','public']){
   const request=randomUUID();await tenantRpc(db,SCHOOL_A,ADMIN_A,'bind_progress_draft',{p_request_id:request,p_submission_id:IDEA_A});
   const file=await tenantRpc(db,SCHOOL_A,ADMIN_A,'reserve_progress_upload',{p_request_id:request,p_name:'Synthetic evidence.webp',p_mime:'image/webp',p_size:100,p_alt:'A synthetic fixture image.'});
   await tenantRpc(db,SCHOOL_A,ADMIN_A,'finalize_progress_upload',{p_file_id:file.id,p_path:file.final_path,p_mime:'image/webp',p_size:100});
   const timestamp=(await db.query<{t:string}>('SELECT updated_at::text t FROM submissions WHERE id=$1',[IDEA_A])).rows[0].t;
   await tenantRpc(db,SCHOOL_A,ADMIN_A,'post_idea_update',{p_submission_id:IDEA_A,p_request_id:request,p_expected_updated_at:timestamp,p_kind:'update',p_body:'Synthetic progress evidence for an isolated security fixture.',p_visibility:visibility,p_percent:null,p_blocked_reason:null,p_next_step:null,p_occurred_on:day,p_notify:false});
   assert.equal((await tenantRpc(db,SCHOOL_A,assigned,'read_authorized_progress_file',{p_file_id:file.id})).length,1);
   assert.deepEqual(await tenantRpc(db,SCHOOL_A,outsider,'read_authorized_progress_file',{p_file_id:file.id}),[]);
   assert.deepEqual(await tenantRpc(db,SCHOOL_B,ADMIN_B,'read_public_progress_file',{p_file_id:file.id}),[]);
   const publicRows=await tenantRpc(db,SCHOOL_A,STUDENT,'read_public_progress_file',{p_file_id:file.id});assert.equal(publicRows.length,visibility==='public'?1:0);
   assert.equal((await tenantRpc(db,SCHOOL_A,ADMIN_A,'read_authorized_progress_file',{p_file_id:file.id})).length,1);
  }
  await db.exec('SET ROLE authenticated');try{await assert.rejects(db.query('SELECT * FROM read_public_progress_file($1)',[randomUUID()]),/permission denied/);}finally{await db.exec('RESET ROLE');}
 }finally{await db.close();}
});
