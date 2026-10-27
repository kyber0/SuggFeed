import {createHash} from 'node:crypto';
import {supabasePlatform} from './supabase';

/** Use only after provider verification or with a previously verified server-session token. */
export function providerKey(token:string|undefined,userId:string):string|null {
 try {
  const id=JSON.parse(Buffer.from((token||'').split('.')[1],'base64url').toString('utf8')).session_id;
  if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))return null;
  return createHash('sha256').update('provider-idle-v1:'+userId+':'+id.toLowerCase()).digest('hex');
 }catch{return null;}
}
export async function providerIdle(key:string,action:'check'|'activity'|'revoke',actor:string){
 const result=await supabasePlatform.rpc('web_session_idle',{p_key:key,p_actor:actor,p_action:action});const state=result.data;
 if(result.error||!state||typeof state.allowed!=='boolean'||!Number.isSafeInteger(state.lastActivityAt)||!Number.isSafeInteger(state.expiresAt)||!Number.isSafeInteger(state.serverNow)||state.expiresAt-state.lastActivityAt!==1800000||state.allowed&&state.expiresAt<=state.serverNow){
  throw Object.assign(new Error('Session security controls unavailable.'),{status:503});
 }
 return state as {allowed:boolean;lastActivityAt:number;expiresAt:number;serverNow:number};
}
