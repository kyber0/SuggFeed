import {Router,type Request,type Response,type NextFunction} from 'express';
import {schoolAdmin,confirmedAccount} from './schools';
import {supabasePlatform} from '../lib/supabase';
import {schoolLanding} from '../lib/navigation-context';
import {platformAuthority} from '../lib/navigation-context';
const router=Router();
const run=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const paths=['/s/:schoolSlug/admin/student-access','/platform/schools/:id/student-access'];
const fail=(res:Response,message:string,status=400)=>res.status(status).render('school-message',{title:'Student joining unavailable',message,nextHref:'/schools',nextLabel:'Your schools'});
const base=(req:Request,school:{id:string;slug:string})=>req.path.toLowerCase().startsWith('/platform/')?'/platform/schools/'+school.id+'/student-access':'/s/'+school.slug+'/admin/student-access';
async function render(req:Request,res:Response,context:NonNullable<Awaited<ReturnType<typeof schoolAdmin>>>,message='',submitted?:Record<string,unknown>,selected:string[]=[],reference=''){
 const page=Number(req.query.page||0);if(!Number.isSafeInteger(page)||page<0||page>10000)return fail(res,'Choose a valid request page.');
 const result=await supabasePlatform.rpc('get_school_student_access',{p_school:context.school.id,p_actor:context.user.id,p_page:page});
 if(result.error)throw Object.assign(new Error('Student joining settings unavailable.'),{status:503});
 const action=base(req,context.school);
 res.setHeader('Cache-Control','private, no-store');
 return res.status(message?409:200).render('school-student-access',{title:'Student joining — '+context.school.name,school:context.school,data:result.data,base:action,settingsUrl:action.replace(/student-access$/,req.path.toLowerCase().startsWith('/platform/')?'settings':'school-settings'),page,saved:req.query.saved,message,submitted,selected,reference});
}
router.get(paths,run(async(req,res)=>{const context=await schoolAdmin(req,res);if(context)return render(req,res,context);}));
router.post(paths.map(path=>path+'/settings'),run(async(req,res)=>{
 const context=await schoolAdmin(req,res);if(!context)return;
 const version=Number(req.body?.version),requests=req.body?.requests_enabled,roster=req.body?.roster_join_enabled;
 const submitted={version,requests_enabled:requests==='yes',roster_join_enabled:roster==='yes'};
 if(!Number.isSafeInteger(version)||version<0||![undefined,'yes'].includes(requests)||![undefined,'yes'].includes(roster)||req.body?.acknowledged!=='yes')return render(req,res,context,'Review the joining options and acknowledge how students can find and join your school.',submitted);
 const result=await supabasePlatform.rpc('save_school_student_joining',{p_school:context.school.id,p_actor:context.user.id,p_version:version,p_requests:submitted.requests_enabled,p_roster:submitted.roster_join_enabled});
 if(result.error)return render(req,res,context,'The save could not be confirmed. Another administrator may have updated enrollment settings. Your choices are preserved; reload the latest settings before saving again.',submitted);
 return res.redirect(303,base(req,context.school)+'?saved=settings');
}));
router.post(paths.map(path=>path+'/review'),run(async(req,res)=>{
 const context=await schoolAdmin(req,res);if(!context)return;
 const raw=req.body?.requests,ids=typeof raw==='string'?[raw]:Array.isArray(raw)?raw:[];
 const decision=req.body?.decision,reference=typeof req.body?.reference==='string'?req.body.reference:'';
 if(ids.length<1||ids.length>50||!ids.every(uuid)||new Set(ids).size!==ids.length||!['approved','rejected'].includes(decision)||reference.trim().length<10||reference.length>1000)return render(req,res,context,'Select 1–50 requests, choose approve or decline, and enter a review reference of 10–1,000 characters.',undefined,ids.filter(uuid),reference.slice(0,1000));
 const result=await supabasePlatform.rpc('review_school_access_requests',{p_school:context.school.id,p_actor:context.user.id,p_requests:ids,p_decision:decision,p_reference:reference.trim()});
 if(result.error)return render(req,res,context,'The review could not be confirmed. Reload the queue before retrying; a batch saves together. Approval requires an active school, current verified applicant emails and enrollment-roster eligibility when that rule is enabled.',undefined,ids,reference);
 return res.redirect(303,base(req,context.school)+'?saved=review#student-access-requests');
}));
router.post(['/schools/access-requests','/schools/roster-join'],run(async(req,res)=>{
 res.locals.accountArea=true;res.setHeader('Cache-Control','private, no-store');
 const user=await confirmedAccount(req,res);if(!user)return;
 if(await platformAuthority(req,res))return fail(res,'Platform operators manage schools from the platform dashboard.',403);
 if(!uuid(req.body?.schoolId)||req.body?.acknowledged!=='yes')return fail(res,'Select a school and acknowledge its notices before continuing.');
 const roster=req.path.toLowerCase()==='/schools/roster-join';
 const result=await supabasePlatform.rpc(roster?'join_school_by_roster':'request_school_student_access',{p_school:req.body.schoolId,p_actor:user.id});
 if(result.error)return fail(res,result.error.code==='54000'?'You can have up to five pending school requests. Wait for a review before requesting more access.':'Your request could not be completed. The school’s joining settings, verified email, roster or membership may have changed. Return to Your schools or contact the school administrator.',result.error.code==='54000'?429:409);
 return res.redirect(303,roster?schoolLanding(result.data,result.data.role):'/schools?studentNotice=requested#student-requests');
}));
export default router;
