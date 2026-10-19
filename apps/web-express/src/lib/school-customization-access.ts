import type {Request,Response} from 'express';
import {supabasePlatform} from './supabase';
import {schoolAdmin} from '../routes/schools';
export async function authorizeSchoolStudio(req:Request,res:Response){
 const context=await schoolAdmin(req,res);if(!context)return null;
 const [result,grant]=await Promise.all([supabasePlatform.rpc('get_school_customization',{p_school:context.school.id,p_actor:context.user.id}),supabasePlatform.from('school_customization_state').select('editing_enabled').eq('school_id',context.school.id).maybeSingle()]);
 if(result.error||!result.data||grant.error)throw Object.assign(new Error('School customization is unavailable.'),{status:503});
 const paused=process.env.SCHOOL_CUSTOMIZATION_EDITING_DISABLED==='true';
 if(paused||!grant.data?.editing_enabled){const message=paused?'Visual customization is temporarily paused. Published school pages remain available.':'A platform administrator must enable visual customization for this school.';
  if(req.method!=='GET'||req.get('accept')?.includes('application/json'))res.status(paused?503:403).json({success:false,code:'STUDIO_DISABLED',error:message});else res.status(paused?503:403).render('school-message',{title:'Customization unavailable',message,nextHref:'/schools',nextLabel:'Your schools'});return null;}
 return {...context,state:result.data};
}
