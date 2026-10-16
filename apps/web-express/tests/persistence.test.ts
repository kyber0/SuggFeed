import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoadmapDb, USER_ID, OTHER_USER_ID, CATEGORY_ID, IDEA_ID, HIDDEN_ID } from './support/roadmap-db';
import { feedFilters,savedSearchFilters } from '../src/lib/feed-filters';
import { digestPreferenceFields,digestConsent,filterDigestEntries,nextDigestWindow } from '../src/lib/digest-preferences';
import { safeRequestPath } from '../src/lib/request-path';
import { receiptTrackingCode,submissionHash } from '../src/lib/submission-context';

test('public filter parsing ignores capabilities, rejects malformed values, and bounds paging',()=>{
  assert.deepEqual(feedFilters({sort:['popular'],category:'Private',search:['secret'],page:'NaN',scope:'admin',trackingCode:'private'}),{sort:'all',category:'All',search:'',scope:'all',page:1});
  assert.equal(feedFilters({page:'999999999',search:' x '.repeat(200)}).page,100000);
  assert.equal(feedFilters({search:'x'.repeat(300)}).search.length,120);
  assert.deepEqual(savedSearchFilters({sort:'popular',category:'Learning',search:' library ',scope:'following',page:'3',authorId:USER_ID}),{sort:'popular',category:'Learning',search:'library',scope:'following'});
});
test('digest pause and selected types are validated without changing omitted legacy fields',()=>{
  assert.deepEqual(digestPreferenceFields({}),{});
  assert.throws(()=>digestPreferenceFields({digest_paused:'true'}));
  assert.throws(()=>digestPreferenceFields({digest_kinds:[]}));
  assert.throws(()=>digestPreferenceFields({digest_kinds:['completed','completed']}));
  assert.throws(()=>digestPreferenceFields({digest_kinds:['private_reply']}));
  assert.equal(digestConsent({weekly_digest:true,digest_paused:true}),false);
  assert.deepEqual(filterDigestEntries([{kind:'completed'},{kind:'update'}],{digest_kinds:['completed']}),[{kind:'completed'}]);
  assert.equal(nextDigestWindow(new Date('2026-10-11T12:00:00Z')),'2026-10-11T16:00:00.000Z');
  assert.equal(nextDigestWindow(new Date('2026-10-11T16:00:00Z')),'2026-10-18T16:00:00.000Z');
});
test('saved searches enforce ten per owner, private access and public-only filter schema',async()=>{
  const db=await createRoadmapDb();
  const filters=JSON.stringify(savedSearchFilters({search:'library'}));
  try {
    for(let i=0;i<10;i++)await db.query('SELECT save_student_search($1,$2,$3::jsonb)',[USER_ID,'Search '+i,filters]);
    await assert.rejects(db.query('SELECT save_student_search($1,$2,$3::jsonb)',[USER_ID,'Eleventh',filters]),/maximum/);
    await assert.rejects(db.query('SELECT save_student_search($1,$2,$3::jsonb)',[OTHER_USER_ID,'Private',JSON.stringify({...JSON.parse(filters),trackingCode:'secret'})]),/Invalid/);
    await db.query('SELECT save_student_search($1,$2,$3::jsonb)',[OTHER_USER_ID,'Other search',filters]);
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[USER_ID]);
    assert.equal((await db.query('SELECT * FROM student_saved_searches')).rows.length,10);
    await assert.rejects(db.query('SELECT save_student_search($1,$2,$3::jsonb)',[USER_ID,'Bypass',filters]),/permission denied/);
    await assert.rejects(db.query("DELETE FROM student_saved_searches WHERE user_id=$1",[OTHER_USER_ID]),/permission denied/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM student_saved_searches'),/permission denied/);
  }finally{await db.close();}
});
test('submission receipts replay once, bind content and owner, and preserve deletion tombstones',async()=>{
  const db=await createRoadmapDb(),id=crypto.randomUUID(),owner=submissionHash('browser-one'),hash=submissionHash('same payload'),tracking=submissionHash('tracking');
  const submit=(actor=owner,operation=id,fingerprint=hash,category=CATEGORY_ID)=>db.query<any>('SELECT create_submission_once($1,$2::uuid,$3,$4,$5,$6::uuid,$7::uuid,$8) AS result',[actor,operation,fingerprint,'A valid new suggestion','A description long enough for a useful school suggestion.',category,null,submissionHash('tracking:'+operation)]);
  try {
    const first=(await submit()).rows[0].result;
    assert.equal(first.replayed,false);
    assert.deepEqual((await submit()).rows[0].result,{id:first.id,replayed:true});
    await assert.rejects(submit(owner,id,submissionHash('changed payload')),/changed content/);
    const receipt=(await db.query<any>('SELECT read_submission_receipt($1,$2::uuid) AS result',[owner,id])).rows[0].result;
    assert.equal(receipt.id,first.id);assert.equal(receipt.is_anonymous,true);
    assert.equal((await db.query<any>('SELECT read_submission_receipt($1,$2::uuid) AS result',[submissionHash('browser-two'),id])).rows[0].result,null);
    const failId=crypto.randomUUID();await assert.rejects(submit(owner,failId,hash,crypto.randomUUID()),/foreign key/);
    assert.equal((await db.query('SELECT * FROM submission_receipts WHERE request_id=$1',[failId])).rows.length,0,'Failed insert rolls back its receipt atomically');
    await db.query('DELETE FROM submissions WHERE id=$1',[first.id]);
    await assert.rejects(submit(),/removed/);
    await assert.rejects(db.query('SELECT read_submission_receipt($1,$2::uuid)',[owner,id]),/removed/);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM submission_receipts'),/permission denied/);
    await assert.rejects(submit(),/permission denied/);
  }finally{await db.close();}
});
test('anonymous recovery code requires the same private device and account context',()=>{
  const id=crypto.randomUUID(),device='a'.repeat(64),actor=submissionHash('account-one');
  const code=receiptTrackingCode(device,actor,id);
  assert.match(code,/^CV-[A-F0-9]{32}$/);
  assert.equal(receiptTrackingCode(device,actor,id.toUpperCase()),code);
  assert.notEqual(receiptTrackingCode('b'.repeat(64),actor,id),code);
  assert.notEqual(receiptTrackingCode(device,submissionHash('account-two'),id),code);
});
test('public status history excludes notes and identities and disappears with publication',async()=>{
  const db=await createRoadmapDb();
  try {
    await db.query("INSERT INTO status_history(submission_id,old_status,new_status,note,changed_by) VALUES($1,'pending','approved','PRIVATE NOTE',$2)",[IDEA_ID,USER_ID]);
    await db.exec('SET ROLE anon');
    const history=(await db.query<any>('SELECT read_public_submission_history($1) AS history',[IDEA_ID])).rows[0].history;
    assert.equal(history.length,1);assert.equal(history[0].new_status,'approved');assert.equal(history[0].old_status,null);
    assert.doesNotMatch(JSON.stringify(history),/PRIVATE NOTE|changed_by|user_id/);
    assert.equal((await db.query<any>('SELECT read_public_submission_history($1) AS history',[HIDDEN_ID])).rows[0].history,null);
    await db.exec('RESET ROLE');await db.query("UPDATE submissions SET status='rejected' WHERE id=$1",[IDEA_ID]);
    await db.exec('SET ROLE anon');
    assert.equal((await db.query<any>('SELECT read_public_submission_history($1) AS history',[IDEA_ID])).rows[0].history,null);
  }finally{await db.close();}
});

