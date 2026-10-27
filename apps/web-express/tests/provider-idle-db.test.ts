import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safetyDb} from './support/submission-safety-db';
import {STUDENT,ADMIN_A} from './support/tenant-db';
import {providerKey} from '../src/lib/session-idle-store';

test('provider idle state survives cookie loss, cannot revive on refresh, and is server-only',async()=>{
 const db=await safetyDb(true),key='a'.repeat(64),fresh='b'.repeat(64);
 const action=async(id:string,kind:string,actor=STUDENT)=>{await db.exec('SET ROLE service_role');try{return(await db.query<{value:any}>('SELECT web_session_idle($1,$2,$3) value',[id,actor,kind])).rows[0].value;}finally{await db.exec('RESET ROLE');}};
 try{
  assert.equal((await action('c'.repeat(64),'check','00000000-0000-4000-8000-000000000099')).allowed,false,'deleted identities cannot recreate a session guard');
  const first=await action(key,'check');assert.equal(first.allowed,true);await assert.rejects(action(key,'check',ADMIN_A),/owner mismatch/);assert.equal(first.expiresAt-first.lastActivityAt,1800000);
  await db.query("UPDATE provider_idle_sessions SET last_activity_at=clock_timestamp()-interval '29 minutes' WHERE id=$1",[key]);
  const near=await action(key,'check');assert.ok(near.expiresAt-near.serverNow<61000,'checks must not refresh activity');
  assert.ok((await action(key,'activity')).expiresAt-near.serverNow>1700000);
  await db.query("UPDATE provider_idle_sessions SET last_activity_at=clock_timestamp()-interval '31 minutes' WHERE id=$1",[key]);
  assert.equal((await action(key,'check')).allowed,false);
  assert.equal((await action(key,'activity')).allowed,false);assert.equal((await action(key,'check')).allowed,false,'a new cookie cannot reset the provider record');
  assert.equal((await action(fresh,'check')).allowed,true);assert.equal((await action(fresh,'revoke')).allowed,false);assert.equal((await action(fresh,'activity')).allowed,false);
  await db.exec('SET ROLE service_role');try{await assert.rejects(db.query('SELECT * FROM provider_idle_sessions'),/permission denied/);}finally{await db.exec('RESET ROLE');}
  for(const role of ['anon','authenticated','tenant_executor']){await db.exec('SET ROLE '+role);try{await assert.rejects(db.query('SELECT web_session_idle($1,$2,$3)',[key,STUDENT,'check']),/permission denied/);}finally{await db.exec('RESET ROLE');}}
 }finally{await db.close();}
});
test('provider fingerprints follow the verified session ID rather than a refreshed token',()=>{
 const session='00000000-0000-4000-8000-000000000001';const token=(extra:any)=>'header.'+Buffer.from(JSON.stringify({session_id:session,...extra})).toString('base64url')+'.signature';
 assert.equal(providerKey(token({iat:1}),'owner'),providerKey(token({iat:2}),'owner'));
 assert.notEqual(providerKey(token({iat:1}),'owner'),providerKey(token({iat:1}),'other-owner'));
 for(const value of ['', 'invalid','a.'+Buffer.from('{"session_id":[]}').toString('base64url')+'.b'])assert.equal(providerKey(value,'owner'),null);
});
