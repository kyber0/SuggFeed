import {providerKey,providerIdle} from '../lib/session-idle-store';
import {blockedIdleToken,idleState,idleExpired} from '../lib/session-idle';
import { safeAccountReturn } from '../lib/navigation-context';
import { Router, Request, Response, NextFunction } from "express";
import { supabasePlatform } from "../lib/supabase";
import { sameOriginOnly } from "../lib/security";

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); res.locals.accountArea = true; next(); });

// PKCE verifiers live in the initiating browser. Exchange the code there exactly
// once, then verify the resulting access token before issuing the server session.
router.get(["/callback", "/callback/client", "/recovery"], (req, res) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  const pending=req.session.invitationReturn;
  const returnTo=pending && pending.expires>Date.now()?safeAccountReturn(pending.path):null;
  res.render("auth-callback", { title: "Signing in… — SuggFeed", returnTo });
});

router.get("/confirm", (_req,res) => { res.setHeader("Referrer-Policy","no-referrer");res.render("auth-confirm",{title:"Confirm your email — SuggFeed"}); });

router.get("/session", (req, res) => {
  if(req.session.idleBlocked&&!req.session.user)return idleExpired(res);
  res.json({ success: true, user: req.session.user ?? null, idle:res.locals.sessionIdle||idleState(req) });
});

router.post("/session", sameOriginOnly, (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    if (!req.is("application/json")) {
      return res.status(415).json({ success: false, error: "JSON body required." });
    }
    const { access_token, refresh_token } = req.body ?? {};
    if (typeof access_token !== "string" || !access_token || access_token.length > 16384 ||
        (refresh_token !== undefined && (typeof refresh_token !== "string" || refresh_token.length > 1024))) {
      return res.status(400).json({ success: false, error: "Missing or invalid token." });
    }
    const { data: { user }, error } = await supabasePlatform.auth.getUser(access_token);
    if (error || !user) return res.status(401).json({ success: false, error: "Invalid or expired sign-in. Please try again." });
    if(blockedIdleToken(req,access_token))return idleExpired(res);
    const { data: profile, error: profileError } = await supabasePlatform.from("profiles")
      .select("role, display_name").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error("Could not load account permissions.");
    const key=providerKey(access_token,user.id);if(!key)return res.status(401).json({success:false,error:'Start a fresh sign-in to continue.'});
    const activity=await providerIdle(key,'check',user.id);if(!activity.allowed)return idleExpired(res);
    // Repeated events for the same user update the session; changing identity
    // always gets a new session ID to prevent session fixation.
    if (req.session.user?.id !== user.id) {
      await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    }
    req.session.user = {
      id: user.id,
      email: user.email ?? "",
      display_name: profile?.display_name ?? user.user_metadata?.display_name ?? user.user_metadata?.full_name,
      full_name: profile?.display_name ?? user.user_metadata?.full_name,
      avatar_url: user.user_metadata?.avatar_url,
      role: profile?.role ?? "student",
    };
    req.session.lastActivityAt=activity.lastActivityAt;
    delete req.session.idleBlocked;
    req.session.accessToken = access_token;
    req.session.refreshToken = refresh_token;
    // Save before responding: Vercel may finish the invocation immediately.
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    return res.json({ success: true, user: req.session.user, idle:idleState(req,activity.serverNow) });
  })().catch(next);
});

router.post("/signout", sameOriginOnly, (req, res, next) => {
 void (async()=>{
  const key=req.session.user?providerKey(req.session.accessToken,req.session.user.id):null;
  if(key)await providerIdle(key,'revoke',req.session.user!.id);
  await new Promise<void>((resolve,reject)=>req.session.destroy(error=>error?reject(error):resolve()));
  res.clearCookie("connect.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  if (req.is("application/json"))return res.json({ success: true });
  return res.redirect(303, safeAccountReturn(req.body?.returnTo) || "/");
 })().catch(next);
});

export default router;
