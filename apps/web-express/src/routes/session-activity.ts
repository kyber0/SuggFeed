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
 if(!req.is('application/json'))return res.status(415).json({success:false,error:'JSON body required.'});
 req.session.lastActivityAt=Date.now();
 req.session.save(error=>error?next(error):res.json({success:true,idle:idleState(req)}));
});
export default router;
