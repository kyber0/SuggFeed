import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { invitationHash, invitationToken, schoolApplicationsConfigured, allowSchoolApplication } from '../src/lib/school-onboarding';
const ids=Array.from({length:6},(_,i)=>`20000000-0000-4000-8000-00000000000${i+1}`);
const [op,a,b,student,other,unverified]=ids;
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text NOT NULL);`);
 for(const [i,id] of ids.entries()){
  await db.query('INSERT INTO auth.users VALUES($1,$2,$3)',[id,`user${i+1}@school.example`,id===unverified?null:new Date().toISOString()]);
  await db.query("INSERT INTO profiles VALUES($1,'admin')",[id]);
 }
 for(const file of ['202610160001_school_registry.sql','202610160003_school_onboarding.sql','202610180001_school_invitations.sql']) await db.exec(readFileSync(path.resolve(__dirname,'../../../supabase/migrations',file),'utf8'));
 await db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[op]);return db;
}
async function service<T=Record<string,unknown>>(db:PGlite,sql:string,args:unknown[]=[]){await db.exec('SET ROLE service_role');try{return(await db.query<T>(sql,args)).rows;}finally{await db.exec('RESET ROLE');}}
async function application(db:PGlite,actor:string,slug:string){return(await service<{id:string}>(db,'SELECT apply_to_school($1,$2,$3,$4,$5) id',[actor,slug,'School '+slug,'Authorized representative','Institution authority verified through institutional documentation.']))[0].id;}
async function approve(db:PGlite,id:string){return(await service<{id:string}>(db,"SELECT review_school_application($1,$2,'approved','Authority and agreement review #100') id",[id,op]))[0].id;}
const settings={privacy_notice:'Reviewed institutional privacy purposes and lawful grounds.',terms_notice:'Reviewed institutional terms and applicable school rules.',privacy_contact:'privacy@school.example',school_contact:'school@school.example',age_policy:'School eligibility and guardian requirements reviewed.',publication_policy:'private',retention_days:365};
async function save(db:PGlite,school:string,actor:string,version=1,values=settings){return service(db,'SELECT update_school_settings($1,$2,$3,$4::jsonb)',[school,actor,version,JSON.stringify(values)]);}
async function issue(db:PGlite,school:string,actor:string,email:string){const token=invitationToken();await service(db,"SELECT issue_school_invitation($1,$2,$3,$4,'student')",[school,actor,invitationHash(token),email]);return token;}
async function accept(db:PGlite,actor:string,token:string){return service(db,'SELECT accept_school_invitation($1,$2)',[actor,invitationHash(token)]);}

test('onboarding verifies email, bounds shared application abuse, and never activates on approval',async()=>{
 const db=await fixture();try{
  await assert.rejects(application(db,unverified,'no-email'),/Verified email/);
  const app=await application(db,a,'school-a');
  await assert.rejects(service(db,"SELECT review_school_application($1,$2,'approved','forged global admin')",[app,a]),/Platform operator/);
  const school=await approve(db,app);
  assert.equal((await db.query<{status:string}>('SELECT status FROM schools WHERE id=$1',[school])).rows[0].status,'pending');
  assert.equal((await db.query<{role:string}>('SELECT role FROM school_memberships WHERE school_id=$1 AND user_id=$2',[school,a])).rows[0].role,'admin');
  await assert.rejects(service(db,"SELECT change_school_status($1,$2,'active')",[school,op]),/activation is locked/);
  await assert.rejects(approve(db,app),/Pending application/);
  await application(db,a,'school-a-two');await application(db,a,'school-a-three');
  await assert.rejects(application(db,a,'school-a-four'),/limit reached/);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT * FROM school_applications'),/permission denied/);
  await assert.rejects(db.query('SELECT apply_to_school($1,$2,$3,$4,$5)',[a,'forged','Forged','Name','Authority statement here']),/permission denied/);
  await db.exec('RESET ROLE');
 }finally{await db.close();}
});

test('settings enforce A/B membership, optimistic versioning, history and renewed policy review',async()=>{
 const db=await fixture();try{
  const schoolA=await approve(db,await application(db,a,'school-a')),schoolB=await approve(db,await application(db,b,'school-b'));
  await assert.rejects(save(db,schoolB,a),/School admin/);await assert.rejects(save(db,schoolA,other),/School admin/);
  await save(db,schoolA,a);await assert.rejects(save(db,schoolA,a),/Settings changed/);
  await assert.rejects(service(db,'SELECT approve_school_settings($1,$2,2,$3)',[schoolA,a,'Forged policy review']),/Platform operator/);
  await service(db,'SELECT approve_school_settings($1,$2,2,$3)',[schoolA,op,'Legal and institutional policy review #101']);
  assert.ok((await db.query<{approved_at:string}>('SELECT approved_at FROM school_settings WHERE school_id=$1',[schoolA])).rows[0].approved_at);
  await save(db,schoolA,a,2,{...settings,publication_policy:'public'});
  const current=(await db.query<{version:number,approved_at:null}>('SELECT version,approved_at FROM school_settings WHERE school_id=$1',[schoolA])).rows[0];
  assert.equal(current.version,3);assert.equal(current.approved_at,null);
  assert.equal((await db.query('SELECT * FROM school_settings_versions WHERE school_id=$1',[schoolA])).rows.length,2);
  assert.equal((await db.query<{publication_policy:string}>('SELECT publication_policy FROM school_settings WHERE school_id=$1',[schoolB])).rows[0].publication_policy,'private');
 }finally{await db.close();}
});

test('hashed invitations bind confirmed email and live inviter authority, reject expiry and replay',async()=>{
 const db=await fixture();try{
  const schoolA=await approve(db,await application(db,a,'school-a')),schoolB=await approve(db,await application(db,b,'school-b'));
  await assert.rejects(issue(db,schoolA,a,'user4@school.example'),/School admin/);
  await db.exec('UPDATE school_release_gate SET isolation_verified=true');
  await assert.rejects(service(db,"SELECT change_school_status($1,$2,'active')",[schoolA,op]),/Reviewed school policies/);
  for(const [school,actor] of [[schoolA,a],[schoolB,b]]) {
   await save(db,school,actor);await service(db,'SELECT approve_school_settings($1,$2,2,$3)',[school,op,'Actual institutional policy review #101']);
   await service(db,"SELECT change_school_status($1,$2,'active')",[school,op]);
  }
  await assert.rejects(issue(db,schoolB,a,'user4@school.example'),/School admin/);
  const token=await issue(db,schoolA,a,'USER4@school.example');
  const row=(await db.query<{token_hash:string}>('SELECT token_hash FROM school_invitations WHERE school_id=$1',[schoolA])).rows[0];
  assert.equal(row.token_hash,invitationHash(token));assert.notEqual(row.token_hash,token);
  await assert.rejects(accept(db,other,token),/unavailable/);await assert.rejects(accept(db,unverified,token),/Verified email/);
  await accept(db,student,token);await assert.rejects(accept(db,student,token),/unavailable/);
  assert.equal((await db.query('SELECT * FROM school_memberships WHERE school_id=$1 AND user_id=$2',[schoolB,student])).rows.length,0);
  const expired=await issue(db,schoolA,a,'user5@school.example');
  await db.query("UPDATE school_invitations SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[invitationHash(expired)]);
  await assert.rejects(accept(db,other,expired),/unavailable/);
  const revoked=await issue(db,schoolA,a,'user5@school.example');
  await service(db,"SELECT change_school_membership($1,$2,$3,'admin','active')",[schoolA,op,b]);
  await service(db,"SELECT change_school_membership($1,$2,$3,'admin','revoked')",[schoolA,op,a]);
  await assert.rejects(accept(db,other,revoked),/Inviter no longer authorized/);
  await db.exec('SET ROLE service_role');await assert.rejects(db.query('SELECT * FROM school_invitations'),/permission denied/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});

test('application configuration and instance IP limits fail closed',()=>{
 assert.equal(schoolApplicationsConfigured({}),false);
 assert.equal(schoolApplicationsConfigured({PLATFORM_OPERATOR_NAME:'Business',PRIVACY_CONTACT_EMAIL:'invalid'}),false);
 assert.equal(schoolApplicationsConfigured({PLATFORM_OPERATOR_NAME:'Business',PRIVACY_CONTACT_EMAIL:'privacy@example.com'}),true);
 const ip=invitationToken();for(let i=0;i<5;i++)assert.equal(allowSchoolApplication(ip,1000),true);
 assert.equal(allowSchoolApplication(ip,1000),false);assert.equal(allowSchoolApplication(ip,3601000),true);
});

test('complete historical migration chain supports pending onboarding, reviewed activation and school defaults',async()=>{
 const {createTenantDb}=await import('./support/tenant-db');
 const db=await createTenantDb({through:'202610160003_school_onboarding.sql',seed:false});
 try{
  // Supabase Auth owns this column in deployment; the generic local fixture models only its older subset.
  await db.exec('ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz');
  for(const [id,email] of [[op,'operator@example.test'],[a,'school-admin@example.test']]) await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[id,email]);
  await db.query('INSERT INTO platform_operators(user_id) VALUES($1)',[op]);
  const school=await approve(db,await application(db,a,'chain-school'));
  assert.equal((await db.query<{status:string}>('SELECT status FROM schools WHERE id=$1',[school])).rows[0].status,'pending');
  assert.ok((await db.query('SELECT * FROM categories WHERE school_id=$1',[school])).rows.length>0);
  await save(db,school,a);await service(db,'SELECT approve_school_settings($1,$2,2,$3)',[school,op,'Institutional policy review #chain']);
  await assert.rejects(service(db,"SELECT change_school_status($1,$2,'active')",[school,op]),/activation is locked/);
  await db.exec('UPDATE school_release_gate SET isolation_verified=true');
  await service(db,"SELECT change_school_status($1,$2,'active')",[school,op]);
  assert.equal((await db.query<{status:string}>('SELECT status FROM schools WHERE id=$1',[school])).rows[0].status,'active');
 }finally{await db.close();}
});

test('invitation management scopes history, blocks duplicates, hides tokens, and enforces revocation',async()=>{
 const db=await fixture();try{
  const school=await approve(db,await application(db,a,'managed-invitations'));
  await save(db,school,a);await service(db,"SELECT approve_school_settings($1,$2,2,'Synthetic reviewed settings')",[school,op]);
  await db.exec('UPDATE school_release_gate SET isolation_verified=true');await service(db,"SELECT change_school_status($1,$2,'active')",[school,op]);
  const token=invitationToken();
  const create=()=>service<any>(db,"SELECT create_school_member_invitation($1,$2,$3,$4,'moderator','email') result",[school,a,invitationHash(token),'user4@school.example']);
  const result=(await create())[0].result;
  await assert.rejects(create(),/pending invitation already exists/);
  await assert.rejects(service(db,"SELECT list_school_member_invitations($1,$2)",[school,b]),/administrator required/);
  let list=(await service<any>(db,'SELECT list_school_member_invitations($1,$2) result',[school,a]))[0].result;
  assert.equal(list.length,1);assert.equal(list[0].delivery_state,'sending');assert.equal(list[0].token_hash,undefined);
  await service(db,"SELECT record_school_invitation_delivery($1,$2,$3,'sent')",[school,a,result.id]);
  const preview=(await service<any>(db,'SELECT school_invitation_preview($1,$2) result',[invitationHash(token),student]))[0].result;
  assert.equal(preview.email_matches,true);assert.equal(preview.role,'moderator');assert.equal(preview.recipient,'u•••@school.example');assert.equal(preview.email,undefined);
  await assert.rejects(service(db,'SELECT revoke_school_member_invitation($1,$2,$3)',[school,b,result.id]),/administrator required/);
  await service(db,'SELECT revoke_school_member_invitation($1,$2,$3)',[school,a,result.id]);
  await assert.rejects(accept(db,student,token),/Invitation unavailable/);
  const revoked=(await service<any>(db,'SELECT school_invitation_preview($1,$2) result',[invitationHash(token),student]))[0].result;
  assert.equal(revoked.state,'revoked');
  const fresh=invitationToken();await service(db,"SELECT create_school_member_invitation($1,$2,$3,$4,'student','link')",[school,a,invitationHash(fresh),'user4@school.example']);
  await accept(db,student,fresh);
  const joined=(await service<any>(db,'SELECT school_invitation_preview($1,$2) result',[invitationHash(fresh),student]))[0].result;assert.equal(joined.can_enter,true);
  await db.query("UPDATE school_memberships SET role='admin' WHERE school_id=$1 AND user_id=$2",[school,student]);
  assert.equal((await service<any>(db,'SELECT school_invitation_preview($1,$2) result',[invitationHash(fresh),student]))[0].result.role,'admin');
  await assert.rejects(service(db,"SELECT create_school_member_invitation($1,$2,$3,$4,'admin','link')",[school,a,invitationHash(invitationToken()),'user4@school.example']),/already a school member/);
  await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT school_invitation_preview($1,$2)',[invitationHash(token),student]),/permission denied/);await db.exec('RESET ROLE');
 }finally{await db.close();}
});
