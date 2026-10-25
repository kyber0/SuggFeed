import test from 'node:test';
import assert from 'node:assert/strict';
import {safetyDb} from './support/submission-safety-db';
import {SCHOOL_A as school,SCHOOL_B,ADMIN_A as admin,ADMIN_B,STUDENT,CATEGORY_A as category,IDEA_A,tenantRpc} from './support/tenant-db';
const mod1='11000000-0000-4000-8000-000000000001',mod2='11000000-0000-4000-8000-000000000002',backup='11000000-0000-4000-8000-000000000003',team='12000000-0000-4000-8000-000000000001';
const sla=(n:number)=>({ackMinutes:n,resolveMinutes:n*10,remindAfterMinutes:n,supervisorAfterMinutes:n*2,reassignAfterMinutes:n*3});
test('assignment database: routing, capacity, availability, urgent fallback, reports, audit, escalation and permissions',async()=>{
 const db=await safetyDb();
 const action=async(actor:string,name:string,data:Record<string,unknown>={})=>{await db.exec('SET ROLE service_role');try{return(await db.query<{value:any}>('SELECT assignment_action($1,$2,$3,$4::jsonb) value',[school,actor,name,JSON.stringify(data)])).rows[0].value;}finally{await db.exec('RESET ROLE');}};
 let sequence=10;
 const idea=async(urgent=false,cat=category)=>{const id='13000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');await db.query("SELECT set_config('suggfeed.safety_write','create',false),set_config('suggfeed.safety_verdict',$1,false)",[JSON.stringify({state:'clear',urgent})]);await db.query("INSERT INTO submissions(id,school_id,title,description,category_id,user_id,status) VALUES($1,$2,'A synthetic routing fixture','This is synthetic assignment test content, not school data.',$3,$4,'pending')",[id,school,cat,STUDENT]);await db.exec("SELECT set_config('suggfeed.safety_write','',false),set_config('suggfeed.safety_verdict','',false)");return id;};
 const record=async(id:string,kind='suggestion')=>(await db.query<any>('SELECT * FROM assignment_records WHERE school_id=$1 AND item_kind=$2 AND item_id=$3',[school,kind,id])).rows[0];
 try{
 for(const [id,name,role] of [[mod1,'Fixture One','moderator'],[mod2,'Fixture Two','moderator'],[backup,'Fixture Backup','admin']]){await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,id+'@example.invalid']);await db.query('UPDATE profiles SET display_name=$2 WHERE id=$1',[id,name]);await db.query('INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,$3)',[school,id,role]);}
 await action(admin,'team',{id:team,name:'Synthetic test team',supervisor:admin,backup,active:true});
 for(const userId of [mod1,mod2])await action(admin,'assignee',{userId,active:true,notifications:true,maxOpen:2,teams:[team]});
 await action(admin,'rule',{id:'14000000-0000-4000-8000-000000000001',kind:'suggestion',category,team,order:1,active:true});
 const config={revision:0,enabled:true,maxOpen:2,intervalMinutes:1,urgentTeam:team,autoReassignAway:false,autoReassignOverdue:false,slas:{low:sla(120),normal:sla(60),high:sla(30),urgent:sla(1)}};
 await action(admin,'settings',config);
 const first=await idea(),second=await idea();const a=await record(first),b=await record(second);assert.equal(a.assignment_reason,'rule');assert.notEqual(a.assignee_id,b.assignee_id,'least-loaded staff receive different items');
 await db.query('UPDATE assignment_assignees SET last_assigned_at=CASE WHEN user_id=$2 THEN now()-interval \'1 day\' ELSE now() END WHERE school_id=$1',[school,a.assignee_id]);
 const third=await idea();assert.equal((await record(third)).assignee_id,a.assignee_id,'oldest assignment breaks an equal-load tie');
 await idea();const overflow=await idea();assert.equal((await record(overflow)).assignment_reason,'triage','capacity cap routes to triage');
 const repeated=(await db.query<any>('SELECT assignment_allocate($1,\'suggestion\',$2) value',[school,first])).rows[0].value;assert.equal(repeated.alreadyAssigned,true);
 const outsider='11000000-0000-4000-8000-000000000004';await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[outsider,'outsider@example.invalid']);await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'moderator')",[school,outsider]);
 await assert.rejects(tenantRpc(db,school,outsider,'staff_workflow_context',{p_submission_id:first,p_actor_id:outsider}),/not found|unavailable|access/i);
 await assert.doesNotReject(tenantRpc(db,school,outsider,'read_public_idea_updates',{p_submission_id:IDEA_A}));
 await assert.rejects(action(outsider,'history',{kind:'suggestion',id:first}),/outside your assigned/);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.exec('SELECT * FROM assignment_events'),/permission denied/);await assert.rejects(db.query("SELECT assignment_action($1,$2,'state','{}')",[school,STUDENT]),/permission denied/);await db.exec('RESET ROLE');
 const before=await record(first);await action(a.assignee_id,'acknowledge',{kind:'suggestion',id:first});const ack=await record(first);assert.ok(ack.acknowledged_at);assert.equal((await action(a.assignee_id,'acknowledge',{kind:'suggestion',id:first})).alreadyAcknowledged,true);assert.equal(ack.assignment_version,before.assignment_version);
 await action(a.assignee_id,'availability',{away:true});assert.equal((await record(first)).assignee_id,a.assignee_id,'away flags existing work instead of moving it');
 await action(admin,'assignee',{userId:b.assignee_id,active:false,notifications:true,maxOpen:2,teams:[team]});
 const away=await idea();assert.equal((await record(away)).assignee_id,null,'inactive/away members skipped');
 const cat2='15000000-0000-4000-8000-000000000001';await db.query("INSERT INTO categories(id,school_id,name,slug) VALUES($1,$2,'Synthetic unmatched','synthetic-unmatched')",[cat2,school]);const unmatched=await idea(false,cat2);assert.equal((await record(unmatched)).assignment_reason,'triage');
 await action(admin,'preferences',{notifications:false});
 const urgent=await idea(true);const u=await record(urgent);assert.ok([admin,backup].includes(u.assignee_id));assert.equal(u.assignment_reason,'urgent-override');assert.equal(u.assignment_sla.ackMinutes,1,'safety-urgent suggestions use the urgent SLA even without a workflow priority');assert.ok((await db.query<any>('SELECT count(*) n FROM assignment_notifications WHERE item_id=$1 AND urgent',[urgent])).rows[0].n>=2,'urgent notifies supervisor and backup');
 const report='16000000-0000-4000-8000-000000000001';await db.query('INSERT INTO reports(id,school_id,user_id,submission_id,reason) VALUES($1,$2,$3,$4,\'Synthetic safety report\')',[report,school,STUDENT,IDEA_A]);
 await assert.rejects(action(mod1,'history',{kind:'report',id:report}),/outside your assigned/);await assert.rejects(action(STUDENT,'state'),/staff membership/);await assert.rejects(action(mod1,'state'),/administrator/);await assert.rejects(action(ADMIN_B,'state'),/staff membership/);
 await action(admin,'assign',{kind:'suggestion',id:overflow,version:(await record(overflow)).assignment_version,person:mod1,team,note:'Synthetic manual reassignment'});assert.equal((await record(overflow)).assignee_id,mod1);
 await assert.rejects(action(mod1,'assign',{kind:'suggestion',id:overflow,person:mod2,version:1,note:'Not authorized'}),/administrator/);
 const teamOnly=await record(away);await action(admin,'assign',{kind:'suggestion',id:away,version:teamOnly.assignment_version,team,person:null,note:'Synthetic team-owned work'});await action(a.assignee_id,'acknowledge',{kind:'suggestion',id:away});assert.ok((await record(away)).acknowledged_at);assert.equal((await record(away)).assignee_id,null,'team acknowledgement does not grant reassignment powers');
 const own=await action(mod1,'list',{view:'all'});assert.ok(own.items.every((r:any)=>r.item_kind==='suggestion'));assert.ok(!(await action(mod1,'notifications')).items.some((n:any)=>n.item_kind==='report'));
 await assert.rejects(tenantRpc(db,school,mod1,'community_action',{p_actor:mod1,p_action:'bulk_assign',p_data:{items:[]}}),/audited Assignment/);
 await db.exec('SET ROLE service_role');await assert.rejects(db.exec('UPDATE assignment_events SET reason=\'tampered\''),/permission denied|immutable|append.only/i);await db.exec('RESET ROLE');
 await assert.rejects(db.exec('DELETE FROM assignment_events'),/append.only|immutable/i);
 // A forced internal assignment error must not roll back the incoming idea.

 // Exercise the allocator's error fallback by rejecting allocation writes, then verify the item survives.
 await db.exec("CREATE FUNCTION fixture_workflow_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic allocation failure';END$$;CREATE TRIGGER zz_fixture_workflow_failure BEFORE INSERT ON submission_workflow FOR EACH ROW EXECUTE FUNCTION fixture_workflow_failure()");
 const failed=await idea();assert.ok(await record(failed));await db.exec('DROP TRIGGER zz_fixture_workflow_failure ON submission_workflow');
 await action(admin,'rule',{kind:'report',team,order:1,active:true});
 for(const userId of [admin,backup])await action(admin,'assignee',{userId,active:true,notifications:true,maxOpen:2,teams:[team]});
 // Use test-only deadlines; no production SLA values are seeded by the migration.
 await db.query("UPDATE report_assignments SET assignee_id=$2,assigned_at=now()-interval '10 hours',ack_due_at=now()-interval '5 minutes',due_at=now()+interval '1 hour',next_action_at=now()-interval '5 minutes',assignment_sla=$3::jsonb WHERE report_id=$1",[report,admin,JSON.stringify(sla(1))]);
 await db.query('UPDATE assignment_settings SET slas=jsonb_set(slas,\'{normal}\',$2::jsonb),last_run_at=NULL WHERE school_id=$1',[school,JSON.stringify(sla(1))]);
 for(const stage of [1,2,3]){await db.query('UPDATE assignment_settings SET last_run_at=NULL WHERE school_id=$1',[school]);await db.query('SELECT assignment_tick(100)');assert.equal((await record(report,'report')).escalation_stage,stage);}
 const count=(await db.query<any>("SELECT count(*) n FROM assignment_events WHERE item_id=$1 AND action IN('reminder-ack','supervisor-ack','manual-escalation-ack')",[report])).rows[0].n;assert.equal(Number(count),3);await db.query('SELECT assignment_tick(100)');assert.equal((await record(report,'report')).escalation_stage,3);
 await db.query('UPDATE assignment_settings SET auto_reassign_overdue=true,last_run_at=NULL WHERE school_id=$1',[school]);await db.query("UPDATE report_assignments SET escalation_stage=2,next_action_at=now()-interval '1 hour' WHERE report_id=$1",[report]);await db.query('SELECT assignment_tick(100)');assert.equal((await record(report,'report')).assignment_reason,'escalated');assert.equal((await record(urgent)).status,'pending','urgent never auto-closes');
 }finally{await db.close();}
});