test('paused accounts are not claimed and expired receipts cannot create another submission',async()=>{
  const db=await createRoadmapDb(),owner=submissionHash('expiry-owner'),requestId=crypto.randomUUID();
  try {
    await db.query('INSERT INTO notification_preferences(user_id,weekly_digest,digest_paused) VALUES($1,true,true),($2,true,false)',[USER_ID,OTHER_USER_ID]);
    const jobs=await db.query<any>('SELECT * FROM claim_weekly_digests()');assert.equal(jobs.rows.length,1);assert.equal(jobs.rows[0].user_id,OTHER_USER_ID);
    const args=[owner,requestId,submissionHash('payload'),'A valid named suggestion','A useful description of the school improvement.',CATEGORY_ID,USER_ID,null];
    await db.query('SELECT create_submission_once($1,$2::uuid,$3,$4,$5,$6::uuid,$7::uuid,$8)',args);
    await db.query("UPDATE submission_receipts SET created_at=now()-interval '31 days' WHERE request_id=$1",[requestId]);
    await assert.rejects(db.query('SELECT create_submission_once($1,$2::uuid,$3,$4,$5,$6::uuid,$7::uuid,$8)',args),/expired/);
    assert.equal((await db.query('SELECT * FROM submission_receipts WHERE request_id=$1',[requestId])).rows.length,1);
  }finally{await db.close();}
});

test('tracking capabilities and query values are absent from request logs',()=>{
  assert.equal(safeRequestPath('/api/track/CV-'+ 'A'.repeat(32)+'?secret=value'),'/api/track/[redacted]');
  assert.equal(safeRequestPath('/s/school-a/api/track/CV-'+'B'.repeat(32)+'?token=private'),'/s/school-a/api/track/[redacted]');
  assert.equal(safeRequestPath('/schools/invitations/private-invite-token?redirect=private'),'/schools/invitations/[redacted]');
  assert.equal(safeRequestPath('/s/school-a/digest/unsubscribe?token=private-capability'),'/s/school-a/digest/unsubscribe');
  assert.equal(safeRequestPath('/feed?search=private'),'/feed');
});
