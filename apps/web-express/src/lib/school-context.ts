import type { Request, Response, NextFunction } from 'express';
import { supabasePlatform } from './supabase';
import { schoolPath } from './school-path';
import { runWithSchool } from './school-scope';

/** Resolve the path from the registry; never accept a school/role supplied in a body or cookie. */
export function resolveSchool(req: Request, res: Response, next: NextFunction) {
  const match = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\/|\?|$)/.exec(req.url);
  const localPath=match ? (req.url.slice(match[0].length).split('?')[0] || '/') : '';
  const unsubscribe=/^\/digest\/(?:unsubscribe|unsubscribed)$/.test(localPath);
  if (!match) return res.status(404).render('404', { title: 'School not found' });
  void (async () => {
    const { data: school, error } = await supabasePlatform.from('schools').select('id,slug,name,status').eq('slug', match[1]).maybeSingle();
    if (error) throw Object.assign(new Error('School registry is unavailable.'), {status:503});
    if (!school || (school.status !== 'active' && !unsubscribe)) return res.status(404).render('404', { title: 'School unavailable' });
    const userId = req.session.user?.id;
    let role: 'student' | 'moderator' | 'admin' | null = null;
    if (userId) {
      const membership = await supabasePlatform.from('school_memberships').select('role').eq('school_id', school.id).eq('user_id', userId).eq('status', 'active').maybeSingle();
      if (membership.error) throw Object.assign(new Error('School permissions are unavailable.'), {status:503});
      if (['student','moderator','admin'].includes(membership.data?.role)) role = membership.data!.role;
    }
    const {data:settings,error:settingsError}=await supabasePlatform.from('school_settings').select('approved_at,publication_policy').eq('school_id',school.id).maybeSingle();
    if(settingsError) throw Object.assign(new Error('School policy unavailable.'), {status:503});
    if(!settings?.approved_at && !unsubscribe) return res.status(503).render('school-message',{title:'School temporarily unavailable',message:'The school must complete its current policy review before community access resumes.'});
    if(!role && settings?.publication_policy!=='public' && !unsubscribe) return res.status(403).render('school-message',{title:'School membership required',message:'This school is available to its members. Sign in or ask your school administrator for an invitation.'});
    res.locals.schoolBase = '/s/' + school.slug;
    const redirect = res.redirect.bind(res);
    res.redirect = ((first: string | number, second?: string) => typeof first === 'number' ? redirect(first, schoolPath(res.locals.schoolBase, second || '/')) : redirect(schoolPath(res.locals.schoolBase, first))) as typeof res.redirect;
    res.locals.schoolId = school.id;
    res.locals.schoolName = school.name;
    // All existing route paths stay relative to this verified school mount.
    req.url = req.url.slice(match[0].length) || '/';
    if (req.url.startsWith('?')) req.url = '/' + req.url;
    return runWithSchool({ id: school.id, slug: school.slug, name: school.name, role, actorId: role ? userId! : null }, next);
  })().catch(next);
}
