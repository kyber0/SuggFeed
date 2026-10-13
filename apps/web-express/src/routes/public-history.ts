import { Router } from 'express';
import { supabase } from '../lib/supabase';
import { ENGAGEMENT_UUID } from '../lib/engagement';
import { listPublicProgress } from '../lib/progress';
const router=Router();
router.get('/idea/:id/history',async(req,res,next)=>{
  if(!ENGAGEMENT_UUID.test(req.params.id))return res.status(400).json({success:false,error:'Invalid idea.'});
  try {
    const result=await supabase.rpc('read_public_submission_history',{p_submission_id:req.params.id});
    if(result.error)throw result.error;
    if(result.data===null)return res.status(404).json({success:false,error:'This idea is no longer public.'});
    const updates=await listPublicProgress(req.params.id);
    res.setHeader('Cache-Control','private, no-store');
    res.json({success:true,history:result.data,updates,limit:100});
  }catch(e){next(e);}
});
export default router;
