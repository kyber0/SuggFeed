import { Router, type Request, type Response, type NextFunction } from 'express';
import { supabasePlatform } from '../lib/supabase';
import { requireStrongAuth } from '../lib/auth-assurance';
import { legalDetails } from '../lib/legal';
import { allowSchoolApplication, invitationHash, invitationToken, schoolApplicationsConfigured, schoolSettingFields, validInvitationToken } from '../lib/school-onboarding';

declare module 'express-session' { interface SessionData { schoolInvitation?: { schoolId: string; token: string }; } }

const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
function account(req: Request, res: Response) {
  if (!req.session.user) { res.status(401).render('school-message', { title: 'Sign in required', message: 'Sign in with your verified account, then return to this page.' }); return null; }
  return req.session.user;
}
async function operator(req: Request, res: Response) {
  const user = account(req, res); if (!user) return null;
  const { data, error } = await supabasePlatform.rpc('platform_operator_active', { p_actor: user.id });
  if (error) throw Object.assign(new Error('Platform authorization unavailable.'), {status:503});
  if (data !== true) { res.status(403).render('school-message', { title: 'Access denied', message: 'Platform operator permission is required.' }); return null; }
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
  return user;
}
async function schoolAdmin(req: Request, res: Response) {
  const user = account(req, res); if (!user) return null;
  const { data: school, error } = await supabasePlatform.from('schools').select('id,slug,name,status').eq('slug', req.params.schoolSlug).maybeSingle();
  if (error) throw Object.assign(new Error('School unavailable.'), {status:503});
  const { data: membership, error: memberError } = school ? await supabasePlatform.from('school_memberships').select('role,status').eq('school_id', school.id).eq('user_id', user.id).maybeSingle() : { data: null, error: null };
  if (memberError) throw Object.assign(new Error('School permissions unavailable.'), {status:503});
  if (!school || school.status === 'closed' || membership?.role !== 'admin' || membership.status !== 'active') {
    res.status(403).render('school-message', { title: 'Access denied', message: 'School administrator permission is required.' }); return null;
  }
  let assured = false;
  requireStrongAuth(req, res, () => { assured = true; });
  if (!assured) return null;
  Object.assign(res.locals, { schoolBase: '/s/' + school.slug, schoolId: school.id, schoolName: school.name, user: { ...user, role: 'admin' } });
  return { user, school };
}
function failed(res: Response, title: string, message: string, status = 400) { return res.status(status).render('school-message', { title, message }); }
router.use((req, res, next) => {
  if (/^\/(?:schools|platform\/schools)(?:\/|$)/.test(req.path) || /^\/s\/[^/]+\/(?:privacy|terms|admin\/(?:school-settings|invitations))(?:\/|$)/.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/schools', run(async (req, res) => {
  const user = req.session.user;
  let schools: unknown[] = [], applications: unknown[] = [], isPlatformOperator = false;
  if (user) {
    const [membership, pending, permission] = await Promise.all([
      supabasePlatform.from('school_memberships').select('school_id,role,status,schools(id,slug,name,status)').eq('user_id', user.id).eq('status', 'active'),
      supabasePlatform.from('school_applications').select('id,name,slug,status,created_at').eq('applicant_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabasePlatform.rpc('platform_operator_active', { p_actor: user.id }),
    ]);
    if (membership.error || pending.error) throw Object.assign(new Error('School directory unavailable.'), {status:503});
    isPlatformOperator = !permission.error && permission.data === true;
    schools = membership.data || []; applications = pending.data || [];
  }
  return res.render('school-directory', { title: 'Your schools — SuggFeed', schools, applications, isPlatformOperator, applicationEnabled: schoolApplicationsConfigured(), legal: legalDetails(), saved: req.query.saved === '1' });
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
router.get('/platform/schools', run(async (req, res) => {
  if (!await operator(req, res)) return;
  const page = req.query.page === undefined ? 0 : Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return failed(res, 'Invalid review page', 'Choose a valid school review page.');
  const [applications, schools, settings] = await Promise.all([
    supabasePlatform.from('school_applications').select('*').eq('status', 'pending').order('created_at').range(page * 100, page * 100 + 99),
    supabasePlatform.from('schools').select('id,slug,name,status').order('created_at', { ascending: false }).range(page * 100, page * 100 + 99),
    supabasePlatform.from('school_settings').select('*').order('updated_at', { ascending: false }).range(page * 100, page * 100 + 99),
  ]);
  if (applications.error || schools.error || settings.error) throw Object.assign(new Error('School review unavailable.'), {status:503});
  return res.render('platform-schools', { title: 'School review — SuggFeed', applications: applications.data || [], schools: schools.data || [], settings: settings.data || [], page, nextPage: [applications.data, schools.data, settings.data].some(rows => rows?.length === 100), saved: req.query.saved === '1' });
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
  if (!schoolApplicationsConfigured() || !policy?.approved_at) return failed(res, 'Activation unavailable', 'Business configuration and reviewed school policies are required.');
  const { error } = await supabasePlatform.rpc('change_school_status', { p_school: req.params.id, p_actor: user.id, p_status: 'active' });
  if (error) return failed(res, 'Activation locked', 'The isolation release gate, school status and administrator requirements must all pass before activation.', 409);
  return res.redirect(303, '/platform/schools?saved=1');
}));
router.get('/s/:schoolSlug/admin/school-settings', run(async (req, res) => {
  const context = await schoolAdmin(req, res); if (!context) return;
  const { data, error } = await supabasePlatform.from('school_settings').select('*').eq('school_id', context.school.id).maybeSingle();
  if (error) throw Object.assign(new Error('School settings unavailable.'), {status:503});
  const invitation = req.session.schoolInvitation;
  const invitationUrl = invitation && invitation.schoolId === context.school.id ? '/schools/invitations/' + invitation.token : null;
  if (invitationUrl) delete req.session.schoolInvitation;
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.render('school-settings', { title: 'School settings — ' + context.school.name, school: context.school, settings: data || { version: 1, publication_policy: 'private', retention_days: 365 }, saved: req.query.saved === '1', invitationUrl });
}));
router.post('/s/:schoolSlug/admin/school-settings', run(async (req, res) => {
  const context = await schoolAdmin(req, res); if (!context) return;
  const version = Number(req.body?.version); const settings: Record<string, string | number> = {};
  for (const field of schoolSettingFields) {
    const value = req.body?.[field];
    if (typeof value !== 'string' || value.length > (field.endsWith('_notice') ? 20000 : field === 'age_policy' ? 4000 : 254)) return failed(res, 'Check settings', 'Complete all policy fields within the stated limits.');
    settings[field] = field === 'retention_days' ? Number(value) : value.trim();
  }
  if (!Number.isSafeInteger(version)) return failed(res, 'Reload settings', 'Reload the current settings before saving.');
  const { error } = await supabasePlatform.rpc('update_school_settings', { p_school: context.school.id, p_actor: context.user.id, p_version: version, p_settings: settings });
  if (error) return failed(res, 'Settings not saved', 'Complete the required notices, valid contact emails, age policy and retention days. Reload if another administrator saved changes.');
  return res.redirect(303, '/s/' + context.school.slug + '/admin/school-settings?saved=1');
}));
router.post('/s/:schoolSlug/admin/invitations', run(async (req, res) => {
  const context = await schoolAdmin(req, res); if (!context) return;
  const email = req.body?.email, role = req.body?.role;
  if (typeof email !== 'string' || email.length > 254 || !['student', 'moderator', 'admin'].includes(role)) return failed(res, 'Check invitation', 'Provide an account email and a school role.');
  const token = invitationToken();
  const { error } = await supabasePlatform.rpc('issue_school_invitation', { p_school: context.school.id, p_actor: context.user.id, p_hash: invitationHash(token), p_email: email, p_role: role });
  if (error) return failed(res, 'Invitation unavailable', 'An active school and current administrator are required. The school can issue at most 100 invitations per day.');
  req.session.schoolInvitation = { schoolId: context.school.id, token };
  await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  return res.redirect(303, '/s/' + context.school.slug + '/admin/school-settings');
}));
router.get('/schools/invitations/:token', (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!validInvitationToken(req.params.token)) return failed(res, 'Invitation unavailable', 'Check your invitation link.', 404);
  return res.render('school-invitation', { title: 'Accept school invitation', token: req.params.token });
});
router.post('/schools/invitations/:token', run(async (req, res) => {
  const user = await confirmedAccount(req, res); if (!user) return;
  const token = req.params.token;
  if (typeof token !== 'string' || !validInvitationToken(token)) return failed(res, 'Invitation unavailable', 'Check your invitation link.', 404);
  const { error } = await supabasePlatform.rpc('accept_school_invitation', { p_actor: user.id, p_hash: invitationHash(token) });
  if (error) return failed(res, 'Invitation unavailable', 'This invitation is expired, already used, revoked through its inviter, or intended for another verified email.');
  return res.redirect(303, '/schools?saved=1');
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
