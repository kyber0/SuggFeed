import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTenantDb,DEMO_SCHOOL} from './support/tenant-db';

test('full migration chain versions public caches, preserves rows and restricts maintenance',async()=>{
 const db=await createTenantDb({through:'202610200001_security_remediation.sql',seed:false});
 try {
  const presentation=async()=>String((await db.query<{p:any}>("SELECT school_presentation('demo') p")).rows[0].p.content_revision);
  const before=await presentation();
  const category=(await db.query<{id:string}>('SELECT id FROM categories WHERE school_id=$1 LIMIT 1',[DEMO_SCHOOL])).rows[0].id;
  await db.query('UPDATE categories SET description=$1 WHERE id=$2',['Changed by a different application instance',category]);
  assert.notEqual(await presentation(),before);
  const saved=await presentation();
  await db.exec('BEGIN');await db.query('UPDATE categories SET description=$1 WHERE id=$2',['Uncommitted edit',category]);await db.exec('ROLLBACK');
  assert.equal(await presentation(),saved,'a rolled-back mutation cannot publish a new generation');
  await db.exec("INSERT INTO web_sessions VALUES('expired-a','encrypted',now()-interval '1 day'),('expired-b','encrypted',now()-interval '1 day'),('live','encrypted',now()+interval '1 day')");
  const first=(await db.query<{p:any}>('SELECT purge_expired_web_sessions(1) p')).rows[0].p;
  assert.equal(first.removed,1);assert.equal(first.more,true);
  const second=(await db.query<{p:any}>('SELECT purge_expired_web_sessions(1000) p')).rows[0].p;
  assert.equal(second.removed,1);assert.equal(second.more,false);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM web_sessions')).rows[0].n,1);
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   try{await assert.rejects(db.query('SELECT purge_expired_web_sessions(1)'),/permission denied/);await assert.rejects(db.query('SELECT school_retention_inventory()'),/permission denied/);}finally{await db.exec('RESET ROLE');}
  }
  const acl=(await db.query<{trigger:boolean;membership:boolean}>("SELECT has_function_privilege('anon','handle_new_user()','EXECUTE') trigger,has_function_privilege('authenticated','school_is_member(uuid)','EXECUTE') membership")).rows[0];
  assert.equal(acl.trigger,false);assert.equal(acl.membership,true);
  const request='90000000-0000-4000-8000-000000000001';
  await db.query('INSERT INTO idea_update_drafts(request_id,school_id) VALUES($1,$2)',[request,DEMO_SCHOOL]);
  await assert.rejects(db.query("INSERT INTO idea_update_uploads(request_id,school_id,display_name,declared_mime,declared_size,temp_path) VALUES($1,$2,'document.pdf','application/pdf',100,'synthetic-source')",[request,DEMO_SCHOOL]),/PDF evidence is paused/);
  const files=(await db.query<{n:number}>('SELECT count(*)::int n FROM idea_update_uploads')).rows[0].n;
  assert.equal(files,0,'a stale or bypassed application cannot reserve an unscanned PDF');
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM auth.users')).rows[0].n,0,'no accounts created or deleted');
  await db.exec('BEGIN');
  const account='90000000-0000-4000-8000-000000000002';
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[account,'synthetic@example.invalid']);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int n FROM profiles WHERE id=$1',[account])).rows[0].n,1,'Auth profile trigger still executes after client grants are removed');
  await db.exec('ROLLBACK');
 }finally{await db.close();}
});
