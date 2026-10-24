import {assistantConfig as c} from './config';
import {knowledgeFor} from './knowledge';
import {candidates,localeOf,matchQuestion,projectQuestion} from './normalize';
import {fingerprint,budget} from './limits';
import {cached,cacheAnswer} from './cache';
import {record} from './log';
import {geminiSelect,type Selector} from './provider';
import type {Store} from './store';
import type {Reply,Locale,Entry} from './types';
const fallback:Record<Locale,string>={en:"I don't have that information. Check the reviewed FAQs below or contact the school office. Do not enter personal information here.",fil:'Wala akong sapat na impormasyon. Tingnan ang sinuring FAQ o kontakin ang paaralan. Huwag maglagay ng personal na impormasyon dito.',taglish:'Wala akong verified answer diyan. Check the reviewed FAQs below or contact your school office. Huwag maglagay ng personal info dito.'};
export class HelpError extends Error {constructor(public status:number,message:string){super(message);}}
export async function ask(question:unknown,context:{school:string|null;actor:string|null;rateActor?:string|null;ip:string;store:Store;selector?:Selector}):Promise<Reply>{
 if(typeof question!=='string'||!question.trim()||Array.from(question).length>c.maxInput||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(question))throw new HelpError(400,'Enter a help question of 1–300 characters.');
 const q=question.trim(),knowledge=knowledgeFor(context.school||undefined),locale=localeOf(q,knowledge.entries);const p=projectQuestion(q,knowledge.entries);
 const base:Reply={success:true,name:'Sugi',answered:false,source:'fallback',answer:fallback[locale],version:knowledge.version,locale};
 if(!c.enabled)return base;
 const local=matchQuestion(q,knowledge.entries);const answer=(e:Entry,source:Reply['source']):Reply=>({...base,answered:true,source,answer:e.answers[locale],faqId:e.id});
 let ready=false;let hash='';
 try{ready=await budget(context.store,context.ip,context.rateActor??context.actor);if(!ready)return base;hash=fingerprint(JSON.stringify([c.policyVersion,local?.id||null,p.tokens,locale,knowledge.version,context.school]));const hit=!p.blocked?await cached(context.store,hash,knowledge.version,locale,knowledge.entries):null;if(hit&&(!local||hit.id===local.id))return record(context.store,answer(hit,'cache'),p.topic);}catch{return local?answer(local,'fallback'):base;}
 if(p.blocked&&!local)return record(context.store,base,'unknown');

 let chosen=local,source:Reply['source']='fallback';
 const list=candidates(q,knowledge.entries);
 if(!chosen&&list.length>1&&list[0].score===list[1].score)return record(context.store,base,p.topic);
 if(!chosen&&list.length&&c.aiEnabled&&process.env.GEMINI_API_KEY){let lease:string|undefined;let failed=false;try{const claim=await context.store('claim',{key:fingerprint('provider-global'),limit:c.dailyCalls,concurrency:c.concurrency});if(claim&&typeof claim==='object'&&'id' in claim&&typeof claim.id==='string')lease=claim.id;if(lease){const signal=AbortSignal.timeout(c.deadlineMs);for(let attempt=0;attempt<=c.retries;attempt++){try{const selection=(context.selector||geminiSelect)(list.map(e=>e.entry),p.tokens,signal);const id=await Promise.race([selection,new Promise<never>((_,reject)=>{signal.addEventListener('abort',()=>reject(new Error('assistant_timeout')),{once:true});})]);chosen=list.find(e=>e.entry.id===id)?.entry||null;source='ai';break;}catch(error){const status=typeof error==='object'&&error&&'status' in error?Number(error.status):0;if(signal.aborted||attempt>=c.retries||status===429||status===401||status===403||status&&status<500)throw new Error('assistant_provider_unavailable');const retry=await context.store('retry',{key:fingerprint('provider-global'),limit:c.dailyCalls});if(!retry||typeof retry!=='object'||!('allowed' in retry)||retry.allowed!==true)throw new Error('assistant_budget_reached');await new Promise(r=>setTimeout(r,100+Math.floor(Math.random()*100)));}}}}catch{failed=true;console.warn('assistant_provider_unavailable');}finally{if(lease)await context.store('release',{id:lease,failed,pause:c.circuitSeconds}).catch(()=>undefined);}}
 const reply=chosen?answer(chosen,source):base;
 if(chosen)await cacheAnswer(context.store,hash,knowledge.version,locale,chosen).catch(()=>undefined);
 return record(context.store,reply,p.topic);
}
