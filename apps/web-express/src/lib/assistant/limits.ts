import {createHmac} from 'node:crypto';
import {ipKeyGenerator} from 'express-rate-limit';
import {assistantConfig as c} from './config';
import type {Store} from './store';
export function fingerprint(value:string,secret=process.env.ASSISTANT_HMAC_SECRET||''){if(secret.length<32)throw new Error('assistant_not_configured');return createHmac('sha256',secret).update(value).digest('hex');}
export async function budget(store:Store,ip:string,actor:string|null,feedback=false){const value=await store('budget',{ip:fingerprint((feedback?'feedback:':'ask:')+ipKeyGenerator(ip,56)),account:actor?fingerprint('account:'+actor):null,ipLimit:feedback?c.feedbackLimit:c.ipLimit,accountLimit:c.accountLimit,seconds:c.windowSeconds});return !!value&&typeof value==='object'&&'allowed' in value&&value.allowed===true;}
