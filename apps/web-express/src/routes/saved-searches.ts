import { Router } from 'express';
import { supabaseService } from '../lib/supabase';
import { savedSearchFilters } from '../lib/feed-filters';
import { ENGAGEMENT_UUID } from '../lib/engagement';
const router=Router();
router.use((req,res,next)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(!req.session.user?.id) return res.status(401).json({success:false,error:'Sign in to manage account searches.'});
  next();
});
router.get('/',async(req,res,next)=>{
  try {
    const {data,error}=await supabaseService.from('student_saved_searches').select('id,name,filters').eq('user_id',req.session.user!.id).order('created_at');
    if(error) throw error;
    res.json({success:true,searches:data || []});
  }catch(e){next(e);}
});
router.post('/',async(req,res,next)=>{
  if(typeof req.body.name!=='string' || !req.body.name.trim() || req.body.name.trim().length>40 || !req.body.filters || typeof req.body.filters!=='object' || Array.isArray(req.body.filters)) return res.status(400).json({success:false,error:'Give this search a name of 1–40 characters.'});
  try {
    const {data,error}=await supabaseService.rpc('save_student_search',{p_user:req.session.user!.id,p_name:req.body.name.trim(),p_filters:savedSearchFilters(req.body.filters)});
    if(error?.code==='54000')return res.status(409).json({success:false,error:'You can save up to ten searches. Remove one first.'});
    if(error?.code==='23505')return res.status(409).json({success:false,error:'A search already uses that name.'});
    if(error)throw error;
    res.status(201).json({success:true,search:data});
  }catch(e){next(e);}
});
router.patch('/:id',async(req,res,next)=>{
  if(!ENGAGEMENT_UUID.test(req.params.id) || typeof req.body.name!=='string' || !req.body.name.trim() || req.body.name.trim().length>40)return res.status(400).json({success:false,error:'Enter a name of 1–40 characters.'});
  try {
    const {data,error}=await supabaseService.from('student_saved_searches').update({name:req.body.name.trim()}).eq('id',req.params.id).eq('user_id',req.session.user!.id).select('id').maybeSingle();
    if(error?.code==='23505')return res.status(409).json({success:false,error:'A search already uses that name.'});
    if(error)throw error;
    if(!data)return res.status(404).json({success:false,error:'Search unavailable.'});
    res.json({success:true});
  }catch(e){next(e);}
});
router.delete('/:id',async(req,res,next)=>{
  if(!ENGAGEMENT_UUID.test(req.params.id))return res.status(400).json({success:false,error:'Invalid search.'});
  try {
    const {data,error}=await supabaseService.from('student_saved_searches').delete().eq('id',req.params.id).eq('user_id',req.session.user!.id).select('id').maybeSingle();
    if(error)throw error;
    if(!data)return res.status(404).json({success:false,error:'Search unavailable.'});
    res.json({success:true});
  }catch(e){next(e);}
});
export default router;
