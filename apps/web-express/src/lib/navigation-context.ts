import type { Request, Response, NextFunction } from 'express';
import { supabasePlatform } from './supabase';

/** Per-request authority only; never persist operator permission in a session. */
export async function platformAuthority(req: Request, res: Response): Promise<boolean> {
  if (typeof res.locals.isPlatformOperator === 'boolean') return res.locals.isPlatformOperator;
  if (!req.session.user) return (res.locals.isPlatformOperator = false);
  const { data, error } = await supabasePlatform.rpc('platform_operator_active', { p_actor: req.session.user.id });
  if (error) throw Object.assign(new Error('Account navigation unavailable.'), { status: 503 });
  return (res.locals.isPlatformOperator = data === true);
}
export function navigationContext(req: Request, res: Response, next: NextFunction) {
  const pathname = req.path.toLowerCase();
  if (/^\/(?:auth|health|api\/health|internal)(?:\/|$)/.test(pathname)) return next();
  void (async () => {
    const operator = await platformAuthority(req, res);
    res.locals.accountArea = true; // A school shell is enabled only after its registry and access checks pass.
    res.locals.platformDashboard = operator;
    if (operator && (pathname.startsWith('/s/') || pathname.startsWith('/schools/'))) {
      if (['GET','HEAD'].includes(req.method)) return res.redirect(303, '/platform/schools');
      return res.status(403).json({ success:false, error:'Use platform administration for this account.' });
    }
    next();
  })().catch(next);
}
export function schoolLanding(school: { slug:string; status:string }, role:string): string {
  const base = '/s/' + school.slug;
  if (school.status !== 'active') return role === 'admin' ? base + '/admin/school-settings' : '/schools';
  return base + (['admin','moderator'].includes(role) ? '/admin' : '/');
}
export function safeAccountReturn(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\x00-\x20\x7f]|%(?:2f|5c|25|2e)/i.test(value)) return null;
  if (!/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/|$)/.test(value) && !/^\/(?:platform\/(?:schools|customization)|schools\/invitations\/[^/]+|account\/security)(?:[/?#]|$)/.test(value)) return null;
  const url = new URL(value, 'https://suggfeed.invalid');
  return url.origin === 'https://suggfeed.invalid' && url.pathname === value.split(/[?#]/)[0] ? value : null;
}
