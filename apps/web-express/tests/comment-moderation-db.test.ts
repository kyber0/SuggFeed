import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createTenantDb,tenantRpc,SCHOOL_A,SCHOOL_B,ADMIN_A,ADMIN_B,STUDENT,IDEA_A,IDEA_B} from './support/tenant-db';
test('moderated comments enforce isolation, ownership, report uniqueness, review roles and visible counts',async()=>{
 const db=await createTenantDb();
 try{
 await db.exec(readFileSync(path.resolve(__dirname,'../../../supabase/migrations/202610240001_comment_moderation.sql'),'utf8'));
 const action=(actor:string|null,name:string,data:Record<string,unknown>,school=SCHOOL_A)=>tenantRpc(db,school,actor,'comment_action',{p_action:name,p_data:data});
 const clean=await action(STUDENT,'create',{submissionId:IDEA_A,body:'Please improve this library area.',status:'published'});
 const held=await action(STUDENT,'create',{submissionId:IDEA_A,body:'A comment selected for human review.',status:'flagged'});
 assert.equal(held.body,null);
 const count=async()=>Number((await db.query<any>('SELECT comment_count FROM submissions WHERE id=$1',[IDEA_A])).rows[0].comment_count);
 assert.equal(await count(),1);
 await assert.rejects(action(ADMIN_B,'edit',{id:clean.id,body:'An unauthorized cross-school edit.',status:'published',version:1},SCHOOL_B));
 await assert.rejects(action(ADMIN_A,'edit',{id:clean.id,body:'Admins cannot impersonate an owner.',status:'published',version:1}));
 const edit=await action(STUDENT,'edit',{id:clean.id,body:'Updated comment held for a review.',status:'flagged',version:1});assert.equal(edit.version,2);assert.equal(await count(),0);
 await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'moderator')",[SCHOOL_A,ADMIN_B]);
 await assert.rejects(action(ADMIN_B,'approve',{id:clean.id,version:2,body:'Moderators cannot approve comments.'}));
 await assert.rejects(action(STUDENT,'approve',{id:clean.id,version:2,body:'Unauthorized review should fail.'}));
 await action(ADMIN_A,'approve',{id:clean.id,version:2,body:'Reviewed and suitable for discussion.'});assert.equal(await count(),1);
 await action(STUDENT,'report',{commentId:clean.id,body:'Please review the tone of this comment.',threshold:2});
 const duplicate=await action(STUDENT,'report',{commentId:clean.id,body:'Repeating the same report cannot count.',threshold:2});assert.equal(duplicate.already_reported,true);assert.equal(await count(),1);
 await action(ADMIN_A,'report',{commentId:clean.id,body:'A distinct reporter requests a review.',threshold:2});assert.equal(await count(),0);
 assert.equal(Number((await db.query<any>('SELECT count(*) FROM reports WHERE comment_id=$1',[clean.id])).rows[0].count),2);
 await action(ADMIN_A,'approve',{id:clean.id,version:3,body:'Reports reviewed; discussion can continue.'});assert.equal(await count(),1);
 const reply=await action(STUDENT,'create',{submissionId:IDEA_A,parentId:clean.id,body:'A constructive reply must be preserved.',status:'published'});
 await action(ADMIN_A,'delete',{id:clean.id,version:4,body:'Removed after a final administrator review.'});assert.equal(await count(),1);
 assert.equal((await db.query<any>('SELECT count(*) FROM comments WHERE id=$1',[reply.id])).rows[0].count,1);
 assert.equal((await db.query<any>('SELECT body FROM comments WHERE id=$1',[clean.id])).rows[0].body,'[Comment deleted by administrator]');
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('UPDATE comments SET body=$1 WHERE id=$2',['An unchecked write must not work.',reply.id]));await db.exec('RESET ROLE');
 const unchecked=await db.query<any>("INSERT INTO comments(school_id,submission_id,user_id,body,moderation_status) VALUES($1,$2,$3,$4,'published') RETURNING is_hidden,moderation_status",[SCHOOL_A,IDEA_A,STUDENT,'Unchecked service writes must not publish.']);assert.equal(unchecked.rows[0].is_hidden,true);assert.equal(unchecked.rows[0].moderation_status,'flagged');
 await assert.rejects(db.query('UPDATE comments SET body=$1 WHERE id=$2',['An unchecked edit must not publish.',reply.id]));
 await assert.rejects(action(STUDENT,'create',{submissionId:IDEA_B,body:'Cross-school insert must not work.',status:'published'}));
 }finally{await db.close();}
});

test('the migration applies after the complete current schema under the migration role',async()=>{
 const db=await createTenantDb({through:'202610240001_comment_moderation.sql',seed:false,migrationRole:true});
 try{const {rows}=await db.query<{name:string}>('SELECT to_regclass(\'public.comment_moderation_queue\')::text AS name');assert.equal(rows[0].name,'comment_moderation_queue');assert.equal((await db.query<{allowed:boolean}>("SELECT has_schema_privilege('tenant_executor','public','CREATE') AS allowed")).rows[0].allowed,false);}finally{await db.close();}
});
