import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safetyDb} from './support/submission-safety-db';
import {SCHOOL_A,SCHOOL_B,ADMIN_A,ADMIN_B,STUDENT} from './support/tenant-db';
import {validateFaqs,loadKnowledge} from '../src/lib/assistant/school-knowledge';
import {matchQuestion} from '../src/lib/assistant/normalize';
import {ask} from '../src/lib/assistant/service';
const faq={id:'school-admissions',category:'admissions',questions:{en:'What are the school admission requirements?',fil:'Ano ang kailangan para sa pagpasok?',taglish:'Ano ang admission requirements?'},answers:{en:'Fictional fixture only: ask the admissions office for the approved checklist.',fil:'Halimbawa lamang: humingi ng listahan sa tanggapan.',taglish:'Fixture lang: ask admissions for the checklist.'},keywords:['admission','requirements','apply'],aliases:{en:['how do i apply to my school'],fil:[],taglish:[]}};
test('school FAQ validator requires reviewed translations and prevents app overrides',()=>{assert.equal(validateFaqs([faq],true).length,1);assert.throws(()=>validateFaqs([{...faq,id:'app-overview'}],true));assert.throws(()=>validateFaqs([{...faq,answers:{...faq.answers,fil:''}}],true));assert.throws(()=>validateFaqs([{...faq,category:'app_basics'}],true));assert.throws(()=>validateFaqs([faq,{...faq,id:'school-other'}],true),/distinct/);assert.throws(()=>validateFaqs([{...faq,aliases:{...faq.aliases,en:['How do I submit an idea?']}}],true),/already answers/);});
test('school drafts, publication, history and runtime answers are scoped and versioned',async()=>{
 const db=await safetyDb(true);try{
 const action=async(school:string,actor:string,name:string,data:Record<string,unknown>={})=>{await db.exec('SET ROLE service_role');try{return (await db.query<{value:any}>('SELECT assistant_knowledge_action($1::uuid,$2::uuid,$3,$4::jsonb) AS value',[school,actor,name,JSON.stringify(data)])).rows[0].value;}finally{await db.exec('RESET ROLE');}};
 await assert.rejects(action(SCHOOL_A,STUDENT,'state'),/administrator/);await assert.rejects(action(SCHOOL_A,ADMIN_B,'save',{revision:0,entries:[faq]}),/access/);
 const saved=await action(SCHOOL_A,ADMIN_A,'save',{revision:0,entries:[faq]});assert.equal(saved.revision,1);assert.equal((await action(SCHOOL_A,STUDENT,'published')).version,0);
 await assert.rejects(action(SCHOOL_A,ADMIN_A,'publish',{revision:1,entries:[faq],reviewed:false}),/review/);
 const published=await action(SCHOOL_A,ADMIN_A,'publish',{revision:1,entries:[faq],reviewed:true});assert.equal(published.version,1);assert.equal((await action(SCHOOL_B,STUDENT,'published')).version,0);
 await assert.rejects(action(SCHOOL_A,ADMIN_A,'save',{revision:1,entries:[]}),/changed/);assert.equal((await action(SCHOOL_A,STUDENT,'published')).entries[0].id,faq.id);
 const knowledge=await loadKnowledge(SCHOOL_A,(name,data)=>action(SCHOOL_A,STUDENT,name,data));assert.ok(knowledge.version.includes('school-1'));assert.equal(matchQuestion('how do i apply to my school',knowledge.entries)?.id,faq.id);
 const reply=await ask('how do i apply to my school',{school:SCHOOL_A,actor:STUDENT,ip:'127.0.0.1',store:async()=>{throw new Error('FAQ-only fixture');},knowledgeStore:(name,data)=>action(SCHOOL_A,STUDENT,name,data)});assert.equal(reply.answer,faq.answers.en);assert.equal(reply.scope,'school');
 await assert.rejects(db.exec("UPDATE assistant_school_versions SET entries='[]'"),/append-only/);
 const next=await action(SCHOOL_A,ADMIN_A,'save',{revision:2,entries:[]});await action(SCHOOL_A,ADMIN_A,'publish',{revision:next.revision,entries:[],reviewed:true});const cleared=await loadKnowledge(SCHOOL_A,(name,data)=>action(SCHOOL_A,STUDENT,name,data));assert.equal(cleared.schoolStatus,'empty');assert.equal(cleared.entries.some(e=>e.scope==='school'),false);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.exec('SELECT * FROM assistant_school_state'));await assert.rejects(db.exec('SELECT * FROM assistant_school_versions'));await db.exec('RESET ROLE');
 }finally{await db.close();}
});
test('failed school lookup keeps general help but never resurrects stale school facts',async()=>{const knowledge=await loadKnowledge(SCHOOL_A,async()=>{throw new Error('down');});assert.equal(knowledge.schoolStatus,'unavailable');assert.ok(knowledge.entries.every(e=>e.scope==='app'));});
