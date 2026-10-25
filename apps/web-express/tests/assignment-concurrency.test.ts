import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const container=process.env.ASSIGNMENT_TEST_CONTAINER;
const school='00000000-0000-4000-8000-00000000000a',admin='10000000-0000-4000-8000-00000000000a',backup='10000000-0000-4000-8000-00000000000b',team='71000000-0000-4000-8000-000000000001';
const moderators=['72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002'];
async function sql(text:string){
 if(!container||!/^sf-assignment-[a-z0-9-]+$/.test(container))throw new Error('Use an isolated local sf-assignment-* Docker fixture');
 return new Promise<string>((resolve,reject)=>{const child=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-X','-At','-v','ON_ERROR_STOP=1'],{env:{...process.env,DOCKER_HOST:undefined,DOCKER_CONTEXT:undefined,DOCKER_TLS:undefined,DOCKER_TLS_VERIFY:undefined,DOCKER_CERT_PATH:undefined}});let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(error)));child.stdin.end(text);});
}
test('real PostgreSQL: concurrent inserts respect capacity and concurrent jobs notify once',{skip:!container},async()=>{
 for(const id of moderators)await sql(`INSERT INTO auth.users(id,email) VALUES('${id}','${id}@example.invalid');INSERT INTO school_memberships(school_id,user_id,role) VALUES('${school}','${id}','moderator');`);
 // Synthetic fixture values only; production settings have no invented durations.
 await sql(`INSERT INTO school_memberships(school_id,user_id,role) VALUES('${school}','${backup}','admin');SELECT assignment_action('${school}','${admin}','team','{"id":"${team}","name":"Concurrency fixture","supervisor":"${admin}","backup":"${backup}","active":true}');`);
 for(const userId of moderators)await sql(`SELECT assignment_action('${school}','${admin}','assignee','{"userId":"${userId}","active":true,"notifications":true,"maxOpen":1,"teams":["${team}"]}');`);
 await sql(`SELECT assignment_action('${school}','${admin}','rule','{"kind":"suggestion","team":"${team}","order":1,"active":true}');`);
 const sla=(n:number)=>({ackMinutes:n,resolveMinutes:n*10,remindAfterMinutes:n,supervisorAfterMinutes:n*2,reassignAfterMinutes:n*3});
 const config=JSON.stringify({revision:0,enabled:true,maxOpen:1,intervalMinutes:1,urgentTeam:team,autoReassignAway:false,autoReassignOverdue:false,slas:{low:sla(120),normal:sla(60),high:sla(30),urgent:sla(1)}});
 await sql(`SELECT assignment_action('${school}','${admin}','settings','${config}');`);
 await Promise.all(Array.from({length:10},(_,i)=>sql(`BEGIN;SELECT set_config('suggfeed.safety_write','create',true),set_config('suggfeed.safety_verdict','{"state":"clear","urgent":false}',true);INSERT INTO submissions(id,school_id,title,description,category_id,status) VALUES('73000000-0000-4000-8000-${String(i+1).padStart(12,'0')}','${school}','Concurrent synthetic idea','Synthetic concurrency fixture, not real school content.','20000000-0000-4000-8000-00000000000a','pending');SELECT pg_sleep(0.05);COMMIT;`)));
 assert.equal(await sql(`SELECT count(*) FROM submission_workflow WHERE school_id='${school}' AND assignee_id IS NOT NULL;`),'2');
 assert.equal(await sql(`SELECT max(n) FROM(SELECT count(*) n FROM submission_workflow WHERE school_id='${school}' AND assignee_id IS NOT NULL GROUP BY assignee_id)x;`),'1');
 assert.equal(await sql(`SELECT count(*) FROM submission_workflow WHERE school_id='${school}' AND assignment_reason='triage';`),'8');
 await sql(`UPDATE submission_workflow SET ack_due_at=now()-interval '5 minutes',next_action_at=now()-interval '5 minutes',assignment_sla='${JSON.stringify(sla(1))}' WHERE school_id='${school}' AND assignee_id IS NOT NULL;UPDATE assignment_settings SET last_run_at=NULL WHERE school_id='${school}';`);
 await Promise.all([sql('SELECT assignment_tick(100);'),sql('SELECT assignment_tick(100);')]);
 assert.equal(await sql(`SELECT count(*) FROM assignment_events WHERE school_id='${school}' AND action='reminder-ack';`),'2');
 assert.equal(await sql(`SELECT count(*) FROM assignment_notifications WHERE school_id='${school}' AND kind='reminder-ack';`),'2');
});
