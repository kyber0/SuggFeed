import {reserveSchoolImage,finishSchoolImage} from '../lib/school-images';
import {submissionHash} from '../lib/submission-context';
import {Router,Request,Response,NextFunction} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {supabasePlatform} from '../lib/supabase';
import {operator} from './schools';
import {authorizeSchoolStudio} from '../lib/school-customization-access';
import previewRouter from './school-customization-preview';
import {normalizeCustomization,customizationChanges,SCHOOL_PALETTES,SCHOOL_ICONS} from '../lib/school-customization';
const router=Router();
const run=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const paths=['/s/:schoolSlug/admin/customization','/platform/schools/:id/customization'];
const base=(req:Request)=>req.path.replace(/\/(?:save|publish|restore|request-review|assets(?:\/(?:intent|finalize|[^/]+))?|preview(?:\/(?:content|render))?)\/?$/,'');
const uploadsReady=()=>!!process.env.CRON_SECRET&&process.env.CRON_SECRET.length>=32;
const editing=()=>process.env.SCHOOL_CUSTOMIZATION_EDITING_DISABLED!=='true';
async function state(school:string,actor:string){const result=await supabasePlatform.rpc('get_school_customization',{p_school:school,p_actor:actor});if(result.error||!result.data)throw Object.assign(new Error('Customization unavailable. Please retry.'),{status:503});return result.data;}
function failure(res:Response,error:any){const code=error?.code;return res.status(code==='40001'?409:code==='42501'?403:code==='P0203'?409:400).json({success:false,code,error:code==='40001'?'Another administrator changed this draft. Keep your changes and reload the latest version before saving.':code==='P0203'?'This submission form needs platform review against an approved school policy before publishing.':code==='42501'?'You cannot edit this school, or its editor is disabled.':'The change was not saved. Check its fields and reload the current draft.'});}
router.use(paths,(req,res,next)=>{const csp=res.getHeader('Content-Security-Policy');if(typeof csp==='string')res.setHeader('Content-Security-Policy',csp.replace(/frame-src ([^;]+)/,"frame-src 'self' $1").replace(/frame-ancestors [^;]+/,req.path.endsWith('/preview/content')?"frame-ancestors 'self'":"frame-ancestors 'none'"));if(req.path.endsWith('/preview/content'))res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','same-origin');next();});
router.get(paths,run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;const data=context.state;
 return res.render('school-customization',{title:'School customization — '+context.school.name,school:context.school,data,base:base(req),enabled:editing()&&data.editing_enabled,uploadsReady:uploadsReady(),palettes:SCHOOL_PALETTES,icons:SCHOOL_ICONS,changes:customizationChanges(data.published,data.draft)});
}));
router.post(paths.map(p=>p+'/save'),run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;if(!editing())return res.status(503).json({success:false,error:'Customization editing is temporarily paused. Published workspaces remain available.'});
 let configuration;try{configuration=normalizeCustomization(req.body?.configuration);}catch(error){return res.status(400).json({success:false,error:error instanceof Error?error.message:'Check the customization fields.'});}
 if(!Number.isSafeInteger(req.body.revision)||req.body.revision<0)return res.status(400).json({success:false,error:'Reload the current draft.'});
 const result=await supabasePlatform.rpc('save_school_customization',{p_school:context.school.id,p_actor:context.user.id,p_revision:req.body.revision,p_configuration:configuration});
 if(result.error)return failure(res,result.error);res.json({success:true,configuration,revision:result.data,changes:customizationChanges((await state(context.school.id,context.user.id)).published,configuration)});
}));
for(const action of ['publish','restore','request-review'])router.post(paths.map(p=>p+'/'+action),run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;if(!editing())return res.status(503).json({success:false,error:'Customization editing is paused.'});
 if(!Number.isSafeInteger(req.body?.revision)||req.body.revision<0||action==='restore'&&(!Number.isSafeInteger(req.body?.version)||req.body.version<1))return res.status(400).json({success:false,error:'Reload the current draft and choose a valid version.'});
 if(action==='publish'&&!uploadsReady()&&(await state(context.school.id,context.user.id)).draft.form.attachments!=='off')return res.status(503).json({success:false,error:'Image attachments need service setup before publication. Ask the platform operator to enable file cleanup, or keep attachments off.'});
 if(action==='publish'&&req.body?.confirmed!==true)return res.status(400).json({success:false,error:'Review the changes and confirm publication.'});
 const result=await supabasePlatform.rpc(action==='publish'?'publish_school_customization':action==='restore'?'restore_school_customization':'request_school_form_review',{p_school:context.school.id,p_actor:context.user.id,p_revision:req.body.revision,...(action==='restore'?{p_version:req.body.version}:{})});
 if(result.error){if(action==='restore'&&['22023','23505'].includes(result.error.code))return res.status(409).json({success:false,error:'This historical version conflicts with a newer category name or address. Your current draft is unchanged. Rename and publish the newer conflicting category, or choose another version, then restore again.'});return failure(res,result.error);}res.json({success:true,value:result.data});
}));
router.post(paths.flatMap(p=>[p+'/assets/intent',p+'/assets/finalize']),run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;if(!editing())return res.status(503).json({success:false,error:'Customization editing is paused.'});
 const purpose=req.body?.kind;if(!['logo','cover'].includes(purpose))return res.status(400).json({success:false,error:'Choose a logo or cover image.'});
 const input={school:context.school.id,actor:context.user.id,owner:submissionHash('school-brand:'+context.school.id+':'+context.user.id),purpose};
 if(req.path.endsWith('/intent')){const size=req.body?.size;if(!Number.isSafeInteger(size))return res.status(400).json({success:false,error:'Choose a supported image.'});return res.status(201).json({success:true,...await reserveSchoolImage({...input,size})});}
 if(typeof req.body?.id!=='string'||!/^[a-f0-9-]{36}$/i.test(req.body.id))return res.sendStatus(400);
 const result=await finishSchoolImage({...input,id:req.body.id});return res.json({success:true,...result,url:base(req).replace(/\/assets\/finalize$/,'')+'/assets/'+result.id});
}));
router.get(paths.map(p=>p+'/assets/:assetId'),run(async(req,res)=>{
 const context=await authorizeSchoolStudio(req,res);if(!context)return;
 const {data,error}=await supabasePlatform.from('school_brand_assets').select('storage_path').eq('school_id',context.school.id).eq('id',req.params.assetId).maybeSingle();if(error)throw error;if(!data)return res.sendStatus(404);
 const file=await supabasePlatform.storage.from('school-branding').download(data.storage_path);if(file.error||!file.data)return res.sendStatus(404);res.type('image/webp').setHeader('Cache-Control','private, no-store');res.send(Buffer.from(await file.data.arrayBuffer()));
}));
router.use(previewRouter);
router.get(paths.map(p=>p+'/preview'),run(async(req,res)=>{const context=await authorizeSchoolStudio(req,res);if(!context)return;const query=new URLSearchParams({mode:'preview'});if(['light','dark'].includes(String(req.query.theme)))query.set('theme',String(req.query.theme));if(['320','375','768','1440'].includes(String(req.query.width)))query.set('width',String(req.query.width));res.redirect(303,req.path.replace(/\/preview$/,'')+'?'+query);}));
router.get(paths.map(p=>p+'/capability'),run(async(req,res)=>{const context=await authorizeSchoolStudio(req,res);if(!context)return;res.setHeader('Cache-Control','private, no-store');res.json({success:true,revision:context.state.revision});}));
router.get(paths.map(p=>p+'/state'),run(async(req,res)=>{const context=await authorizeSchoolStudio(req,res);if(!context)return;res.setHeader('Cache-Control','private, no-store');res.json({success:true,...context.state});}));
router.get('/platform/customization',run(async(req,res)=>{
 const actor=await operator(req,res);if(!actor)return;
 const page=Number(req.query.page||0);if(!Number.isSafeInteger(page)||page<0||page>10000)return res.sendStatus(400);
 return res.redirect(303,'/platform/schools?editorPage='+page+(req.query.saved==='1'?'&saved=1':'')+'#editor-access');
}));
const editorReturn=(value:unknown)=>{const page=Number(value||0);return '/platform/schools?editorPage='+(Number.isSafeInteger(page)&&page>=0&&page<=10000?page:0)+'&saved=1#editor-access';};
router.post('/platform/schools/:id/customization-rollout',run(async(req,res)=>{const actor=await operator(req,res);if(!actor)return;if(!['true','false'].includes(req.body?.enabled))return res.sendStatus(400);const result=await supabasePlatform.rpc('set_school_customization_rollout',{p_school:req.params.id,p_actor:actor.id,p_enabled:req.body.enabled==='true'});if(result.error)return failure(res,result.error);res.redirect(303,editorReturn(req.body?.editorPage));}));
router.post('/platform/schools/:id/customization-review',run(async(req,res)=>{const actor=await operator(req,res);if(!actor)return;const revision=Number(req.body?.revision),reference=req.body?.reference;if(!Number.isSafeInteger(revision)||typeof reference!=='string'||reference.trim().length<10||reference.length>2000)return res.status(400).render('school-message',{title:'Review reference required',message:'Record the policy and form review reference before approving.'});const result=await supabasePlatform.rpc('review_school_customization_form',{p_school:req.params.id,p_actor:actor.id,p_revision:revision,p_reference:reference});if(result.error)return res.status(409).render('school-message',{title:'Review not saved',message:'The draft changed or the school has no approved policy. Review the current version before retrying.'});res.redirect(303,editorReturn(req.body?.editorPage));}));
router.get('/internal/school-customization-cleanup',run(async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');const secret=process.env.CRON_SECRET||'',provided=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+secret);
 if(secret.length<32||provided.length!==expected.length||!timingSafeEqual(provided,expected))return res.sendStatus(401);
 const pending=await supabasePlatform.rpc('cleanup_school_customization_uploads');if(pending.error)throw pending.error;let removed=0,failed=0;
 for(const bucket of ['school-upload-sources','school-branding','submission-attachments']){const paths=(pending.data||[]).filter((item:any)=>item.bucket===bucket).map((item:any)=>item.path);for(let offset=0;offset<paths.length;offset+=100){const batch=paths.slice(offset,offset+100);const result=await supabasePlatform.storage.from(bucket).remove(batch);if(result.error){failed+=batch.length;continue;}const ack=await supabasePlatform.rpc('acknowledge_school_asset_deletion',{p_bucket:bucket,p_paths:batch});if(ack.error)failed+=batch.length;else removed+=batch.length;}}
 return res.status(failed?503:200).json({success:failed===0,removed,failed,pending:(pending.data||[]).length});
}));
export default router;
