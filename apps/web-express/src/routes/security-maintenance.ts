import {assistantConfig} from '../lib/assistant/config';
import {Router} from 'express';
import {cronAuthorized} from '../lib/read-budget';
import {supabasePlatform} from '../lib/supabase';
const router=Router();
router.get('/internal/security-maintenance',async(req,res,next)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(!cronAuthorized(req.get('authorization')))return res.status(401).json({success:false,error:'Unauthorized.'});
 let removed=0,batches=0,more=true;const deadline=Date.now()+15000;
 try {
  do {
   const result=await supabasePlatform.rpc('purge_expired_web_sessions',{p_limit:1000});
   const batch=result.data;
   if(result.error||!batch||!Number.isInteger(batch.removed)||batch.removed<0||batch.removed>1000||typeof batch.more!=='boolean')throw new Error('Session cleanup unavailable');
   removed+=batch.removed;more=batch.more;batches++;
  }while(more&&batches<10&&Date.now()<deadline);
  // Counts contain no identity/token data. Alert if daily batches cannot clear the backlog.
  console.info(JSON.stringify({event:'security_maintenance',removed,more,batches,complete:!more}));
  if(more)res.setHeader('Retry-After','60');
  let assistantRemoved=0,assistantMore=true,assistantBatches=0;do{const assistant=await supabasePlatform.rpc('assistant_action',{p_school:null,p_actor:null,p_action:'cleanup',p_data:{days:assistantConfig.retentionDays}});if(assistant.error||!Number.isInteger(assistant.data?.removed)||assistant.data.removed<0||typeof assistant.data.more!=='boolean')throw new Error('Assistant cleanup unavailable');assistantRemoved+=assistant.data.removed;assistantMore=assistant.data.more;assistantBatches++;}while(assistantMore&&assistantBatches<10&&Date.now()<deadline);if(assistantMore)res.setHeader('Retry-After','60');
  res.status(more||assistantMore?503:200).json({success:!more&&!assistantMore,sessions:{removed,more,batches},assistant:{removed:assistantRemoved,more:assistantMore,batches:assistantBatches},schoolRetention:'No school content deleted; disposal approval required.'});
 }catch(error){console.warn(JSON.stringify({event:'security_maintenance',removed,batches,complete:false}));next(Object.assign(new Error('Security cleanup unavailable.'),{status:503}));}
});
export default router;
