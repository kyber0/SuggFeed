import {createHmac,timingSafeEqual} from 'node:crypto';
import type {RequestHandler} from 'express';
import rateLimit,{ipKeyGenerator} from 'express-rate-limit';
import {supabasePlatform} from './supabase';

export function cronAuthorized(value:string|undefined):boolean {
 const secret=process.env.CRON_SECRET||'',provided=Buffer.from(value||''),expected=Buffer.from('Bearer '+secret);
 return secret.length>=32&&provided.length===expected.length&&timingSafeEqual(provided,expected);
}

// Bound bursts before even the shared counter. Static assets mount before this guard.
export const readBurstLimit=rateLimit({windowMs:10000,limit:200,standardHeaders:'draft-7',legacyHeaders:false,
 skip:req=>!['GET','HEAD'].includes(req.method),message:{success:false,error:'Too many requests. Please wait before retrying.'}});

/** Shared per-IP read limits run before session, identity and school/database loaders. */
export const sharedReadBudget:RequestHandler=async(req,res,next)=>{
 if(!['GET','HEAD'].includes(req.method))return next();
 res.setHeader('Cache-Control','private, no-store');
 const path=req.path.toLowerCase();
 if(path.startsWith('/internal/')){
  if(!cronAuthorized(req.get('authorization')))return res.status(401).json({success:false,error:'Unauthorized.'});
  return next();
 }
 const secret=process.env.SESSION_SECRET;
 // Production uses the durable store; local development/tests must not contact a provider.
 if(process.env.NODE_ENV!=='production')return next();
 if(!secret||secret.length<32)return res.status(503).json({success:false,error:'Request controls unavailable.'});
 const expensive=!!req.query.search||!!req.query.q||/\/(?:api\/feed-total|api\/navigation-cache|api\/community\/similar)(?:\/|$)/.test(path);
 const key=createHmac('sha256',secret).update(JSON.stringify(['read-budget-v1',expensive?'search':'page',ipKeyGenerator(req.ip||'unknown',56)])).digest('hex');
 try {
  // Existing atomic shared store is the fallback until edge/Redis controls are provisioned.
  const result=await supabasePlatform.rpc('consume_request_budget',{p_key:key,p_limit:expensive?180:1000,p_window_seconds:60});
  const budget=Array.isArray(result.data)&&result.data.length===1?result.data[0]:null;
  if(result.error||!budget||typeof budget.allowed!=='boolean'||!Number.isInteger(budget.retry_after)||budget.retry_after<1||budget.retry_after>86400)throw new Error('Read budget unavailable');
  if(!budget.allowed){res.setHeader('Retry-After',String(budget.retry_after));return res.status(429).json({success:false,error:'Too many requests. Please wait before retrying.'});}
  next();
 }catch{res.setHeader('Retry-After','30');return next(Object.assign(new Error('Request controls unavailable.'),{status:503}));}
};
