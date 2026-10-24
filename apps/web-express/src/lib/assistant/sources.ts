import {faqSources,type Source,validateDocuments} from './documents';
import type {Knowledge} from './types';
import type {Store} from './store';
import guide from './guide.generated.json';
export function appSources():Source[]{return guide.map(doc=>({...doc,scope:'app',url:'/help#'+doc.id}));}
export async function loadSources(knowledge:Knowledge,store?:Store):Promise<{sources:Source[];status:'available'|'unavailable';schoolName:string}>{
 const shared=[...appSources(),...faqSources(knowledge.entries)];if(!store)return {sources:shared,status:'available',schoolName:''};
 try{const data=await store('published') as {version:number;entries:unknown;settings:Record<string,unknown>|null;schoolName:string;configuration?:Record<string,unknown>};if(!data||!Number.isSafeInteger(data.version)||typeof data.schoolName!=='string')throw new Error('Unavailable');const documents=validateDocuments(data.entries,true).map(doc=>({...doc,scope:'school' as const,url:'/help#'+doc.id}));const settings=data.settings;
 if(settings){const fields:Record<string,string>={schoolContact:'School contact',privacyContact:'Privacy contact',privacyNotice:'Privacy notice',participationNotice:'Participation rules',agePolicy:'Age eligibility',visibility:'Content visibility',retentionDays:'Retention days'};for(const [key,label] of Object.entries(fields)){const value=settings[key];if(typeof value==='string'||typeof value==='number')documents.push({id:'school-settings-'+key.toLowerCase(),title:data.schoolName+' · '+label,text:String(value).slice(0,20000),scope:'school',url:'/help#school-settings-'+key.toLowerCase()});}}
 const configuration=data.configuration;if(configuration&&typeof configuration==='object'){const sections:Record<string,string>={welcome:'School welcome and official links',features:'Current community features (true means enabled; false means disabled)',categories:'School feedback categories and active status',form:'Current submission form requirements',labels:'Current public progress labels',stageDescriptions:'Progress stage explanations'};for(const [key,title] of Object.entries(sections)){if(configuration[key])documents.push({id:'school-config-'+key.toLowerCase(),title,text:JSON.stringify(configuration[key]).slice(0,20000),scope:'school',url:'/help#school-config-'+key.toLowerCase()});}}
 documents.unshift({id:'school-identity',title:'Current school',text:'The current school workspace is '+data.schoolName+'.',scope:'school',url:'/help#school-identity'});
 return {sources:[...shared,...documents],status:'available',schoolName:data.schoolName};
 }catch{console.warn('school_documents_unavailable');return {sources:shared.filter(s=>s.scope==='app'),status:'unavailable',schoolName:''};}
}
