import {type SchoolCustomization,schoolStatusLabel} from './school-customization';
import { DEMO_SCHOOL_ID } from './school-onboarding';
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
    const { data: school, error } = await supabasePlatform.rpc('school_presentation',{p_slug:match[1]});
    if (error) throw Object.assign(new Error('School registry is unavailable.'), {status:503});
    if (!school) return res.status(404).render('404', { title: 'School unavailable' });
    const userId = req.session.user?.id;
    let role: 'student' | 'moderator' | 'admin' | null = null;
    if (userId) {
      const membership = await supabasePlatform.from('school_memberships').select('role').eq('school_id', school.id).eq('user_id', userId).eq('status', 'active').maybeSingle();
      if (membership.error) throw Object.assign(new Error('School permissions are unavailable.'), {status:503});
      if (['student','moderator','admin'].includes(membership.data?.role)) role = membership.data!.role;
    }
    if (school.status !== 'active' && !unsubscribe) {
      if (!role) return res.status(404).render('404', { title: 'School unavailable' });
      res.locals.accountArea = true;
      if (role === 'admin' && school.status === 'pending' && ['GET','HEAD'].includes(req.method)) return res.redirect(303, '/s/' + school.slug + '/admin/school-settings');
      return res.status(403).render('school-message', { title: 'School workspace unavailable', message: school.status === 'pending' ? 'Your school is being set up. Your school administrator will invite members when it is ready.' : 'Access to this school is currently unavailable. Contact your school administrator for help.' });
    }
    const [policy,eligibility]=await Promise.all([
      supabasePlatform.from('school_settings').select('approved_at,publication_policy').eq('school_id',school.id).maybeSingle(),
      role==='student' && !unsubscribe ? supabasePlatform.rpc('school_student_eligible',{p_school:school.id,p_actor:userId}) : Promise.resolve({data:true,error:null}),
    ]);
    const {data:settings,error:settingsError}=policy;
    if(settingsError || eligibility.error) throw Object.assign(new Error('School access checks unavailable.'), {status:503});
    if(eligibility.data!==true){res.locals.accountArea=true;return res.status(403).render('school-message',{title:'School access is paused',message:'Your school requires a current enrollment roster, and your confirmed account email is not on it. Ask your school administrator to check your email and enrollment. Your account and submitted ideas have not been deleted.',nextHref:'/schools',nextLabel:'View your schools'});}
    if(!settings?.approved_at && !unsubscribe) { res.locals.accountArea = true; return res.status(503).render('school-message',{title:'School temporarily unavailable',message:'The school must complete its current policy review before community access resumes.', nextHref: role === 'admin' ? '/s/' + school.slug + '/admin/school-settings' : '/schools', nextLabel: role === 'admin' ? 'Review school setup' : 'Your schools' }); }
    if(!role && settings?.publication_policy!=='public' && !unsubscribe) return res.status(403).render('school-message',{title:'School membership required',message:'This school is available to its members. Sign in or ask your school administrator for an invitation.'});
    res.locals.accountArea = false;
    res.locals.demoWorkspace = school.id === DEMO_SCHOOL_ID;
    res.locals.schoolBase = '/s/' + school.slug;
    const redirect = res.redirect.bind(res);
    res.redirect = ((first: string | number, second?: string) => typeof first === 'number' ? redirect(first, schoolPath(res.locals.schoolBase, second || '/')) : redirect(schoolPath(res.locals.schoolBase, first))) as typeof res.redirect;
    res.locals.schoolId = school.id;
    res.locals.schoolName = school.name;
    res.locals.schoolCustomization=school.configuration;res.locals.schoolCustomizationVersion=school.customization_version;res.locals.schoolCategories=(school.configuration?.categories || []).filter((c:any)=>c.active);res.locals.schoolStatusLabel=schoolStatusLabel;
    // All existing route paths stay relative to this verified school mount.
    req.url = req.url.slice(match[0].length) || '/';
    if (req.url.startsWith('?')) req.url = '/' + req.url;
    return runWithSchool({ id: school.id, slug: school.slug, name: school.name, role, actorId: role ? userId! : null, customization:school.configuration as SchoolCustomization,customizationVersion:school.customization_version }, next);
  })().catch(next);
}
