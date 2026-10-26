import {providerKey,providerIdle} from '../lib/session-idle-store';
import {Router} from 'express';
import {sameOriginOnly} from '../lib/security';
import {sharedActivityBudget} from '../lib/shared-rate-limit';
import {idleExpired,idleState} from '../lib/session-idle';

const router=Router();
// Separate from sign-in attempts: ordinary activity must not exhaust the login budget.
router.post('/auth/session/activity',sameOriginOnly,(req,res,next)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(!req.session.user)return idleExpired(res);
 next();
},sharedActivityBudget,(req,res,next)=>{
 void (async()=>{
 if(!req.is('application/json'))return res.status(415).json({success:false,error:'JSON body required.'});
 const key=providerKey(req.session.accessToken,req.session.user!.id);
 if(!key)return idleExpired(res);
 const state=await providerIdle(key,'activity',req.session.user!.id);if(!state.allowed)return idleExpired(res);
 req.session.lastActivityAt=state.lastActivityAt;
 await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
 res.json({success:true,idle:idleState(req,state.serverNow)});
 })().catch(next);
});
export default router;
