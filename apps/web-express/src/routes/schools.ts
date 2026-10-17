import { platformAuthority, schoolLanding, safeAccountReturn } from '../lib/navigation-context';
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
  return user;
}
async function schoolAdmin(req: Request, res: Response) {
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
  if (/^\/(?:schools|platform\/schools)(?:\/|$)/.test(req.path) || /^\/s\/[^/]+\/(?:privacy|terms|admin\/(?:school-settings|invitations))(?:\/|$)/.test(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/account/home', run(async (req, res) => {
  if (!req.session.user) return res.redirect(303, '/schools');
  if (await platformAuthority(req, res)) return res.redirect(303, '/platform/schools');
  const { data, error } = await supabasePlatform.from('school_memberships').select('role,schools(slug,status)').eq('user_id', req.session.user.id).eq('status', 'active');
  if (error) throw Object.assign(new Error('School navigation unavailable.'), {status:503});
  const memberships = (data || []) as unknown as {role:string;schools:{slug:string;status:string}|null}[];
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
  let schools: unknown[] = [], applications: unknown[] = [];
  if (user) {
    if (await platformAuthority(req, res)) return res.redirect(303, '/platform/schools');
    const [membership, pending] = await Promise.all([
      supabasePlatform.from('school_memberships').select('school_id,role,status,schools(id,slug,name,status)').eq('user_id', user.id).eq('status', 'active'),
      supabasePlatform.from('school_applications').select('id,name,slug,status,created_at').eq('applicant_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (membership.error || pending.error) throw Object.assign(new Error('School directory unavailable.'), {status:503});

    schools = membership.data || []; applications = pending.data || [];
  }
  return res.render('school-directory', { title: 'Your schools — SuggFeed', schools, applications, applicationEnabled: schoolApplicationsConfigured(), legal: legalDetails(), saved: req.query.saved === '1' });
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
  const [applications, schools] = await Promise.all([
    supabasePlatform.from('school_applications').select('id,name,slug,contact_name,contact_email,authority_statement,created_at').eq('status', 'pending').order('created_at').order('id').range(applicationPage * 12, applicationPage * 12 + 12),
    schoolQuery.order('created_at', { ascending: false }).order('id').range(page * 24, page * 24 + 24),
  ]);
  if (applications.error || schools.error) throw Object.assign(new Error('School review unavailable.'), {status:503});
  const visibleSchools = (schools.data || []).slice(0, 24);
  const ids = visibleSchools.map(school => school.id);
  const [settings, memberships] = visibleSchools.length ? await Promise.all([
    supabasePlatform.from('school_settings').select('school_id,version,privacy_notice,terms_notice,privacy_contact,school_contact,age_policy,publication_policy,retention_days,approved_at').in('school_id', ids),
    supabasePlatform.from('school_memberships').select('school_id').eq('user_id', user.id).eq('role', 'admin').eq('status', 'active').in('school_id', ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (settings.error || memberships.error) throw Object.assign(new Error('School policy review unavailable.'), {status:503});
  return res.render('platform-schools', { title: 'Super admin dashboard — SuggFeed', applications: (applications.data || []).slice(0, 12), schools: visibleSchools, settings: settings.data || [], adminSchoolIds: (memberships.data || []).map(membership => membership.school_id), businessReady: schoolApplicationsConfigured(), legal: legalDetails(), search, status, page, applicationPage, nextPage: (schools.data?.length || 0) > 24, nextApplicationPage: (applications.data?.length || 0) > 12, saved: req.query.saved === '1' });
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
async function renderSettings(req: Request, res: Response, context: NonNullable<Awaited<ReturnType<typeof schoolAdmin>>>, submitted?: Record<string, string | number>, errorMessage?: string) {
  const { data, error } = await supabasePlatform.from('school_settings').select('*').eq('school_id', context.school.id).maybeSingle();
  if (error) throw Object.assign(new Error('School settings unavailable.'), {status:503});
  const invitation = req.session.schoolInvitation;
  const invitationUrl = invitation && invitation.schoolId === context.school.id ? '/schools/invitations/' + invitation.token : null;
  if (invitationUrl) delete req.session.schoolInvitation;
  res.setHeader('Referrer-Policy', 'no-referrer');
  const displayedSettings = submitted ? { ...(data || {}), ...submitted } : data;
  return res.status(errorMessage ? 400 : 200).render('school-settings', { title: 'School settings — ' + context.school.name, school: context.school, savedSettings: data, settings: displayedSettings || { version: 1, publication_policy: 'private', retention_days: 365 }, settingsAction: req.path.toLowerCase().startsWith('/platform/') ? '/platform/schools/' + context.school.id + '/settings' : '/s/' + context.school.slug + '/admin/school-settings', saved: !errorMessage && req.query.saved === '1', errorMessage, invitationUrl });
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
