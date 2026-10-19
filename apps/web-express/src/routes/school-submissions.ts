import {Router,Request,Response,NextFunction} from 'express';
import {currentSchool,schoolUser} from '../lib/school-scope';
import {supabasePlatform,supabaseService} from '../lib/supabase';
import {submissionContext} from '../lib/submission-context';
import {reserveSchoolImage,finishSchoolImage} from '../lib/school-images';
const router=Router();const run=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);const staff=(req:Request)=>['admin','moderator'].includes(schoolUser(req)?.role||'');
router.post(['/api/submission-files/intent','/api/submission-files/finalize'],run(async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');const school=currentSchool()!,context=submissionContext(req,res);if(!context||req.body?.actor!==context.actor)return res.status(409).json({success:false,error:'Your account or browser changed. Reopen the idea form.'});
 const input={school:school.id,actor:school.actorId,owner:context.actor,purpose:'submission' as const};
 if(req.path.endsWith('/intent')){if(!Number.isSafeInteger(req.body.size))return res.sendStatus(400);return res.status(201).json({success:true,...await reserveSchoolImage({...input,size:req.body.size})});}
 if(!uuid(req.body.id))return res.sendStatus(400);res.json({success:true,...await finishSchoolImage({...input,id:req.body.id})});
}));
router.delete('/api/submission-files/:id',run(async(req,res)=>{const context=submissionContext(req,res),school=currentSchool()!;if(!context||!uuid(req.params.id))return res.sendStatus(400);const result=await supabasePlatform.rpc('discard_submission_upload',{p_school:school.id,p_owner:context.actor,p_id:req.params.id});if(result.error)throw result.error;if(result.data)await supabasePlatform.storage.from('submission-attachments').remove([result.data]);res.json({success:true});}));
router.get('/api/submission-files/:id',run(async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');if(!uuid(req.params.id))return res.sendStatus(404);const school=currentSchool()!,context=submissionContext(req,res);
 const row=await supabasePlatform.from('submission_uploads').select('owner_hash,storage_path,submission_id,expires_at').eq('school_id',school.id).eq('id',req.params.id).maybeSingle();if(row.error)throw row.error;if(!row.data)return res.sendStatus(404);
 let allowed=staff(req)||context?.actor===row.data.owner_hash;if(!allowed&&schoolUser(req)&&row.data.submission_id){const parent=await supabaseService.from('submissions').select('user_id').eq('id',row.data.submission_id).maybeSingle();if(parent.error)throw parent.error;allowed=parent.data?.user_id===schoolUser(req)!.id;}
 if(!allowed||!row.data.submission_id&&Date.parse(row.data.expires_at)<=Date.now())return res.sendStatus(404);const file=await supabasePlatform.storage.from('submission-attachments').download(row.data.storage_path);if(file.error||!file.data)return res.sendStatus(404);res.type('image/webp');res.setHeader('Content-Disposition','inline; filename="school-submission-image.webp"');res.send(Buffer.from(await file.data.arrayBuffer()));
}));
async function details(req:Request,id:string){
 const school=currentSchool()!;const result=await supabaseService.from('submissions').select('id,title,user_id,form_version_id').eq('id',id).maybeSingle();if(result.error)throw result.error;if(!result.data)return null;const context=submissionContext(req,{} as Response); // Reading an existing device cookie never writes a response.
 let allowed=staff(req)||!!schoolUser(req)&&result.data.user_id===schoolUser(req)!.id;
 if(!allowed&&context){const receipt=await supabaseService.from('submission_receipts').select('request_id').eq('submission_id',id).eq('owner_hash',context.actor).limit(1);if(receipt.error)throw receipt.error;allowed=!!receipt.data?.length;}
 if(!allowed)return null;
 const [answers,files,schema]=await Promise.all([supabasePlatform.from('submission_answers').select('answers').eq('school_id',school.id).eq('submission_id',id).maybeSingle(),supabasePlatform.from('submission_uploads').select('id').eq('school_id',school.id).eq('submission_id',id),result.data.form_version_id?supabasePlatform.from('school_form_versions').select('schema').eq('school_id',school.id).eq('id',result.data.form_version_id).maybeSingle():Promise.resolve({data:null,error:null})]);if(answers.error||files.error||schema.error)throw new Error('School submission details are unavailable.');
 return {title:result.data.title,questions:(schema.data?.schema?.questions||[]).map((q:any)=>({label:q.label,answer:answers.data?.answers?.[q.id]||'Not provided'})),files:(files.data||[]).map(f=>({id:f.id,url:'/s/'+school.slug+'/api/submission-files/'+f.id}))};
}
router.get('/submission-details/:id',run(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');if(!uuid(req.params.id))return res.sendStatus(404);const data=await details(req,String(req.params.id));if(!data)return res.status(403).render('school-message',{title:'Private submission details',message:'Only the submitting account, original browser, and authorized school staff can open these details.',nextHref:'/profile',nextLabel:'Your activity'});res.render('school-form-responses',{title:'Your private submission details',details:data,rows:[],authorView:true});}));
router.get('/api/submission-details/:id',run(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');if(!uuid(req.params.id))return res.sendStatus(404);const data=await details(req,String(req.params.id));if(!data)return res.status(404).json({success:false,error:'Private submission details unavailable.'});res.json({success:true,...data});}));
router.get(['/admin/form-responses','/admin/form-responses/:id'],run(async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');if(!staff(req))return res.status(403).render('school-message',{title:'Staff access required',message:'School staff can review private school form responses.'});
 if(req.params.id){if(!uuid(req.params.id))return res.sendStatus(404);const data=await details(req,String(req.params.id));if(!data)return res.sendStatus(404);return res.render('school-form-responses',{title:'Private school submission details',details:data,rows:[]});}
 const result=await supabaseService.from('submissions').select('id,title,created_at').not('form_version_id','is',null).order('created_at',{ascending:false}).limit(50);if(result.error)throw result.error;res.render('school-form-responses',{title:'School form responses',rows:result.data||[],details:null});
}));
export default router;
