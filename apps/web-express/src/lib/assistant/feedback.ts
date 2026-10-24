import {budget,fingerprint} from './limits';
import type {Store} from './store';
import {HelpError} from './service';
export async function feedback(store:Store,input:Record<string,unknown>,ip:string,actor:string|null){if(typeof input.requestId!=='string'||!/^[-a-f0-9]{36}$/i.test(input.requestId)||typeof input.token!=='string'||!/^[-_a-zA-Z0-9]{43}$/.test(input.token)||!['up','down'].includes(String(input.rating)))throw new HelpError(400,'Choose helpful or not helpful for an available answer.');if(!await budget(store,ip,actor,true))throw new HelpError(429,'Please wait before sending more feedback.');await store('feedback',{id:input.requestId,tokenHash:fingerprint('feedback:'+input.token),rating:input.rating});}
