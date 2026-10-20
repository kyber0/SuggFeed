import {schoolRosterEmails} from '../lib/school-enrollment';
import {schoolEmailDomain,schoolDomainProofPresent} from '../lib/school-domains';
import { platformAuthority, schoolLanding, safeAccountReturn } from '../lib/navigation-context';
import { invitationEmailConfigured, invitationRoles, sendSchoolInvitation, type InvitationRole } from '../lib/invitation-email';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { supabasePlatform } from '../lib/supabase';
import { requireStrongAuth } from '../lib/auth-assurance';
import { legalDetails } from '../lib/legal';
import { DEMO_SCHOOL_ID, allowSchoolApplication, invitationHash, invitationToken, schoolApplicationsConfigured, schoolSettingFields, validInvitationToken } from '../lib/school-onboarding';

declare module 'express-session' { interface SessionData { schoolEnrollmentNotice?:string; schoolDomainNotice?:string; invitationReturn?: {path:string;expires:number}; schoolInvitation?: { schoolId: string; token: string; email?: string; role?: InvitationRole; expires?: string; delivery?: string; warning?: string }; } }

const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
function account(req: Request, res: Response) {
  if (!req.session.user) { res.status(401).render('school-message', { title: 'Sign in required', message: 'Sign in with your verified account, then return to this page.' }); return null; }
  return req.session.user;
}
export async function operator(req: Request, res: Response) {
  const user = account(req, res); if (!user) return null;
  const allowed = await platformAuthority(req, res);
  if (!allowed) { res.status(403).render('school-message', { title: 'Access denied', message: 'Platform operator permission is required.' }); return null; }
  Object.assign(res.locals, { isPlatformOperator: true, platformDashboard: true });
  let assured = false;
  requireStrongAuth(req, res, () => { assured = true; });
  return assured ? user : null;
}
async function confirmedAccount(req: Request, res: Response) {
  const user = account(req, res); if (!user) return null;
  const { data, error } = await supabasePlatform.auth.getUser(req.session.accessToken || '');
  if (error || !data.user || data.user.id !== user.id || !data.user.email_confirmed_at || !data.user.email) {
    res.status(403).render('school-message', { title: 'Verified email required', message: 'Confirm your account email before continuing.' }); return null;
  }
  return {...user,email:data.user.email};
}
export async function schoolAdmin(req: Request, res: Response) {
  const user = account(req, res); if (!user) return null;
  const platformSettings = req.path.toLowerCase().startsWith('/platform/');
  if (platformSettings && !await operator(req, res)) return null;
  const { data: school, error } = await supabasePlatform.from('schools').select('id,slug,name,status').eq(platformSettings ? 'id' : 'slug', platformSettings ? req.params.id : req.params.schoolSlug).maybeSingle();
  if (error) throw Object.assign(new Error('School unavailable.'), {status:503});
  const { data: membership, error: memberError } = school ? await supabasePlatform.from('school_memberships').select('role,status').eq('school_id', school.id).eq('user_id', user.id).maybeSingle() : { data: null, error: null };
  if (memberError) throw Object.assign(new Error('School permissions unavailable.'), {status:503});
  if (!school || school.status === 'closed' || membership?.role !== 'admin' || membership.status !== 'active') {
    res.status(403).render('school-message', { title: 'Access denied', message: 'School administrator permission is required.' }); return null;
  }
  let assured = false;
  requireStrongAuth(req, res, () => { assured = true; });
  if (!assured) return null;
  Object.assign(res.locals, { accountArea: true, schoolBase: platformSettings ? '' : '/s/' + school.slug, schoolId: school.id, schoolName: school.name, user: { ...user, role: 'admin' } });
  return { user, school };
}
function failed(res: Response, title: string, message: string, status = 400) { return res.status(status).render('school-message', { title, message }); }
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
    const slug = /^\/s\/([^/]+)/.exec(destination)?.[1];
    if ((!slug && !destination.startsWith('/platform/')) || memberships.some(m => m.schools?.slug === slug && m.schools?.status === 'active')) return res.redirect(303, destination);
  }
  const available = memberships.filter(m => m.schools && (m.schools?.status === 'active' || (m.schools.status === 'pending' && m.role === 'admin')));
  return res.redirect(303, available.length === 1 ? schoolLanding(available[0].schools!, available[0].role) : '/schools');
}));
router.get('/schools', run(async (req, res) => {
  const user = req.session.user;
  let schools: unknown[] = [], applications: unknown[] = [], joinOptions: unknown[] = [];
  if (user) {
    if (await platformAuthority(req, res)) return res.redirect(303, '/platform/schools');
    const [membership, pending, eligible] = await Promise.all([
      supabasePlatform.rpc('school_account_memberships',{p_actor:user.id}),
      supabasePlatform.from('school_applications').select('id,name,slug,status,created_at').eq('applicant_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabasePlatform.rpc('school_email_join_options',{p_actor:user.id}),
    ]);
    if (membership.error || pending.error || eligible.error) throw Object.assign(new Error('School directory unavailable.'), {status:503});

    schools = membership.data || []; applications = pending.data || [];joinOptions=eligible.data || [];
  }
  return res.render('school-directory', { title: 'Your schools — SuggFeed', schools, applications, joinOptions, applicationEnabled: schoolApplicationsConfigured(), legal: legalDetails(), saved: req.query.saved === '1' });
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
router.get('/platform/schools', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  const page = req.query.page === undefined ? 0 : Number(req.query.page);
  const applicationPage = req.query.applicationPage === undefined ? 0 : Number(req.query.applicationPage);
  if ([page, applicationPage].some(value => !Number.isSafeInteger(value) || value < 0 || value > 10000)) return failed(res, 'Invalid review page', 'Choose a valid school review page.');
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if ((req.query.q !== undefined && typeof req.query.q !== 'string') || search.length > 100 || (req.query.status !== undefined && typeof req.query.status !== 'string') || !['', 'pending', 'active', 'suspended', 'closed'].includes(status)) return failed(res, 'Invalid school filter', 'Use a school name of up to 100 characters and a listed status.');
  let schoolQuery = supabasePlatform.from('schools').select('id,slug,name,status');
  if (search) schoolQuery = schoolQuery.ilike('name', '%' + search.replace(/[\\%_]/g, character => '\\' + character) + '%');
  if (status) schoolQuery = schoolQuery.eq('status', status);
  const [applications, schools, release] = await Promise.all([
    supabasePlatform.from('school_applications').select('id,name,slug,contact_name,contact_email,authority_statement,created_at').eq('status', 'pending').order('created_at').order('id').range(applicationPage * 12, applicationPage * 12 + 12),
    schoolQuery.order('created_at', { ascending: false }).order('id').range(page * 24, page * 24 + 24),
    supabasePlatform.rpc('school_release_status', { p_actor: user.id }),
  ]);
  if (applications.error || schools.error || release.error) throw Object.assign(new Error('School review unavailable.'), {status:503});
  const visibleSchools = (schools.data || []).slice(0, 24);
  const ids = visibleSchools.map(school => school.id);
  const [settings, memberships,policyDrafts] = visibleSchools.length ? await Promise.all([
    supabasePlatform.from('school_settings').select('school_id,version,privacy_notice,terms_notice,privacy_contact,school_contact,age_policy,publication_policy,retention_days,approved_at').in('school_id', ids),
    supabasePlatform.from('school_memberships').select('school_id').eq('user_id', user.id).eq('role', 'admin').eq('status', 'active').in('school_id', ids),
    supabasePlatform.from('school_policy_drafts').select('school_id,version,settings').in('school_id',ids),
  ]) : [{ data: [], error: null }, { data: [], error: null },{data:[],error:null}];
  if (settings.error || memberships.error || policyDrafts.error) throw Object.assign(new Error('School policy review unavailable.'), {status:503});
  return res.render('platform-schools', { title: 'Super admin dashboard — SuggFeed', release: release.data, demoSchoolId: DEMO_SCHOOL_ID, applications: (applications.data || []).slice(0, 12), schools: visibleSchools, settings:(settings.data || []).map(s=>{const draft=policyDrafts.data?.find(d=>d.school_id===s.school_id);return draft?{...s,...draft.settings,version:draft.version,approved_at:null,live_approved_at:s.approved_at}:s;}), adminSchoolIds: (memberships.data || []).map(membership => membership.school_id), businessReady: schoolApplicationsConfigured(), legal: legalDetails(), search, status, page, applicationPage, nextPage: (schools.data?.length || 0) > 24, nextApplicationPage: (applications.data?.length || 0) > 12, saved: req.query.saved === '1' });
}));
router.post('/platform/schools/:id/review', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  const { decision, reference } = req.body || {};
  if (!['approved', 'rejected'].includes(decision) || typeof reference !== 'string' || reference.trim().length < 10 || reference.length > 2000) return failed(res, 'Review required', 'Record the verification outcome and its review reference.');
  if (decision === 'approved' && !schoolApplicationsConfigured()) return failed(res, 'Business setup incomplete', 'Configure the service business identity and monitored privacy contact before approval.', 503);
  const { error } = await supabasePlatform.rpc('review_school_application', { p_application: req.params.id, p_actor: user.id, p_decision: decision, p_reference: reference });
  if (error) return failed(res, 'Review not saved', 'The pending application is unavailable or its school address is already in use.');
  return res.redirect(303, '/platform/schools?saved=1');
}));
router.post('/platform/schools/:id/policies', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  const version = Number(req.body?.version), reference = req.body?.reference;
  if (!Number.isSafeInteger(version) || typeof reference !== 'string' || reference.length > 2000) return failed(res, 'Review required', 'Provide the current policy version and verification reference.');
  const { error } = await supabasePlatform.rpc('approve_school_settings', { p_school: req.params.id, p_actor: user.id, p_version: version, p_reference: reference });
  if (error) return failed(res, 'Policies not approved', 'Complete current notices, contacts and age policy before recording an actual review.');
  return res.redirect(303, '/platform/schools?saved=1');
}));
router.post('/platform/schools/:id/activate', run(async (req, res) => {
  const user = await operator(req, res); if (!user) return;
  const { data: policy, error: policyError } = await supabasePlatform.from('school_settings').select('approved_at').eq('school_id', req.params.id).maybeSingle();
  if (policyError) throw Object.assign(new Error('School policy unavailable.'), {status:503});
  if ((!schoolApplicationsConfigured() && req.params.id !== DEMO_SCHOOL_ID) || !policy?.approved_at) return failed(res, 'Activation unavailable', 'Reviewed policies are required. Real schools also need completed service business configuration.');
  const { error } = await supabasePlatform.rpc('change_school_status', { p_school: req.params.id, p_actor: user.id, p_status: 'active' });
  if (error) return failed(res, 'Activation locked', 'The isolation release gate, school status and administrator requirements must all pass before activation.', 409);
  return res.redirect(303, '/platform/schools?saved=1');
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
  return res.status(errorMessage ? 400 : 200).render('school-settings', { title: 'School settings — ' + context.school.name, school: context.school, customizationEnabled: !customization.error && customization.data?.editing_enabled && process.env.SCHOOL_CUSTOMIZATION_EDITING_DISABLED!=='true', enrollment:enrollment.data,enrollmentDraft,enrollmentNotice,enrollmentAction:invitationBase(req,context.school)+'/enrollment', domains:domains.data || [],domainAction:invitationBase(req,context.school)+'/domains',domainNotice, savedSettings: data, pendingPolicy:pendingPolicy.data, settings: displayedSettings || { version: 1, publication_policy: 'private', retention_days: 365 }, settingsAction: req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/settings' : '/s/' + context.school.slug + '/admin/school-settings', invitationAction: req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/invitations' : '/s/' + context.school.slug + '/admin/invitations', saved: !errorMessage && req.query.saved === '1', errorMessage });
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
  return res.redirect(303, (req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/settings' : '/s/' + context.school.slug + '/admin/school-settings') + '?saved=1');
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
  if(!domain)return failed(res,'Use a school email domain','Enter only a school-controlled domain, such as my.cspc.edu.ph. Personal email providers and @ prefixes are not supported.');
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
