import type { Request, Response, NextFunction } from "express";
import { createAuthClient, supabaseService } from "./supabase";

/** Revalidate identity and DB permissions so revoked roles cannot linger. */
export function validateIdentity(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user || req.path.startsWith("/auth/")) return next();
  void (async () => {
    let token = req.session.accessToken;
    let { data: { user }, error } = await supabaseService.auth.getUser(token ?? "");
    if (error && req.session.refreshToken && (error.status === 401 || error.status === 403)) {
      const result = await createAuthClient().auth.refreshSession({ refresh_token: req.session.refreshToken });
      if (result.error && (!result.error.status || result.error.status >= 500)) {
        throw new Error("Authentication service unavailable.");
      }
      if (!result.error && result.data.session) {
        token = result.data.session.access_token;
        req.session.accessToken = token;
        req.session.refreshToken = result.data.session.refresh_token;
        const verified = await supabaseService.auth.getUser(token);
        user = verified.data.user;
        error = verified.error;
      }
    }
    if (error || !user) {
      if (error && (!error.status || error.status >= 500)) throw new Error("Authentication service unavailable.");
      req.session.user = null;
      delete req.session.accessToken;
      delete req.session.refreshToken;
      return;
    }
    const { data: profile, error: profileError } = await supabaseService.from("profiles")
      .select("role, display_name").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error("Account permissions unavailable.");
    if (req.session.user) {
      req.session.user.role = profile?.role ?? "student";
      req.session.user.display_name = profile?.display_name ?? req.session.user.display_name;
    }
  })().then(() => next(), next);
}
