import { currentSchool, schoolUser } from './school-scope';
import { createHash, createHmac, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
const COOKIE='sf_submit_device';
export const submissionHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function submissionContext(req:Request,res:Response,create=false) {
  let device=req.cookies?.[COOKIE];
  if(typeof device!=='string' || !/^[a-f0-9]{64}$/.test(device)) {
    if(!create) return null;
    device=randomBytes(32).toString('hex');
    res.cookie(COOKIE,device,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:365*86400000,path:'/'});
  }
  // The browser can compare account contexts without persisting an account ID or credential.
  const actor=submissionHash(device+':'+(currentSchool()?.id || '')+':'+(schoolUser(req)?.id || 'guest'));
  return {actor,signedIn:!!schoolUser(req)?.id,device:device as string};
}
export function receiptTrackingCode(device:string,actor:string,requestId:string) {
  return 'CV-'+createHmac('sha256',device).update(actor+':'+requestId.toLowerCase()).digest('hex').slice(0,32).toUpperCase();
}
