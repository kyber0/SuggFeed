import type { Request } from 'express';
import { supabasePlatform as db } from './supabase';
import { legalDetails } from './legal';
import { DEMO_SCHOOL_ID, schoolApplicationsConfigured } from './school-onboarding';
declare module 'express-session' {
    interface SessionData {
        platformFormRecovery?: {
            actor: string;
            path: string;
            reference?: string;
            reason?: string;
            confirmation?: string;
            expires: number;
        };
    }
}
export function platformRecovery(req: Request, actor: string, path: string) { const saved = req.session.platformFormRecovery; if (!saved)
    return null; if (saved.actor !== actor || saved.expires < Date.now()) {
    delete req.session.platformFormRecovery;
    return null;
} if (saved.path !== path)
    return null; delete req.session.platformFormRecovery; return saved; }
export const platformSections = [['overview', 'Overview', 'board'], ['schools', 'Schools', 'building'], ['reviews', 'Reviews', 'inbox'], ['editor-access', 'Studio access', 'board'], ['activity', 'Activity', 'list'], ['setup', 'Platform settings', 'shield']] as const;
export const reviewTypes = [['applications', 'Applications'], ['policies', 'Policies'], ['forms', 'Form changes'], ['sugi', 'Sugi feedback']] as const;
export const schoolStatuses: Record<string, string> = { pending: 'Pending setup', active: 'Active', suspended: 'Suspended', closed: 'Closed' };
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const invalid = () => Object.assign(new Error('Choose a valid platform section, filter or page.'), { status: 400 });
export function platformQuery(query: Record<string, unknown>) {
    const scalar = (key: string, fallback = '') => {
        const v = query[key] ?? fallback;
        if (typeof v !== 'string')
            throw invalid();
        return v;
    };
    const section = scalar('section', 'overview'), reviewType = scalar('reviewType', 'applications'), page = Number(scalar('page', '0')), q = scalar('q').trim(), status = scalar('status'), action = scalar('action'), item = scalar('item'), overviewDays = Number(scalar('overviewDays', '30')), demo = scalar('demo', section === 'overview' ? '0' : '1');
    if (!platformSections.some(x => x[0] === section) || !reviewTypes.some(x => x[0] === reviewType) || !Number.isSafeInteger(page) || page < 0 || page > 10000 || q.length > 100 || status && !schoolStatuses[status] || !['', 'created', 'status_changed', 'customization_rollout', 'customization_reviewed', 'customization_published'].includes(action) || item && !uuid(item) || ![7, 30, 90].includes(overviewDays) || !['0', '1'].includes(demo))
        throw invalid();
    return { section, reviewType, page, q, status, action, item, overviewDays, includeDemo: demo === '1' };
}
export function platformUrl(values: Record<string, unknown> = {}) {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(values))
        if (value !== undefined && value !== null && value !== '')
            p.set(key, String(value));
    return '/platform/schools' + (p.size ? '?' + p : '');
}
export function platformReturn(value: unknown, fallback = '/platform/schools?section=schools') {
    if (typeof value !== 'string' || value.length > 1000)
        return fallback;
    try {
        const url = new URL(value, 'https://platform.invalid');
        if (url.origin !== 'https://platform.invalid' || !/^\/platform\/schools(?:\/[a-f0-9-]{36})?$/.test(url.pathname))
            return fallback;
        return url.pathname + url.search;
    }
    catch {
        return fallback;
    }
}
export function platformSaved(path: string) { const u = new URL(path, 'https://platform.invalid'); u.searchParams.set('saved', '1'); return u.pathname + u.search; }
const result = async (query: PromiseLike<any>) => {
    try {
        const r = await query;
        return r.error ? { data: null, error: true } : { data: r.data, error: false, total: r.count };
    }
    catch {
        return { data: null, error: true };
    }
};
export async function platformCounts(actor: string) { return (await result(db.rpc('platform_dashboard_counts', { p_actor: actor }))).data; }
export async function platformChrome(actor: string) { return { sections: platformSections, reviewTypes, statuses: schoolStatuses, counts: await platformCounts(actor), url: platformUrl, businessReady: schoolApplicationsConfigured(), legal: legalDetails(), capturedAt: new Date().toISOString() }; }
export async function platformPanel(actor: string, p: ReturnType<typeof platformQuery>) {
    if (p.section === 'overview') {
        const [overview, activity, release] = await Promise.all([result(db.rpc('platform_insights', { p_actor: actor, p_days: p.overviewDays, p_include_demo: p.includeDemo })), result(db.rpc('platform_activity', { p_actor: actor, p_page: 0 })), result(db.rpc('school_release_status', { p_actor: actor }))]);
        return { overview: overview.data, activity: activity.data, activityError: activity.error, release: release.data, releaseUnavailable: release.error };
    }
    if (p.section === 'schools') {
        let query = db.from('schools').select('id,name,slug,status,created_at,updated_at', { count: 'exact' });
        if (p.q)
            query = query.ilike('name', '%' + p.q.replace(/[\\%_]/g, c => '\\' + c) + '%');
        if (p.status)
            query = query.eq('status', p.status);
        if (!p.includeDemo)
            query = query.neq('id', DEMO_SCHOOL_ID);
        const r = await result(query.order('created_at', { ascending: false }).order('id').range(p.page * 20, p.page * 20 + 19));
        return { listing: { items: r.data || [], total: r.total || 0 }, panelError: r.error };
    }
    if (p.section === 'editor-access') {
        const r = await result(db.rpc('platform_editor_schools', { p_actor: actor, p_page: p.page, p_search: p.q }));
        return { listing: r.data, panelError: r.error };
    }
    if (p.section === 'activity') {
        const r = await result(db.rpc('platform_activity', { p_actor: actor, p_page: p.page, p_action: p.action }));
        return { activity: r.data, panelError: r.error };
    }
    if (p.section === 'reviews' && p.reviewType !== 'sugi') {
        const [queue, selected] = await Promise.all([result(db.rpc('platform_review_queue', { p_actor: actor, p_type: p.reviewType, p_page: p.page, p_search: p.q })), p.item ? platformReview(p.reviewType, p.item) : Promise.resolve(null)]);
        return { listing: queue.data, panelError: queue.error, review: selected };
    }
    return {};
}
export async function platformReview(type: string, id: string): Promise<any> {
    if (type === 'applications') {
        const r = await result(db.from('school_applications').select('id,name,slug,status,contact_name,contact_email,authority_statement,created_at,school_id').eq('id', id).maybeSingle());
        return r.error ? { unavailable: true } : r.data ? { ...r.data, type, pending: r.data.status === 'pending' } : { missing: true };
    }
    const [school, live, draft, form] = await Promise.all([result(db.from('schools').select('id,name,slug,status').eq('id', id).maybeSingle()), result(db.from('school_settings').select('school_id,version,privacy_notice,terms_notice,age_policy,privacy_contact,school_contact,publication_policy,retention_days,approved_at,updated_at').eq('school_id', id).maybeSingle()), type === 'policies' ? result(db.from('school_policy_drafts').select('version,settings,updated_at').eq('school_id', id).maybeSingle()) : Promise.resolve({ data: null, error: false }), type === 'forms' ? result(db.from('school_customization_state').select('revision,draft,review_requested_at,published_version').eq('school_id', id).maybeSingle()) : Promise.resolve({ data: null, error: false })]);
    if ([school, live, draft, form].some(r => r.error))
        return { unavailable: true };
    if (!school.data)
        return { missing: true };
    let publishedForm = null;
    if (type === 'forms' && form.data?.published_version) {
        const r = await result(db.from('school_customization_versions').select('configuration').eq('school_id', id).eq('version', form.data.published_version).maybeSingle());
        if (r.error)
            return { unavailable: true };
        publishedForm = r.data?.configuration?.form || null;
    }
    return { type, id, ...school.data, live: live.data, settings: draft.data ? { ...draft.data.settings, version: draft.data.version, updated_at: draft.data.updated_at } : live.data, revision: form.data?.revision, form: form.data?.draft?.form, publishedForm, pending: school.data.status !== 'closed' && (type === 'policies' ? !!draft.data || !!live.data && !live.data.approved_at && live.data.privacy_notice.trim().length >= 20 && live.data.terms_notice.trim().length >= 20 && live.data.age_policy.trim().length >= 10 && !!live.data.privacy_contact && !!live.data.school_contact : !!form.data?.review_requested_at), submitted_at: form.data?.review_requested_at || draft.data?.updated_at || live.data?.updated_at };
}
export async function platformSchool(actor: string, id: string, tab: string, page: number) {
    const r = await db.from('schools').select('id,name,slug,status,created_at,updated_at').eq('id', id).maybeSingle();
    if (r.error)
        throw Object.assign(new Error('School details are unavailable. Please retry.'), { status: 503 });
    if (!r.data)
        throw Object.assign(new Error('School not found.'), { status: 404 });
    const school = r.data;
    if (tab === 'activity') {
        const activity = await result(db.rpc('platform_activity', { p_actor: actor, p_page: page, p_school: id }));
        return { school, activity: activity.data, panelError: activity.error };
    }
    const when = (show: boolean, query: () => PromiseLike<any>) => show ? result(query()) : Promise.resolve({ data: null, error: false, total: null });
    const summary = tab === 'summary', access = tab === 'access', reviews = tab === 'reviews';
    const [policy, draft, admins, membership, release, editor, domains, enrollment, application, grant] = await Promise.all([
        when(summary || reviews, () => db.from('school_settings').select('version,approved_at,privacy_contact,school_contact').eq('school_id', id).maybeSingle()),
        when(summary || reviews, () => db.from('school_policy_drafts').select('version').eq('school_id', id).maybeSingle()),
        when(summary, () => db.from('school_memberships').select('user_id', { count: 'exact', head: true }).eq('school_id', id).eq('role', 'admin').eq('status', 'active')),
        when(access, () => db.from('school_memberships').select('role,status').eq('school_id', id).eq('user_id', actor).maybeSingle()),
        when(summary, () => db.rpc('school_release_status', { p_actor: actor })),
        when(access || reviews, () => db.from('school_customization_state').select('editing_enabled,review_requested_at,revision').eq('school_id', id).maybeSingle()),
        when(summary, () => db.from('school_email_domains').select('id', { count: 'exact', head: true }).eq('school_id', id).eq('join_enabled', true)),
        when(summary, () => db.from('school_enrollment_rules').select('mode').eq('school_id', id).maybeSingle()),
        when(summary, () => db.from('school_applications').select('reviewed_at,review_reference').eq('school_id', id).eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(1).maybeSingle()),
        when(access, () => db.from('school_registry_events').select('created_at,profiles!school_registry_events_actor_id_fkey(display_name)').eq('school_id', id).eq('action', 'customization_rollout').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle())
    ]);
    const checks = [{ label: 'School policies', state: policy.error ? 'Unavailable' : policy.data?.approved_at ? 'Approved v' + policy.data.version + (draft.error?' · replacement status unavailable':draft.data?' · replacement pending':'') : draft.error?'Unavailable':draft.data?'Draft v'+draft.data.version+' needs review':'Not submitted for review', owner: 'School admin → platform reviewer', href: !draft.error && (draft.data || policy.data?.approved_at) ? platformUrl({ section: 'reviews', reviewType: 'policies', item: id }) : undefined, action: 'Review policy', pass: !policy.error && !!policy.data?.approved_at }, { label: 'Active school administrator', state: admins.error||typeof admins.total!=='number' ? 'Unavailable' : String(admins.total || 0) + ' active', owner: 'School administration', pass: !admins.error && !!admins.total }, { label: 'Service identity and privacy contact', state: school.id === DEMO_SCHOOL_ID ? 'Fictional demo exception' : schoolApplicationsConfigured() ? 'Configured' : 'Incomplete', owner: 'Service operator', href: platformUrl({ section: 'setup' }), action: 'View setup', pass: school.id === DEMO_SCHOOL_ID || schoolApplicationsConfigured() }, { label: 'Platform isolation release gate', state: release.error ? 'Unavailable' : release.data?.isolation_verified ? 'Evidence recorded' : 'Verification pending', owner: 'Platform technical reviewer', href: platformUrl({ section: 'setup' }), action: 'View release requirements', pass: !release.error && !!release.data?.isolation_verified }];
    return { school, checks, canActivate: checks.every(x => x.pass), policy: policy.data, policyDraft: draft.data, policyUnavailable: policy.error, editor: editor.data, editorUnavailable: editor.error, canAdmin: !membership.error && membership.data?.role === 'admin' && membership.data.status === 'active' && school.status !== 'closed', application: application.data, authorityUnavailable: application.error, domains: domains.error ? null : domains.total, enrollment: enrollment.error ? null : enrollment.data?.mode || 'email', grant: grant.data, grantUnavailable: grant.error };
}
