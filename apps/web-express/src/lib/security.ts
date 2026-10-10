import type { Request, Response, NextFunction } from "express";

/** Reject cross-site browser writes, including login/logout CSRF. */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site") {
    return res.status(403).json({ success: false, error: "Cross-origin request rejected." });
  }
  const source = req.get("origin") || req.get("referer");
  try {
    if (source && new URL(source).origin !== `${req.protocol}://${req.get("host")}`) {
      return res.status(403).json({ success: false, error: "Cross-origin request rejected." });
    }
  } catch {
    return res.status(403).json({ success: false, error: "Invalid request origin." });
  }
  return next();
}
