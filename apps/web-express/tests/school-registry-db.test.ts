import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const operator='10000000-0000-4000-8000-000000000001';
const adminA='10000000-0000-4000-8000-000000000002';
const adminB='10000000-0000-4000-8000-000000000003';
const student='10000000-0000-4000-8000-000000000004';
async function fixture() {
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
   CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text NOT NULL);`);
  for(const id of [operator,adminA,adminB,student]) {
   await db.query('INSERT INTO auth.users VALUES($1)',[id]);
   // Even a legacy global admin must not acquire school/platform privileges.
   await db.query("INSERT INTO profiles VALUES($1,'admin')",[id]);
  }
  await db.exec(readFileSync(path.resolve(__dirname,'../../../supabase/migrations/202610160001_school_registry.sql'),'utf8'));
  await db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[operator]);
  return db;
 } catch(e) { await db.close();throw e; }
}
async function asService<T>(db:PGlite,sql:string,args:unknown[]=[]) {
 await db.exec('SET ROLE service_role');
 try{return (await db.query<T>(sql,args)).rows;}finally{await db.exec('RESET ROLE');}
}
async function createSchool(db:PGlite,slug:string) {
 return (await asService<{id:string}>(db,'SELECT create_pending_school($1,$2,$3) AS id',[operator,slug,'School '+slug]))[0].id;
}
async function member(db:PGlite,school:string,actor:string,target:string,role='admin',status='active') {
 return asService(db,'SELECT change_school_membership($1,$2,$3,$4,$5)',[school,actor,target,role,status]);
}

test('school registry fails closed: no self-provisioning, global role inheritance or premature activation',async()=>{
 const db=await fixture();
 try {
  await assert.rejects(asService(db,'SELECT create_pending_school($1,$2,$3)',[student,'unapproved','Unapproved School']),/Platform operator required/);
  const a=await createSchool(db,'school-a');
  await assert.rejects(createSchool(db,'school-a'),/duplicate key/);
  await assert.rejects(createSchool(db,'Bad Slug'),/Invalid school/);
  await member(db,a,operator,adminA);
  await assert.rejects(asService(db,'SELECT change_school_status($1,$2,$3)',[a,adminA,'active']),/Platform operator required/);
  await assert.rejects(asService(db,'SELECT change_school_status($1,$2,$3)',[a,operator,'active']),/School activation is locked/);
  await db.exec('SET ROLE service_role');
  await assert.rejects(db.query('UPDATE school_release_gate SET isolation_verified=true'),/permission denied/);
  await assert.rejects(db.query("UPDATE schools SET status='active'"),/permission denied/);
  await assert.rejects(db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[student]),/permission denied/);
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminA]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM schools')).rows.length,1,'Own pending school is visible, never grants active access');
  assert.equal((await db.query<{allowed:boolean}>('SELECT school_has_role($1,ARRAY[\'admin\']) AS allowed',[a])).rows[0].allowed,false);
  await assert.rejects(db.query('SELECT create_pending_school($1,$2,$3)',[operator,'forged','Forged School']),/permission denied/);
  await assert.rejects(db.query('UPDATE school_memberships SET role=\'admin\''),/permission denied/);
  await db.exec('RESET ROLE');
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT * FROM schools'),/permission denied/);
 }finally{await db.close();}
});

test('two-school membership policy prevents cross-school access, protects last admin and respects revocation',async()=>{
 const db=await fixture();
 try {
  const a=await createSchool(db,'school-a'),b=await createSchool(db,'school-b');
  await member(db,a,operator,adminA);await member(db,b,operator,adminB);
  // Simulate the future reviewed cutover only in this disposable database.
  await db.exec('UPDATE school_release_gate SET isolation_verified=true');
  await asService(db,'SELECT change_school_status($1,$2,$3)',[a,operator,'active']);
  await asService(db,'SELECT change_school_status($1,$2,$3)',[b,operator,'active']);
  await member(db,a,adminA,student,'student');
  await assert.rejects(member(db,b,adminA,student),/School admin required/);
  await assert.rejects(member(db,a,adminA,adminA,'student'),/last active administrator/);
  await assert.rejects(member(db,a,operator,adminA,'admin','revoked'),/last active administrator/);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[adminA]);
  await db.exec('SET ROLE authenticated');
  const schools=await db.query<{id:string}>('SELECT id FROM schools');
  assert.deepEqual(schools.rows.map(x=>x.id),[a]);
  assert.equal((await db.query('SELECT * FROM school_memberships WHERE school_id=$1',[b])).rows.length,0);
  assert.equal((await db.query('SELECT * FROM school_memberships WHERE school_id=$1',[a])).rows.length,2);
  await db.exec('RESET ROLE');
  await member(db,a,adminA,student,'moderator','revoked');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[student]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM schools')).rows.length,0);
  assert.equal((await db.query<{allowed:boolean}>('SELECT school_has_role($1,ARRAY[\'moderator\']) AS allowed',[a])).rows[0].allowed,false);
  await db.exec('RESET ROLE');
  await asService(db,'SELECT change_school_status($1,$2,$3)',[a,operator,'suspended']);
  await assert.rejects(member(db,a,adminA,student),/School admin required/);
  assert.ok((await db.query<{n:number}>('SELECT count(*)::int AS n FROM school_registry_events')).rows[0].n>=8);
 }finally{await db.close();}
});

test('registry migration preserves the existing demo workflows and grants no operator automatically',async()=>{
 const {createRoadmapDb}=await import('./support/roadmap-db');
 const db=await createRoadmapDb();
 try {
  const before=await db.query('SELECT id,status,user_id,title FROM submissions ORDER BY id');
  const roles=await db.query('SELECT id,role FROM profiles ORDER BY id');
  await db.exec(readFileSync(path.resolve(__dirname,'../../../supabase/migrations/202610160001_school_registry.sql'),'utf8'));
  assert.deepEqual((await db.query('SELECT id,status,user_id,title FROM submissions ORDER BY id')).rows,before.rows);
  assert.deepEqual((await db.query('SELECT id,role FROM profiles ORDER BY id')).rows,roles.rows);
  assert.equal((await db.query('SELECT * FROM platform_operators')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM schools')).rows.length,0);
  assert.equal((await db.query<{isolation_verified:boolean}>('SELECT isolation_verified FROM school_release_gate')).rows[0].isolation_verified,false);
 }finally{await db.close();}
});
