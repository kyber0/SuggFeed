import type { Request, Response, NextFunction } from "express";
import { createAuthClient, supabaseService } from "./supabase";

/** Revalidate identity and DB permissions so revoked roles cannot linger. */
export function validateIdentity(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user || req.path.startsWith("/auth/")) return next();
  const started=performance.now();
  const expectedUserId=req.session.user.id;
  const readProfile=()=>supabaseService.from('profiles').select('role, display_name').eq('id',expectedUserId).maybeSingle();
  const readOnly=['GET','HEAD'].includes(req.method);
  const pageRead=/^(?:\/$|\/(?:feed|roadmap|idea|profile|notifications|inbox)(?:\/|$)|\/api\/(?:idea|feed|categories)(?:\/|$))/.test(req.path);
  // Public/self-owned page reads can overlap independent checks. Mutations and
  // staff endpoints obtain permissions after token verification, as before.
  const profilePromise=readOnly && pageRead?Promise.resolve(readProfile()):Promise.resolve(null);
  void (async () => {
    let token = req.session.accessToken;
    const [verification,profileResult]=await Promise.all([supabaseService.auth.getUser(token ?? ""),profilePromise]);
    let {data:{user},error}=verification;
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
    if (error || !user || user.id!==expectedUserId) {
      if (error && (!error.status || error.status >= 500)) throw new Error("Authentication service unavailable.");
      req.session.user = null;
      delete req.session.accessToken;
      delete req.session.refreshToken;
      return;
    }
    const {data:profile,error:profileError}=profileResult || await readProfile();
    if (profileError) throw new Error("Account permissions unavailable.");
    if (req.session.user) {
      req.session.user.role = profile?.role ?? "student";
      req.session.user.display_name = profile?.display_name ?? req.session.user.display_name;
    }
  })().then(() => {res.append?.("Server-Timing",`identity;dur=${(performance.now()-started).toFixed(1)}`);next();}, next);
}
