import {loadKnowledge} from './school-knowledge';
import {knowledgeStoreFor,documentStoreFor,type Store} from './store';
import {assistantConfig as c} from './config';
import {candidates,localeOf,matchQuestion,projectQuestion,unsafeQuestion} from './normalize';
import {fingerprint,budget} from './limits';
import {cached,cacheAnswer} from './cache';
import {record} from './log';
import {geminiAnswer,providerErrorCode,type Generator} from './provider';
import {loadSources} from './sources';
import {chunkSources,retrieveSources,validateAnswer,sourceVersion,type GroundedAnswer} from './documents';
import {schoolQuestion} from './topics';
import type {Reply,Locale,Entry} from './types';
const fallback:Record<Locale,string>={en:"I don't have enough approved information to answer that. Check the school sources and reviewed FAQs, or contact your school office. Do not enter personal information here.",fil:'Wala akong sapat na sinuring impormasyon. Tingnan ang mga sanggunian at FAQ o kontakin ang paaralan. Huwag maglagay ng personal na impormasyon dito.',taglish:'Wala akong enough approved information diyan. Check the school sources and reviewed FAQs or ask your school office. Huwag maglagay ng personal info dito.'};
export class HelpError extends Error {constructor(public status:number,message:string){super(message);}}
export async function ask(question:unknown,context:{school:string|null;actor:string|null;rateActor?:string|null;ip:string;store:Store;knowledgeStore?:Store;documentStore?:Store;generate?:Generator;previousQuestions?:unknown}):Promise<Reply>{
 if(typeof question!=='string'||!question.trim()||Array.from(question).length>c.maxInput||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(question))throw new HelpError(400,'Enter a help question of 1–300 characters.');
 const previous=context.previousQuestions??[];if(!Array.isArray(previous)||previous.length>2||previous.some(q=>typeof q!=='string'||q.length>300))throw new HelpError(400,'Start a new question or clear the conversation.');const history=(previous as string[]).filter(q=>!unsafeQuestion(q));
 const q=question.trim(),knowledge=await loadKnowledge(context.school,context.school?context.knowledgeStore||knowledgeStoreFor(context.school,context.actor):undefined),locale=localeOf(q,knowledge.entries),p=projectQuestion(q,knowledge.entries);
 const base:Reply={success:true,name:'Sugi',answered:false,source:'fallback',answer:fallback[locale],version:knowledge.version,locale};const unavailable=(reason:string):Reply=>({...base,fallbackReason:reason,answer:locale==='en'?'Natural answers are temporarily unavailable. You can still browse the approved sources and reviewed FAQs.':locale==='fil'?'Pansamantalang hindi available ang AI. Maaari mo pa ring basahin ang mga sanggunian at FAQ.':'Temporarily unavailable ang natural answers. Check the approved sources and reviewed FAQs muna.'});if(!c.enabled)return unavailable('disabled');
 const local=matchQuestion(q,knowledge.entries),exact=candidates(q,knowledge.entries)[0]?.exact;
 const answer=(e:Entry,source:Reply['source']):Reply=>({...base,answered:true,source,answer:e.answers[locale],faqId:e.id,scope:e.scope||'app',category:e.category,sources:[{id:'faq-'+e.id,title:e.questions[locale],url:'/help#faq-'+e.id,scope:e.scope||'app'}]});
 let hash='';try{if(!await budget(context.store,context.ip,context.rateActor??context.actor))return unavailable('rate_limited');hash=fingerprint(JSON.stringify([c.policyVersion,local?.id||null,p.tokens,locale,knowledge.version,context.school]));if(local&&(exact||!c.aiEnabled)){const hit=await cached(context.store,hash,knowledge.version,locale,knowledge.entries);if(hit?.id===local.id)return record(context.store,answer(hit,'cache'),p.topic);}}catch{return local?answer(local,'fallback'):unavailable('controls_unavailable');}
 if(unsafeQuestion(q))return record(context.store,base,'unknown');
 if(local&&(exact||!c.aiEnabled||!process.env.GEMINI_API_KEY)){await cacheAnswer(context.store,hash,knowledge.version,locale,local).catch(()=>undefined);return record(context.store,answer(local,'fallback'),p.topic);}
 if(!c.aiEnabled||!process.env.GEMINI_API_KEY)return record(context.store,unavailable(!c.aiEnabled?'ai_disabled':'key_missing'),p.topic);
 const data=await loadSources(knowledge,context.school?context.documentStore||documentStoreFor(context.school,context.actor):undefined);
 const scoped=schoolQuestion(q)?data.sources.filter(s=>s.scope==='school'):data.sources;
 const sources=retrieveSources([...history,q].join(' '),chunkSources(scoped));if(!sources.length)return record(context.store,base,p.topic);
 let lease:string|undefined,failed=false,providerStatus=0,providerCause='',result:GroundedAnswer|null=null;
 try{const claim=await context.store('claim',{key:fingerprint('provider-global'),limit:c.dailyCalls,concurrency:c.concurrency});if(claim&&typeof claim==='object'&&'id' in claim&&typeof claim.id==='string')lease=claim.id;
 if(lease){const signal=AbortSignal.timeout(c.deadlineMs);for(let attempt=0;attempt<=c.retries;attempt++){try{const output=await new Promise<unknown>((resolve,reject)=>{if(signal.aborted){reject(new Error('assistant_timeout'));return;}const abort=()=>reject(new Error('assistant_timeout'));signal.addEventListener('abort',abort,{once:true});(context.generate||geminiAnswer)(sources,q,locale,data.schoolName,history,signal).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});result=validateAnswer(output,sources);break;}catch(error){const status=typeof error==='object'&&error&&'status' in error?Number(error.status):0;providerStatus=status;providerCause=providerErrorCode(error);if(signal.aborted||attempt>=c.retries||status===429||status===401||status===403||status&&status<500)throw new Error('assistant_provider_unavailable');const retry=await context.store('retry',{key:fingerprint('provider-global'),limit:c.dailyCalls});if(!retry||typeof retry!=='object'||!('allowed' in retry)||retry.allowed!==true)throw new Error('assistant_budget_reached');await new Promise(r=>setTimeout(r,100+Math.floor(Math.random()*100)));}}}
 }catch{failed=true;console.warn('assistant_provider_unavailable');}finally{if(lease)await context.store('release',{id:lease,failed,pause:c.circuitSeconds}).catch(()=>undefined);}
 const reply:Reply=result?{...base,answered:true,source:'ai',generated:true,answer:result.answer,sources:result.sources,scope:result.sources.some(s=>s.scope==='school')?'school':'app',version:knowledge.version+':sources-'+sourceVersion(data.sources)}:local?answer(local,'fallback'):failed?unavailable('provider_unavailable'+(providerStatus?'_'+providerStatus+'_'+providerCause:providerCause?'_'+providerCause:'')):!lease?unavailable('provider_busy'):base;
 // Generated prose is never cached: sources and current access must be rechecked.
 return record(context.store,reply,p.topic);
}
