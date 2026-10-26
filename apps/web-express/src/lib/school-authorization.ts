import type { Request, Response } from 'express';
import { supabasePlatform } from './supabase';
import { requireStrongAuth } from './auth-assurance';
import { platformAuthority } from './navigation-context';
import { schoolColors } from './school-colors';
import { schoolDesign } from './school-design';

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
export async function confirmedAccount(req: Request, res: Response) {
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
  if(!platformSettings && req.method==='GET' && !req.path.includes('/customization')){const presentation=await supabasePlatform.rpc('school_published_configuration',{p_school:school.id});if(presentation.data&&!presentation.error){const configuration=presentation.data;Object.assign(res.locals,{schoolCustomization:configuration,schoolDesignPage:'staff',schoolColorStyle:schoolColors.style(configuration.palette)+(configuration.design?schoolDesign.style(configuration.design):schoolDesign.cursorStyle())});}}
  return { user, school };
}
