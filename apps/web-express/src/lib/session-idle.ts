import {createHash} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';
import '../types';

export const SESSION_IDLE_MS=30*60*1000;
export const SESSION_WARNING_MS=2*60*1000;
export const SESSION_ACTIVITY_INTERVAL_MS=60*1000;
export interface SessionIdleState {expiresAt:number;serverNow:number;warningMs:number;activityIntervalMs:number;}

/** Only called for a token already verified by the provider or stored in the verified server session. */
function providerSessionId(token:string|undefined):string|null {
 try {const value=JSON.parse(Buffer.from((token||'').split('.')[1],'base64url').toString('utf8')).session_id;return typeof value==='string'&&value.length<=128?value:null;}catch{return null;}
}
function tokenHash(token:string){return createHash('sha256').update(token).digest('hex');}
export function blockedIdleToken(req:Request,token:string):boolean {
 const blocked=req.session.idleBlocked;
 return !!blocked&&(blocked.tokenHash===tokenHash(token)||!!blocked.providerSessionId&&blocked.providerSessionId===providerSessionId(token));
}
export function newProviderSession(previous:string|undefined,token:string):boolean {
 const before=providerSessionId(previous),after=providerSessionId(token);
 return !!before&&!!after&&before!==after;
}
export function idleState(req:Request,now=Date.now()):SessionIdleState|null {
 return req.session.user&&Number.isFinite(req.session.lastActivityAt)?{expiresAt:req.session.lastActivityAt!+SESSION_IDLE_MS,serverNow:now,warningMs:SESSION_WARNING_MS,activityIntervalMs:SESSION_ACTIVITY_INTERVAL_MS}:null;
}
export function idleExpired(res:Response){
 return res.status(401).json({success:false,code:'SESSION_IDLE_EXPIRED',error:'Your session expired after 30 minutes of inactivity. Sign in again. No changes were saved.'});
}
function navigationActivity(req:Request):boolean {
 const destination=req.get('sec-fetch-dest');
 return req.method==='GET'&&(!destination||destination==='document')&&(!destination||req.get('sec-fetch-mode')==='navigate')
  &&!!req.get('accept')?.includes('text/html')&&!(req.get('purpose')||req.get('sec-purpose')||'').includes('prefetch')
  &&!/^\/(?:auth|api|health|internal)(?:\/|$)/i.test(req.path);
}
/** Background requests and token refresh never extend the inactivity deadline. */
export function enforceIdleSession(req:Request,res:Response,next:NextFunction){
 const now=Date.now();res.locals.sessionIdleExpired=!!req.session.idleBlocked;
 if(!req.session.user)return next();
 // Existing sessions receive one grace period when this policy first ships.
 if(!Number.isFinite(req.session.lastActivityAt))req.session.lastActivityAt=now;
 if(now-req.session.lastActivityAt!>=SESSION_IDLE_MS){
  req.session.idleBlocked={tokenHash:tokenHash(req.session.accessToken||''),providerSessionId:providerSessionId(req.session.accessToken)};
  req.session.user=null;delete req.session.accessToken;delete req.session.refreshToken;delete req.session.lastActivityAt;
  res.locals.sessionIdleExpired=true;res.setHeader('Cache-Control','private, no-store');
  return req.session.save(error=>{
   if(error)return next(error);
   if(!['GET','HEAD'].includes(req.method)&&!['/auth/session','/auth/signout'].includes(req.path))return idleExpired(res);
   next();
  });
 }
 if(navigationActivity(req))req.session.lastActivityAt=now;
 res.locals.sessionIdle=idleState(req,now);
 next();
}
