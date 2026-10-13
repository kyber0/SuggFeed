import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { digestEnabled, deliverWeeklyDigests, unsubscribeUser } from '../lib/digests';
import { supabaseService } from '../lib/supabase';
const router=Router();
router.get('/internal/weekly-digests',async(req,res,next)=>{
  res.setHeader('Cache-Control','private, no-store');
  const secret=process.env.CRON_SECRET || '',provided=Buffer.from(req.headers.authorization || ''),expected=Buffer.from('Bearer '+secret);
  if(secret.length<32 || provided.length!==expected.length || !timingSafeEqual(provided,expected)) return res.status(401).json({success:false,error:'Unauthorized.'});
  if(!digestEnabled()) return res.status(503).json({success:false,error:'Digest delivery is disabled or incomplete.'});
  try {const result=await deliverWeeklyDigests();return res.status(result.failed ? 503 : 200).json({success:!result.failed,...result});}catch(e){next(e);}
});
router.get('/digest/unsubscribe',(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.render('digest-unsubscribe',{title:'Stop weekly emails — SuggFeed',token:unsubscribeUser(req.query.token) ? req.query.token : '',valid:!!unsubscribeUser(req.query.token)});
});
router.get('/digest/unsubscribed',(_req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.render('digest-unsubscribe',{title:'Weekly emails stopped',done:true,token:'',valid:true});
});
router.post('/digest/unsubscribe',async(req,res,next)=>{
  res.setHeader('Cache-Control','private, no-store');
  const id=unsubscribeUser(req.body.token);
  if(!id) return res.status(400).render('digest-unsubscribe',{title:'Stop weekly emails',token:'',valid:false});
  try {const {error}=await supabaseService.from('notification_preferences').update({weekly_digest:false,updated_at:new Date().toISOString()}).eq('user_id',id);if(error) throw error;res.redirect(303,'/digest/unsubscribed');}catch(e){next(e);}
});
export default router;
