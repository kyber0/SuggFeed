import type {Store} from './store';
import type {Entry,Locale} from './types';
import {assistantConfig as c} from './config';
export async function cached(store:Store,hash:string,version:string,locale:Locale,entries:Entry[]){const value=await store('cache-get',{hash,version,locale});if(!value||typeof value!=='object'||!('id' in value)||!('answer' in value))return null;const entry=entries.find(e=>e.id===value.id);return entry&&entry.answers[locale]===value.answer?entry:null;}
export async function cacheAnswer(store:Store,hash:string,version:string,locale:Locale,entry:Entry){await store('cache-put',{hash,version,locale,id:entry.id,answer:entry.answers[locale],ttl:c.cacheSeconds});}
