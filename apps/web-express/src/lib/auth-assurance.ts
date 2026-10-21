import { schoolUser } from './school-scope';
import type { Request, Response, NextFunction } from 'express';

/** Call only after the provider has verified this exact token with getUser. */
export function verifiedTokenAssurance(token: string): 'aal1' | 'aal2' {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return 'aal1';
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).aal === 'aal2' ? 'aal2' : 'aal1';
  } catch { return 'aal1'; }
}

export function safeSecurityReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\x00-\x20\x7f]|%(?:2f|5c|25|2e)/i.test(value)) return '/schools';
  try {
    const url = new URL(value, 'https://suggfeed.invalid');
    if (!value.startsWith('/') || url.origin !== 'https://suggfeed.invalid' || url.pathname !== value.split(/[?#]/)[0]) return '/schools';
    if (url.pathname === '/schools' || /^\/platform\/schools(?:\/[^/]+\/(?:settings|invitations|student-access|members(?:\/[^/]+)?|status|customization(?:\/preview(?:\/content)?)?))?$/.test(url.pathname) || url.pathname === '/account/home' || url.pathname === '/platform/customization') return value;
    const school = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(url.pathname);
    return school && school[1].length >= 3 && school[1].length <= 63 ? value : '/schools';
  } catch { return '/schools'; }
}

/** Identity middleware supplies assurance only after provider token verification. */
export function requireStrongAuth(req: Request, res: Response, next: NextFunction) {
  if (res.locals.authAssurance === 'aal2') return next();
  const returnTo = safeSecurityReturnTo(req.originalUrl);
  const securityUrl = `/account/security?returnTo=${encodeURIComponent(returnTo)}`;
  if (['GET', 'HEAD'].includes(req.method) && !req.path.toLowerCase().startsWith('/api/') && !req.path.toLowerCase().includes('/api/') && !req.is('application/json') && !req.get('accept')?.includes('application/json')) {
    return res.redirect(303, securityUrl);
  }
  return res.status(403).json({ success: false, code: 'MFA_REQUIRED', error: 'Verify your authenticator code to continue.', securityUrl });
}

/** Express matches route names without case sensitivity; guards must do the same. */
export function requireStaffAssurance(req: Request, res: Response, next: NextFunction) {
  const role = schoolUser(req)?.role;
  const path = req.path.toLowerCase();
  const privileged = /^\/(?:admin(?:\/|$)|staff(?:\/|$)|submission-details(?:\/|$)|api\/(?:submission-details(?:\/|$)|submission-files(?:\/|$)|staff(?:\/|$)|community\/staff(?:\/|$)|submissions\/[^/]+\/status(?:\/|$)))/.test(path)
    || (path.startsWith('/api/progress-evidence') && !['GET','HEAD'].includes(req.method));
  if (privileged && role && ['admin','moderator','staff'].includes(role)) return requireStrongAuth(req, res, next);
  next();
}
