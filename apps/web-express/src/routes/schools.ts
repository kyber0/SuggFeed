import { operator, confirmedAccount, schoolAdmin } from '../lib/school-authorization';
export { operator, confirmedAccount, schoolAdmin } from '../lib/school-authorization';
import {platformChrome,platformRecovery,platformReturn,platformSaved} from '../lib/platform-dashboard';
import {schoolRosterEmails} from '../lib/school-enrollment';
import {schoolEmailDomain,schoolDomainProofPresent} from '../lib/school-domains';
import { platformAuthority, schoolLanding, safeAccountReturn } from '../lib/navigation-context';
import { invitationEmailConfigured, invitationRoles, sendSchoolInvitation, type InvitationRole } from '../lib/invitation-email';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { supabasePlatform } from '../lib/supabase';
import { legalDetails } from '../lib/legal';
import { DEMO_SCHOOL_ID, allowSchoolApplication, invitationHash, invitationToken, schoolApplicationsConfigured, schoolSettingFields, validInvitationToken } from '../lib/school-onboarding';

declare module 'express-session' { interface SessionData { lastStudentSchool?:string; schoolEnrollmentNotice?:string; schoolDomainNotice?:string; invitationReturn?: {path:string;expires:number}; schoolInvitation?: { schoolId: string; token: string; email?: string; role?: InvitationRole; expires?: string; delivery?: string; warning?: string }; } }

