import { Router, type Request, type Response, type NextFunction } from 'express';
import { operator } from './schools';
import { supabasePlatform as db } from '../lib/supabase';
import { schoolApplicationsConfigured } from '../lib/school-onboarding';
import { uuid, platformQuery, platformUrl, platformReturn, platformSaved, platformChrome, platformRecovery, platformPanel, platformReview, platformSchool } from '../lib/platform-dashboard';
const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
router.use('/platform', (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'strict-origin');if(req.session.platformFormRecovery&&req.session.platformFormRecovery.expires<Date.now())delete req.session.platformFormRecovery;
    const path = ('/platform' + req.path).toLowerCase(), review = /^\/platform\/reviews\/(applications|policies|forms)\/([a-f0-9-]{36})$/.exec(path), school = /^\/platform\/schools\/([a-f0-9-]{36})(?:\/(status|editor-grant|activate))?$/.exec(path);
    if (review)
        res.locals.platformAuthReturn = platformUrl({ section: 'reviews', reviewType: review[1], item: review[2] });
    if (school)
        res.locals.platformAuthReturn = '/platform/schools/' + school[1] + (school[2] === 'status' && ['active', 'suspended', 'closed'].includes(req.body?.target||req.query.to) ? '/status?to=' + (req.body?.target||req.query.to) : '?tab=' + (school[2]==='activate'?'summary':['summary', 'reviews', 'access', 'activity'].includes(String(req.query.tab)) ? req.query.tab : 'access'));
    if (req.method === 'POST' && (review || school) && !req.is('application/json') && !req.get('accept')?.includes('application/json')) {
        res.locals.platformHtmlForm = true;
        if (req.session.user && res.locals.isPlatformOperator === true  && (review || school?.[2] === 'status'))
            req.session.platformFormRecovery = { actor: req.session.user.id, path: res.locals.platformAuthReturn, reference: typeof req.body?.reference === 'string' ? req.body.reference.slice(0, 2000) : undefined, reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 2000) : undefined, confirmation: typeof req.body?.confirmation === 'string' ? req.body.confirmation.slice(0, 63) : undefined, expires: Date.now() + 600000 };
    }
    next();
});
async function dashboard(req: Request, res: Response, actor: string, overrides: Record<string, unknown> = {}, code = 200) {
    const query = platformQuery({ ...req.query, ...overrides });
    const recovery = query.section === 'reviews' && query.item ? platformRecovery(req, actor, platformUrl({ section: 'reviews', reviewType: query.reviewType, item: query.item })) : null;
    const [common, panel] = await Promise.all([platformChrome(actor), platformPanel(actor, query)]);
    let release = (panel as any).release || null, releaseUnavailable = !!(panel as any).releaseUnavailable;
    if (query.section === 'setup') {
        const r = await db.rpc('school_release_status', { p_actor: actor });
        release = r.data;
        releaseUnavailable = !!r.error;
    }
    return res.status(code).render('platform-schools', { ...common, ...panel, ...query, release, releaseUnavailable, title: 'Super admin dashboard — SuggFeed', currentUrl: platformUrl({ ...query, demo: query.includeDemo ? '1' : '0', includeDemo: undefined }), saved: req.query.saved === '1' || req.query.statusSaved === '1', reviewError: overrides.reviewError || (recovery ? 'Your review reference was restored after verification. Review the current version before approving.' : ''), reference: overrides.reference || recovery?.reference || '' });
}
router.get('/platform/schools', run(async (req, res) => {
    const actor = await operator(req, res);
    if (!actor)
        return;
    return dashboard(req, res, actor.id);
}));
router.get('/platform/schools/:id', run(async (req, res) => {
    const actor = await operator(req, res);
    if (!actor)
        return;
    if (!uuid(req.params.id))
        return res.sendStatus(404);
    const query = platformQuery(req.query), tab = typeof req.query.tab === 'string' ? req.query.tab : 'summary';
    if (req.query.tab !== undefined && typeof req.query.tab !== 'string' || !['summary', 'reviews', 'access', 'activity'].includes(tab))
        return res.status(400).render('school-message', { title: 'Choose a school tab', message: 'Open Summary, Reviews, Access or Activity from the school record.', nextHref: '/platform/schools/' + req.params.id, nextLabel: 'School summary' });
    const [common, detail] = await Promise.all([platformChrome(actor.id), platformSchool(actor.id, req.params.id, tab, query.page)]);
    return res.render('platform-school', { ...common, ...detail, section: 'schools', tab, page: query.page, title: detail.school.name + ' — Platform', currentUrl: req.originalUrl, backUrl: platformReturn(req.query.returnTo), saved: req.query.saved === '1' });
}));
router.post('/platform/reviews/:type/:id', run(async (req, res) => {
    const actor = await operator(req, res);
    if (!actor)
        return;
    const type = req.params.type, id = req.params.id;
    if (typeof type !== 'string' || !['applications', 'policies', 'forms'].includes(type) || !uuid(id))
        return res.sendStatus(400);
    const { reference, version, decision } = req.body || {}, returnTo = platformReturn(req.body?.returnTo, platformUrl({ section: 'reviews', reviewType: type }));
    const reject = async (message: string, status = 409) => { const url = new URL(returnTo, 'https://platform.invalid'); const query = Object.fromEntries(url.searchParams); return dashboard(req, res, actor.id, { ...query, section: 'reviews', reviewType: type, item: id, reviewError: message, reference: typeof reference === 'string' ? reference.slice(0, 2000) : '' }, status); };
    if (typeof reference !== 'string' || reference.trim().length < 10 || reference.length > 2000)
        return reject('Record the actual review and a reference of 10–2,000 characters.', 400);
    const current = await platformReview(type, id);
    if (current?.unavailable)
        return reject('Review data is unavailable. Your reference is preserved; retry when connected.', 503);
    if (!current || current.missing || !current.pending)
        return reject('This item is no longer pending. Your reference is preserved; return to the queue.');
    if (type === 'applications') {
        if (!['approved', 'rejected'].includes(decision))
            return reject('Choose Approve or Reject.', 400);
        if (decision === 'approved' && !schoolApplicationsConfigured())
            return reject('Complete service setup before approving a real workspace.');
        const r = await db.rpc('review_school_application', { p_application: id, p_actor: actor.id, p_decision: decision, p_reference: reference.trim() });
        if (r.error)
            return reject('The application changed or its address is already in use. Reload the queue before retrying.');
        delete req.session.platformFormRecovery;return res.redirect(303, decision === 'approved' && uuid(r.data) ? '/platform/schools/' + r.data + '?saved=1' : platformSaved(returnTo));
    }
    const n = Number(version);
    if (!Number.isSafeInteger(n) || n < 1 || n !== (type === 'policies' ? current.settings?.version : current.revision))
        return reject('A newer version is available. Review the current content below before submitting again.');
    const r = type === 'policies' ? await db.rpc('approve_school_settings', { p_school: id, p_actor: actor.id, p_version: n, p_reference: reference.trim() }) : await db.rpc('review_school_customization_form', { p_school: id, p_actor: actor.id, p_revision: n, p_reference: reference.trim() });
    if (r.error)
        return reject('The saved version changed or its policy requirements are incomplete. Review the current version before retrying.');
    delete req.session.platformFormRecovery;return res.redirect(303, platformSaved(returnTo));
}));
router.post('/platform/schools/:id/editor-grant', run(async (req, res) => {
    const actor = await operator(req, res);
    if (!actor)
        return;
    if (!uuid(req.params.id) || !['true', 'false'].includes(req.body?.enabled))
        return res.sendStatus(400);
    const school = await db.from('schools').select('status').eq('id', req.params.id).maybeSingle();
    if (school.error || !school.data)
        return res.status(503).render('school-message', { title: 'School unavailable', message: 'Reload the school record before changing access.' });
    if (school.data.status === 'closed')
        return res.status(409).render('school-message', { title: 'School closed', message: 'Closed schools cannot receive editor access.', nextHref: '/platform/schools/' + req.params.id, nextLabel: 'School details' });
    const r = await db.rpc('set_school_customization_rollout', { p_school: req.params.id, p_actor: actor.id, p_enabled: req.body.enabled === 'true' });
    if (r.error)
        return res.status(409).render('school-message', { title: 'Access not changed', message: 'Your permission or the school state changed. Reload and retry.', nextHref: '/platform/schools/' + req.params.id + '?tab=access', nextLabel: 'Return to access' });
    return res.redirect(303, platformSaved(platformReturn(req.body.returnTo, '/platform/schools/' + req.params.id + '?tab=access')));
}));
export default router;
