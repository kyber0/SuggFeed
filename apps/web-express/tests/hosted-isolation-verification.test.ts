import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createTenantDb} from './support/tenant-db';

test('the hosted isolation probe passes locally and rolls back every synthetic row and gate change',async()=>{
 const db=await createTenantDb({through:'202610170001_school_release_evidence.sql',seed:false});
 try{
  const before=await db.query('SELECT count(*)::int n FROM auth.users');
  const sql=readFileSync(path.resolve(__dirname,'../../../supabase/verification/hosted_tenant_isolation.sql'),'utf8');
  const results=await db.exec(sql);
  const result=results.flatMap(r=>r.rows).find((r:any)=>r.verification) as any;
  assert.equal(result.verification.all_passed,true);assert.equal(result.verification.checks.length,21);
  assert.equal(result.verification.checks.find((check:any)=>check.name==='gateway_restores_scope_after_success')?.passed,true);
  assert.equal(result.verification.checks.find((check:any)=>check.name==='gateway_restores_scope_after_failure')?.passed,true);
  assert.deepEqual((await db.query('SELECT count(*)::int n FROM auth.users')).rows,before.rows);
  assert.equal((await db.query<any>('SELECT isolation_verified FROM school_release_gate')).rows[0].isolation_verified,false);
 }finally{await db.close();}
});

test('release evidence is required and application roles cannot sign off their own isolation',async()=>{
 const db=await createTenantDb({through:'202610170001_school_release_evidence.sql',seed:false});
 try{
  const actor='10000000-0000-4000-8000-000000000099';
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'release-reviewer@example.invalid')",[actor]);
  await db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[actor]);
  await assert.rejects(db.exec('UPDATE school_release_gate SET isolation_verified=true'),/school_release_evidence_required/);
  await db.exec('SET ROLE service_role');
  await assert.rejects(db.exec('UPDATE school_release_gate SET isolation_verified=true'),/permission denied/);
  await assert.rejects(db.query('SELECT school_release_status($1)',['10000000-0000-4000-8000-000000000098']),/Platform operator required/);
  const result=await db.query<any>('SELECT school_release_status($1) status',[actor]);assert.equal(result.rows[0].status.isolation_verified,false);
  await db.exec('RESET ROLE');
  await db.query("UPDATE school_release_gate SET isolation_verified=true,verified_at=now(),verified_by=$1,verification_reference='Synthetic local release verification'",[actor]);
  assert.equal((await db.query<any>('SELECT isolation_verified FROM school_release_gate')).rows[0].isolation_verified,true);
 }finally{await db.close();}
});