const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
function failed(res: Response, title: string, message: string, status = 400) { return res.status(status).render('school-message', { title, message,...(res.locals.isPlatformOperator?{nextHref:'/platform/schools?section=schools',nextLabel:'School directory'}:{}) }); }
router.use((req, res, next) => {
  if (/^\/(?:schools|platform\/schools)(?:\/|$)/.test(req.path) || /^\/s\/[^/]+\/(?:privacy|terms|admin\/(?:school-settings|invitations|domains|enrollment))(?:\/|$)/.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/account/home', run(async (req, res) => {
  if (!req.session.user) return res.redirect(303, '/schools');
  if (await platformAuthority(req, res)) return res.redirect(303, '/platform/schools');
  const { data, error } = await supabasePlatform.rpc('school_account_memberships',{p_actor:req.session.user.id});
  if (error) throw Object.assign(new Error('School navigation unavailable.'), {status:503});
  const memberships = ((data || []) as {role:string;eligible:boolean;schools:{slug:string;status:string}|null}[]).filter(m=>m.eligible);
  const destination = safeAccountReturn(req.query.returnTo);
  if (destination) {
    const slug = /^\/s\/([^/?#]+)/.exec(destination)?.[1];
    if ((!slug && !destination.startsWith('/platform/')) || memberships.some(m => m.schools?.slug === slug && m.schools?.status === 'active')) return res.redirect(303, destination);
    if(slug)return res.redirect(303,'/schools?school='+encodeURIComponent(slug));
  }
  const available = memberships.filter(m => m.schools && (m.schools?.status === 'active' || (m.schools.status === 'pending' && m.role === 'admin')));
  const remembered=available.find(m=>m.role==='student'&&m.schools?.status==='active'&&m.schools.slug===req.session.lastStudentSchool);
  if(available.length>1&&remembered)return res.redirect(303,schoolLanding(remembered.schools!,remembered.role));
  return res.redirect(303, available.length === 1 ? schoolLanding(available[0].schools!, available[0].role) : '/schools');
}));
router.get('/schools', run(async (req, res) => {
  const user = req.session.user;
  let schools: unknown[] = [], applications: unknown[] = [], joinOptions: unknown[] = [], studentAccess:unknown={confirmed:false,roster:[],discover:[],requests:[]};
  let find=typeof req.query.find==='string'?req.query.find.trim():'';
  const intendedSchool=req.query.school;
  if(intendedSchool!==undefined){
    if(typeof intendedSchool!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(intendedSchool)||intendedSchool.length>63)return failed(res,'Check school link','Open the school link again or find your school below.');
    const intended=await supabasePlatform.rpc('school_presentation',{p_slug:intendedSchool});
    if(intended.error)throw Object.assign(new Error('School lookup unavailable.'),{status:503});
    if(intended.data?.status==='active')find=String(intended.data.name).slice(0,100);
  }
  if((req.query.find!==undefined&&typeof req.query.find!=='string')||find.length>100)return failed(res,'Check school search','Search using a school name of up to 100 characters.');
  if (user) {
    if (await platformAuthority(req, res)) return res.redirect(303, '/platform/schools');
    const [membership, pending, eligible, access] = await Promise.all([
      supabasePlatform.rpc('school_account_memberships',{p_actor:user.id}),
      supabasePlatform.from('school_applications').select('id,name,slug,status,created_at').eq('applicant_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabasePlatform.rpc('school_email_join_options',{p_actor:user.id}),
      supabasePlatform.rpc('school_student_access_options',{p_actor:user.id,p_search:find}),
    ]);
    if (membership.error || pending.error || eligible.error || access.error) throw Object.assign(new Error('School directory unavailable.'), {status:503});

    schools = membership.data || []; applications = pending.data || [];
    const rosterSlugs=new Set<string>((access.data?.roster||[]).map((school:{slug:string})=>school.slug));
    joinOptions=(eligible.data||[]).filter((school:{slug:string})=>!rosterSlugs.has(school.slug));
    const domainSlugs=new Set<string>((eligible.data||[]).filter((school:{can_join:boolean})=>school.can_join!==false).map((school:{slug:string})=>school.slug));
    studentAccess={...access.data,discover:(access.data?.discover||[]).filter((school:{slug:string})=>!domainSlugs.has(school.slug))};
  }
  return res.render('school-directory', { title: 'Your schools — SuggFeed', schools, applications, joinOptions, studentAccess,find,studentNotice:req.query.studentNotice==='requested'?'Your access request was sent. Your school administrator will review it.':'', applicationEnabled: schoolApplicationsConfigured(), legal: legalDetails(), saved: req.query.saved === '1' });
}));
router.post('/schools/join',run(async(req,res)=>{
  const user=await confirmedAccount(req,res);if(!user)return;
  if(await platformAuthority(req,res))return failed(res,'Use platform administration','This account manages schools from the platform dashboard.',403);
  const id=req.body?.domainId;
  if(typeof id!=='string' || !/^[a-f0-9-]{36}$/i.test(id))return failed(res,'Choose your school','Return to Your schools and choose a school matched to your verified email.');
  const emailDomain=user.email.toLowerCase().split('@')[1];
  const {data:domain,error}=await supabasePlatform.from('school_email_domains').select('domain,verification_token').eq('id',id).eq('domain',emailDomain).eq('join_enabled',true).not('verified_at','is',null).maybeSingle();
  if(error)throw Object.assign(new Error('School joining unavailable.'),{status:503});
  if(!domain || !await schoolDomainProofPresent(domain.domain,domain.verification_token))return failed(res,'School joining unavailable','Your school’s domain verification may have changed. Ask its administrator to check Email domains, or use a school invitation.',409);
  const {data:school,error:joinError}=await supabasePlatform.rpc('join_school_by_email_domain',{p_actor:user.id,p_domain:id});
  if(joinError || !school)return failed(res,'Could not join this school','Your email, school readiness, or membership access changed. Return to Your schools or contact the school administrator.',409);
  return res.redirect(303,schoolLanding(school,school.role));
}));
router.post('/schools/apply', run(async (req, res) => {
  const user = await confirmedAccount(req, res); if (!user) return;
  if (!schoolApplicationsConfigured()) return failed(res, 'Applications unavailable', 'The service business identity and monitored privacy contact must be configured before applications are accepted.', 503);
  if (!allowSchoolApplication(req.ip || 'unknown')) return failed(res, 'Application limit reached', 'Please try again later.', 429);
  const { slug, name, contact_name, authority_statement, authority_confirmed } = req.body || {};
  if (typeof slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 63 || typeof name !== 'string' || name.trim().length < 2 || name.length > 200 || typeof contact_name !== 'string' || contact_name.trim().length < 2 || contact_name.length > 200 || typeof authority_statement !== 'string' || authority_statement.trim().length < 20 || authority_statement.length > 2000 || authority_confirmed !== 'yes') return failed(res, 'Check application', 'Complete all application fields and confirm your authority to apply.');
  const { error } = await supabasePlatform.rpc('apply_to_school', { p_actor: user.id, p_slug: slug, p_name: name, p_contact_name: contact_name, p_authority: authority_statement });
  if (error) return failed(res, 'Application not accepted', 'The school address may be unavailable or the daily application limit has been reached. Check your details and try later.');
  return res.redirect(303, '/schools?saved=1');
}));
router.get('/platform', (_req, res) => res.redirect(303, '/platform/schools'));
router.get('/platform/security/retention',run(async(req,res)=>{
 const user=await operator(req,res);if(!user)return;
 const result=await supabasePlatform.rpc('school_retention_inventory');if(result.error)throw Object.assign(new Error('Retention inventory unavailable.'),{status:503});
 res.setHeader('Cache-Control','private, no-store');res.json({success:true,mode:'dry-run',schools:result.data});
}));
router.get('/platform/schools/:id/activate', (_req, res) => res.redirect(303, '/platform/schools#schools'));
router.post('/platform/schools/:id/review', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  const { decision, reference } = req.body || {};
  if (!['approved', 'rejected'].includes(decision) || typeof reference !== 'string' || reference.trim().length < 10 || reference.length > 2000) return failed(res, 'Review required', 'Record the verification outcome and its review reference.');
  if (decision === 'approved' && !schoolApplicationsConfigured()) return failed(res, 'Business setup incomplete', 'Configure the service business identity and monitored privacy contact before approval.', 503);
  const { error } = await supabasePlatform.rpc('review_school_application', { p_application: req.params.id, p_actor: user.id, p_decision: decision, p_reference: reference });
  if (error) return failed(res, 'Review not saved', 'The pending application is unavailable or its school address is already in use.');
  return res.redirect(303, '/platform/schools?saved=1#applications');
}));
router.post('/platform/schools/:id/policies', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  const version = Number(req.body?.version), reference = req.body?.reference;
  if (!Number.isSafeInteger(version) || typeof reference !== 'string' || reference.length > 2000) return failed(res, 'Review required', 'Provide the current policy version and verification reference.');
  const { error } = await supabasePlatform.rpc('approve_school_settings', { p_school: req.params.id, p_actor: user.id, p_version: version, p_reference: reference });
  if (error) return failed(res, 'Policies not approved', 'Complete current notices, contacts and age policy before recording an actual review.');
  return res.redirect(303, '/platform/schools?saved=1#policies');
}));
const schoolStatusActions = {
  suspended: { title: 'Suspend school', description: 'Pause access to the school workspace. Accounts, memberships and school records are retained. A super admin can reactivate it after the required checks pass.' },
  active: { title: 'Reactivate school', description: 'Restore access for eligible members. Reviewed policies, an active school administrator, service setup and school isolation verification are still required.' },
  closed: { title: 'Close school', description: 'Close this workspace to its members and administrators. Accounts and school records are retained. Closed schools cannot be reopened through these controls. Use suspension for a temporary restriction.' },
} as const;
type SchoolStatusAction = keyof typeof schoolStatusActions;
const validSchoolId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validStatusTransition = (from: string, to: SchoolStatusAction) => to === 'active' ? from === 'suspended' : to === 'suspended' ? from === 'active' : ['pending','active','suspended'].includes(from);
router.get('/platform/schools/:id/status', run(async (req,res) => {
  const user=await operator(req,res);if(!user)return;
  if(!validSchoolId(req.params.id) || typeof req.query.to!=='string' || !Object.prototype.hasOwnProperty.call(schoolStatusActions,req.query.to))return failed(res,'Invalid school action','Choose a school action from the platform directory.');
  const target=req.query.to as SchoolStatusAction;
  const {data:school,error}=await supabasePlatform.from('schools').select('id,name,slug,status').eq('id',req.params.id).maybeSingle();
  if(error)throw Object.assign(new Error('School status unavailable.'),{status:503});
  if(!school)return failed(res,'School not found','Return to the platform directory and select an existing school.',404);
  const recovery=platformRecovery(req,user.id,'/platform/schools/'+school.id+'/status?to='+target);
  if(!validStatusTransition(school.status,target)&&!recovery)return failed(res,'School action unavailable','The school’s status changed or this action is not available. Return to the directory to review its current status.',409);
  return res.render('school-status',{...await platformChrome(user.id),section:'schools',currentUrl:req.originalUrl,saved:false,title:schoolStatusActions[target].title+' — '+school.name,school,target,statusReturn:platformReturn(req.query.returnTo,'/platform/schools/'+school.id+'?tab=access'),action:schoolStatusActions[target],submitted:recovery||{},errorMessage:recovery?'Your reason was restored after verification. Review the current school status before submitting again.':''});
}));
router.post('/platform/schools/:id/status', run(async (req,res) => {
  const user=await operator(req,res);if(!user)return;
  const {target,expected_status,confirmation,reason,acknowledged}=req.body||{};
  if(!validSchoolId(req.params.id) || typeof target!=='string' || !Object.prototype.hasOwnProperty.call(schoolStatusActions,target))return failed(res,'Invalid school action','Choose a school action from the platform directory.');
  const status=target as SchoolStatusAction;
  const {data:school,error}=await supabasePlatform.from('schools').select('id,name,slug,status').eq('id',req.params.id).maybeSingle();
  if(error)return res.status(503).render('school-message',{title:'School status unavailable',message:'No change was saved. Your reason is kept briefly in this session; return to the confirmation form to retry.',nextHref:'/platform/schools/'+req.params.id+'/status?to='+target,nextLabel:'Return to confirmation'});
  if(!school)return failed(res,'School not found','Return to the platform directory and select an existing school.',404);
  const submitted={confirmation:typeof confirmation==='string'?confirmation.slice(0,63):'',reason:typeof reason==='string'?reason.slice(0,2000):''};
  const reject=async(message:string,code=400)=>res.status(code).render('school-status',{...await platformChrome(user.id),section:'schools',currentUrl:req.originalUrl,saved:false,title:schoolStatusActions[status].title+' — '+school.name,school,target:status,statusReturn:platformReturn(req.body?.platformReturnTo,'/platform/schools/'+school.id+'?tab=access'),action:schoolStatusActions[status],submitted,errorMessage:message});
  if(!validStatusTransition(school.status,status))return reject('This action is no longer available for the current school status. Your reason is preserved; return to the school record.',409);
  if(expected_status!==school.status)return reject('The school status changed. Review the current status above and confirm again, or return to the directory.',409);
  if(typeof confirmation!=='string' || confirmation!==school.slug || typeof reason!=='string' || reason.trim().length<10 || reason.length>2000 || acknowledged!=='yes')return reject('Enter the exact school address slug, a reason of 10–2,000 characters, and confirm the effect of this change.');
  if(status==='active' && !schoolApplicationsConfigured() && school.id!==DEMO_SCHOOL_ID)return reject('Complete service setup before reactivating a real school.',409);
  const result=await supabasePlatform.rpc('manage_school_status',{p_school:school.id,p_actor:user.id,p_status:status,p_expected_status:expected_status,p_confirmation:confirmation,p_reason:reason.trim()});
  if(result.error)return reject('The change was not saved. Check current school status, reviewed policies, administrator access and isolation verification, then try again. If it persists, ask the service operator to check the status-management migration.',409);
  delete req.session.platformFormRecovery;return res.redirect(303,platformSaved(platformReturn(req.body?.platformReturnTo,'/platform/schools/'+school.id+'?tab=access')));
}));
router.post('/platform/schools/:id/activate', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  if(!validSchoolId(req.params.id))return failed(res,'Invalid school','Select an existing school from the directory.');
  const [policyResult,schoolResult]=await Promise.all([
    supabasePlatform.from('school_settings').select('approved_at').eq('school_id',req.params.id).maybeSingle(),
    supabasePlatform.from('schools').select('id,slug,status').eq('id',req.params.id).maybeSingle(),
  ]);
  if(policyResult.error || schoolResult.error)throw Object.assign(new Error('School activation unavailable.'),{status:503});
  const school=schoolResult.data;
  if(!school || school.status!=='pending')return failed(res,'Activation unavailable','Only pending schools use this action. Use Reactivate school for a suspended workspace.',409);
  if ((!schoolApplicationsConfigured() && school.id !== DEMO_SCHOOL_ID) || !policyResult.data?.approved_at) return failed(res, 'Activation unavailable', 'Reviewed policies are required. Real schools also need completed service business configuration.');
  const { error } = await supabasePlatform.rpc('manage_school_status', { p_school:school.id,p_actor:user.id,p_status:'active',p_expected_status:'pending',p_confirmation:school.slug,p_reason:'Initial workspace activation requested from the platform dashboard.' });
  if (error) return failed(res, 'Activation locked', 'The isolation release gate, school status and administrator requirements must all pass before activation.', 409);
  return res.redirect(303,platformSaved(platformReturn(req.body?.platformReturnTo,'/platform/schools/'+school.id)));
}));
async function renderSettings(req: Request, res: Response, context: NonNullable<Awaited<ReturnType<typeof schoolAdmin>>>, submitted?: Record<string, string | number>, errorMessage?: string, enrollmentDraft?:{version:number;mode:string;text:string}) {
  const [{data,error},domains,enrollment,pendingPolicy,customization]=await Promise.all([supabasePlatform.from('school_settings').select('*').eq('school_id',context.school.id).maybeSingle(),supabasePlatform.from('school_email_domains').select('id,domain,verification_token,verified_at,join_enabled').eq('school_id',context.school.id).order('created_at'),supabasePlatform.rpc('get_school_enrollment',{p_school:context.school.id,p_actor:context.user.id}),supabasePlatform.from('school_policy_drafts').select('version,settings,updated_at').eq('school_id',context.school.id).maybeSingle(),supabasePlatform.from('school_customization_state').select('editing_enabled').eq('school_id',context.school.id).maybeSingle()]);
  if (error || domains.error || enrollment.error || pendingPolicy.error) throw Object.assign(new Error('School settings unavailable.'), {status:503});
  // Keep form Origin valid without exposing invitation paths in Referer.
  res.setHeader('Referrer-Policy', 'strict-origin');
  const draftPolicy=pendingPolicy.data?{...pendingPolicy.data.settings,version:pendingPolicy.data.version}:null;
  const displayedSettings = submitted ? { ...(draftPolicy || data || {}), ...submitted } : draftPolicy || data;
  const domainNotice=req.session.schoolDomainNotice || '';delete req.session.schoolDomainNotice;
  const enrollmentNotice=req.session.schoolEnrollmentNotice || '';delete req.session.schoolEnrollmentNotice;
  return res.status(errorMessage ? 400 : 200).render('school-settings', { title: 'School settings — ' + context.school.name, school: context.school, settingsSection: enrollmentDraft?'school-enrollment':req.path.endsWith('/domains')?'school-domains':(['school-policies','school-contacts','school-access'].includes(req.body?.section)?req.body.section:'school-overview'), customizationEnabled: !customization.error && customization.data?.editing_enabled && process.env.SCHOOL_CUSTOMIZATION_EDITING_DISABLED!=='true', enrollment:enrollment.data,enrollmentDraft,enrollmentNotice,enrollmentAction:invitationBase(req,context.school)+'/enrollment', domains:domains.data || [],domainAction:invitationBase(req,context.school)+'/domains',domainNotice, savedSettings: data, pendingPolicy:pendingPolicy.data, settings: displayedSettings || { version: 1, publication_policy: 'private', retention_days: 365 }, settingsAction: req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/settings' : '/s/' + context.school.slug + '/admin/school-settings', invitationAction: req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/invitations' : '/s/' + context.school.slug + '/admin/invitations', saved: !errorMessage && req.query.saved === '1', errorMessage });
}
router.get(['/s/:schoolSlug/admin/school-settings', '/platform/schools/:id/settings'], run(async (req, res) => {
  const context = await schoolAdmin(req, res); if (!context) return;
  return renderSettings(req, res, context);
}));
router.post(['/s/:schoolSlug/admin/school-settings', '/platform/schools/:id/settings'], run(async (req, res) => {
  const context = await schoolAdmin(req, res); if (!context) return;
  const version = Number(req.body?.version); const settings: Record<string, string | number> = {};
  for (const field of schoolSettingFields) {
    const value = req.body?.[field];
    if (typeof value !== 'string' || value.length > (field.endsWith('_notice') ? 20000 : field === 'age_policy' ? 4000 : 254)) return failed(res, 'Check settings', 'Complete all policy fields within the stated limits.');
    settings[field] = field === 'retention_days' ? Number(value) : value.trim();
  }
  if (!Number.isSafeInteger(version)) return failed(res, 'Reload settings', 'Reload the current settings before saving.');
  const { error } = await supabasePlatform.rpc('update_school_settings', { p_school: context.school.id, p_actor: context.user.id, p_version: version, p_settings: settings });
  if (error) return renderSettings(req, res, context, { ...settings, version }, 'Your changes were not saved. Check required fields and valid emails. If another administrator saved a newer version, reload this page before trying again. Your entered text is retained below.');
  return res.redirect(303, (req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/settings' : '/s/' + context.school.slug + '/admin/school-settings') + '?saved=1#'+(['school-policies','school-contacts','school-access'].includes(req.body?.section)?req.body.section:'school-policies'));
}));
router.post(['/s/:schoolSlug/admin/enrollment','/platform/schools/:id/enrollment'],run(async(req,res)=>{
  const context=await schoolAdmin(req,res);if(!context)return;
  const version=Number(req.body?.version),mode=req.body?.mode,text=req.body?.emails;
  const draft={version,mode:typeof mode==='string'?mode:'email',text:typeof text==='string'?text:''};
  let emails:string[];
  try{
    if(!Number.isSafeInteger(version) || version<0 || !['email','roster'].includes(mode) || req.body?.reviewed!=='yes')throw new Error('Choose an access rule and confirm that you reviewed the complete roster.');
    emails=schoolRosterEmails(text);
  }catch(error){return renderSettings(req,res,context,undefined,error instanceof Error?error.message:'Check the roster and try again.',draft);}
  const {error}=await supabasePlatform.rpc('save_school_enrollment',{p_school:context.school.id,p_actor:context.user.id,p_version:version,p_mode:mode,p_emails:emails});
  if(error)return renderSettings(req,res,context,undefined,'Enrollment settings were not saved. Another administrator may have changed the roster. Reload the latest version before replacing it; your draft remains below.',draft);
  req.session.schoolEnrollmentNotice='Enrollment settings saved. Student eligibility now follows this rule. Accounts, ideas and staff roles were preserved.';
  return res.redirect(303,invitationBase(req,context.school)+(req.path.toLowerCase().startsWith('/platform/')?'/settings':'/school-settings')+'#school-enrollment');
}));
router.post(['/s/:schoolSlug/admin/domains','/platform/schools/:id/domains'],run(async(req,res)=>{
  const context=await schoolAdmin(req,res);if(!context)return;
  const domain=schoolEmailDomain(req.body?.domain);
  if(!domain)return failed(res,'Use a school email domain','Enter only a school-controlled domain, such as my.cspc.edu.ph. Personal email providers and @ prefixes are not supported here. Use Student joining for approved email lists or access requests.');
  const {error}=await supabasePlatform.rpc('request_school_email_domain',{p_school:context.school.id,p_actor:context.user.id,p_domain:domain,p_token:invitationToken()});
  req.session.schoolDomainNotice=error?'Domain was not added. It may already be listed, or the school has reached its ten-domain limit.':'Domain added. Publish its DNS TXT record, verify it, then enable student joining.';
  return res.redirect(303,invitationBase(req,context.school)+(req.path.toLowerCase().startsWith('/platform/')?'/settings':'/school-settings')+'#school-domains');
}));
router.post(['/s/:schoolSlug/admin/domains/:domainId','/platform/schools/:id/domains/:domainId'],run(async(req,res)=>{
  const context=await schoolAdmin(req,res);if(!context)return;
  const {domainId}=req.params,action=req.body?.action;
  if(typeof domainId!=='string' || !/^[a-f0-9-]{36}$/i.test(domainId) || !['verify','enable','disable','remove'].includes(action))return failed(res,'Choose a domain action','Return to School settings to manage this domain.');
  if(action==='verify' || action==='enable'){
    const {data:domain,error}=await supabasePlatform.from('school_email_domains').select('domain,verification_token').eq('school_id',context.school.id).eq('id',domainId).maybeSingle();
    if(error)throw Object.assign(new Error('School domain unavailable.'),{status:503});
    if(!domain || !await schoolDomainProofPresent(domain.domain,domain.verification_token)){
      req.session.schoolDomainNotice='DNS verification failed. Add the exact TXT host and value below, wait for DNS propagation, then retry. No settings were changed.';
      return res.redirect(303,invitationBase(req,context.school)+(req.path.toLowerCase().startsWith('/platform/')?'/settings':'/school-settings')+'#school-domains');
    }
  }
  const {error}=await supabasePlatform.rpc('configure_school_email_domain',{p_school:context.school.id,p_actor:context.user.id,p_domain:domainId,p_action:action});
  req.session.schoolDomainNotice=error?'The domain change was not saved. Verification requires an unclaimed domain; enabling also requires an active school with reviewed policies.':{verify:'Domain verified. You can now enable student joining.',enable:'Student joining is enabled for this exact email domain.',disable:'Student joining is disabled. Existing members keep their access.',remove:'Domain removed. Existing members keep their access.'}[action as string];
  return res.redirect(303,invitationBase(req,context.school)+(req.path.toLowerCase().startsWith('/platform/')?'/settings':'/school-settings')+'#school-domains');
}));
function invitationBase(req: Request, school: {id:string;slug:string}) {
  return req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/'+school.id : '/s/'+school.slug+'/admin';
}
async function renderInvitations(req: Request,res: Response,context: NonNullable<Awaited<ReturnType<typeof schoolAdmin>>>,submitted?:{email:string;role:string;delivery:string},errorMessage?:string) {
  const [history,settings]=await Promise.all([
    supabasePlatform.rpc('list_school_member_invitations',{p_school:context.school.id,p_actor:context.user.id}),
    supabasePlatform.from('school_settings').select('approved_at').eq('school_id',context.school.id).maybeSingle(),
  ]);
  if(history.error || settings.error)throw Object.assign(new Error('Invitations unavailable.'),{status:503});
  const receipt=req.session.schoolInvitation?.schoolId===context.school.id?req.session.schoolInvitation:null;
  if(receipt){receipt.delivery ||= 'link';delete req.session.schoolInvitation;}
  const base=invitationBase(req,context.school);
  res.setHeader('Referrer-Policy','strict-origin');res.setHeader('Cache-Control','no-store');
  return res.status(errorMessage?400:200).render('school-invitations',{title:'Member invitations — '+context.school.name,school:context.school,roles:invitationRoles,invitations:history.data || [],receipt,submitted,errorMessage,emailReady:invitationEmailConfigured(),ready:context.school.status==='active' && !!settings.data?.approved_at,action:base+'/invitations',settingsUrl:base+(req.path.toLowerCase().startsWith('/platform/')?'/settings':'/school-settings'),revoked:req.query.revoked==='1'});
}
router.get(['/s/:schoolSlug/admin/invitations','/platform/schools/:id/invitations'],run(async(req,res)=>{
  const context=await schoolAdmin(req,res);if(!context)return;return renderInvitations(req,res,context);
}));
router.post(['/s/:schoolSlug/admin/invitations','/platform/schools/:id/invitations'],run(async(req,res)=>{
  const context=await schoolAdmin(req,res);if(!context)return;
  const values={email:typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'',role:typeof req.body?.role==='string'?req.body.role:'student',delivery:typeof req.body?.delivery==='string'?req.body.delivery:'link'};
  if(values.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || !Object.prototype.hasOwnProperty.call(invitationRoles,values.role) || !['email','link'].includes(values.delivery))return renderInvitations(req,res,context,values,'Enter a valid email address and choose a role and invitation method.');
  if(values.delivery==='email' && !invitationEmailConfigured())return renderInvitations(req,res,context,values,'Email delivery is not available yet. Choose “Copy a link” to invite this person.');
  const token=invitationToken();
  const result=await supabasePlatform.rpc('create_school_member_invitation',{p_school:context.school.id,p_actor:context.user.id,p_hash:invitationHash(token),p_email:values.email,p_role:values.role,p_delivery:values.delivery});
  if(result.error)return renderInvitations(req,res,context,values,result.error.code==='23505'?'A pending invitation already exists for this email. Check the recent invitations below; revoke the old one before replacing it.':result.error.code==='22023'?'This account may already be a member, or the school policies need review. Check your members and school settings.':'The invitation could not be created. Check that the school is active and try again.');
  const receipt={schoolId:context.school.id,token,email:values.email,role:values.role as InvitationRole,expires:result.data.expires_at,delivery:values.delivery==='email'?'sending':'link',warning:''};
  req.session.schoolInvitation=receipt;
  await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
  if(values.delivery==='email'){
    receipt.delivery=await sendSchoolInvitation({id:result.data.id,school:context.school.name,email:values.email,role:values.role as InvitationRole,token,expires:result.data.expires_at});
    const recorded=await supabasePlatform.rpc('record_school_invitation_delivery',{p_school:context.school.id,p_actor:context.user.id,p_invitation:result.data.id,p_state:receipt.delivery});
    if(recorded.error)receipt.warning='The email result is shown here, but the activity list could not be updated.';
    req.session.schoolInvitation=receipt;
    await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
  }
  return res.redirect(303,invitationBase(req,context.school)+'/invitations');
}));
router.post(['/s/:schoolSlug/admin/invitations/:invitation/revoke','/platform/schools/:id/invitations/:invitation/revoke'],run(async(req,res)=>{
  const context=await schoolAdmin(req,res);if(!context)return;
  if(typeof req.params.invitation!=='string' || !/^[a-f0-9-]{36}$/i.test(req.params.invitation))return renderInvitations(req,res,context,undefined,'Choose an invitation from the list.');
  const result=await supabasePlatform.rpc('revoke_school_member_invitation',{p_school:context.school.id,p_actor:context.user.id,p_invitation:req.params.invitation});
  if(result.error)return renderInvitations(req,res,context,undefined,'This invitation could not be revoked. It may have been accepted already.');
  return res.redirect(303,invitationBase(req,context.school)+'/invitations?revoked=1');
}));
router.get('/schools/invitations/:token',run(async(req,res)=>{
  res.setHeader('Referrer-Policy','strict-origin');
  const token=req.params.token;
  if(typeof token!=='string' || !validInvitationToken(token))return failed(res,'Invitation unavailable','Check your invitation link.',404);
  const {data,error}=await supabasePlatform.rpc('school_invitation_preview',{p_hash:invitationHash(token),p_actor:req.session.user?.id || null});
  if(error)throw Object.assign(new Error('Invitation unavailable.'),{status:503});
  if(data?.state==='pending'){
    req.session.invitationReturn={path:'/schools/invitations/'+token,expires:new Date(data.expires_at).getTime()};
    await new Promise<void>((resolve,reject)=>req.session.save(error=>error?reject(error):resolve()));
  }
  return res.status(data?200:404).render('school-invitation',{title:'School invitation — SuggFeed',token,invitation:data,roles:invitationRoles});
}));
router.post('/schools/invitations/:token',run(async(req,res)=>{
  const user=await confirmedAccount(req,res);if(!user)return;
  const token=req.params.token;
  if(typeof token!=='string' || !validInvitationToken(token))return failed(res,'Invitation unavailable','Check your invitation link.',404);
  const {data:preview,error:previewError}=await supabasePlatform.rpc('school_invitation_preview',{p_hash:invitationHash(token),p_actor:user.id});
  if(previewError)throw Object.assign(new Error('Invitation unavailable.'),{status:503});
  const {error}=await supabasePlatform.rpc('accept_school_invitation',{p_actor:user.id,p_hash:invitationHash(token)});
  if(error)return res.status(400).render('school-invitation',{title:'School invitation — SuggFeed',token,invitation:preview,roles:invitationRoles,errorMessage:'Your membership was not changed. Check that you are using the invited, confirmed email account. If the invitation expired or was revoked, ask for a new one. Schools requiring an enrollment roster must also confirm student eligibility.'});
  return res.redirect(303,schoolLanding({slug:preview.school_slug,status:'active'},preview.role));
}));
router.get(['/s/:schoolSlug/privacy', '/s/:schoolSlug/terms'], run(async (req, res) => {
  const { data: school, error } = await supabasePlatform.from('schools').select('id,slug,name,status').eq('slug', req.params.schoolSlug).eq('status', 'active').maybeSingle();
  if (error) throw Object.assign(new Error('School notice unavailable.'), {status:503});
  if (!school) return failed(res, 'School unavailable', 'This school is unavailable.', 404);
  const { data: settings, error: settingsError } = await supabasePlatform.from('school_settings').select('*').eq('school_id', school.id).not('approved_at', 'is', null).maybeSingle();
  if (settingsError) throw Object.assign(new Error('School notice unavailable.'), {status:503});
  if (!settings) return failed(res, 'Notice unavailable', 'This school has not published reviewed notices.', 404);
  Object.assign(res.locals, { schoolBase: '/s/' + school.slug, schoolId: school.id, schoolName: school.name });
  return res.render('school-notice', { title: (req.path.endsWith('/privacy') ? 'Privacy notice' : 'Terms') + ' — ' + school.name, notice: req.path.endsWith('/privacy') ? settings.privacy_notice : settings.terms_notice, school, settings, legal: legalDetails() });
}));
export default router;
