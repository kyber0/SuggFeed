import {randomBytes,timingSafeEqual} from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** These capabilities are not used by the web application. */
export function browserSecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Native same-origin forms need an Origin/Referer; cross-site referrers stay suppressed.
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
}

/** Obtain a session-bound fallback for clients that cannot send Origin/Referer. */
export function csrfToken(req: Request): string {
  return req.session.csrfToken ||= randomBytes(32).toString('hex');
}

function csrfTokenEqual(expected: unknown, supplied: unknown): boolean {
  return typeof expected === 'string' && typeof supplied === 'string' &&
    /^[a-f0-9]{64}$/.test(supplied) && expected.length === supplied.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

/** Reject cross-site browser writes, including login/logout CSRF. */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site") {
    return res.status(403).json({ success: false, error: "Cross-origin request rejected." });
  }
  const source = req.get("origin") || req.get("referer");
  if (!source) {
    if (csrfTokenEqual(req.session?.csrfToken, req.get('x-csrf-token') || req.body?._csrf)) return next();
    return res.status(403).json({ success: false, error: "Request verification required. Reload the page and try again." });
  }
  try {
    if (new URL(source).origin !== `${req.protocol}://${req.get("host")}`) {
      return res.status(403).json({ success: false, error: "Cross-origin request rejected." });
    }
  } catch {
    return res.status(403).json({ success: false, error: "Invalid request origin." });
  }
  return next();
}
