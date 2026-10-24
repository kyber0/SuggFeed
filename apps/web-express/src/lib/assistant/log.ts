import {randomBytes} from 'node:crypto';
import {fingerprint} from './limits';
import type {Store} from './store';
import type {Reply} from './types';
import {assistantConfig as c} from './config';
export async function record(store:Store,reply:Reply,topic:string):Promise<Reply>{if(!c.loggingEnabled)return reply;try{const token=randomBytes(32).toString('base64url');const value=await store('log',{topic:topic||'unknown',answered:reply.answered,source:reply.source,id:reply.faqId||null,version:reply.version,locale:reply.locale,tokenHash:fingerprint('feedback:'+token),ttl:c.capabilitySeconds});if(value&&typeof value==='object'&&'id' in value&&typeof value.id==='string')return {...reply,requestId:value.id,feedbackToken:token};}catch{console.warn('assistant_log_unavailable');}return reply;}
