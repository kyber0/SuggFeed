import { Router, Request, Response, NextFunction } from "express";
import { supabaseService } from "../lib/supabase";

const router = Router();

/** Wraps async route handlers so thrown errors reach the Express error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Validates that state-changing requests originate from the same site.
 * Defends against login CSRF (forcing victim into attacker's account).
 */
function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // In production, enforce strict origin matching.
  // In development, localhost is always allowed.
  // APP_ORIGIN is preferred, but infer the current host when it is not set so
  // deployments on a custom domain do not reject their own browser session sync.
  const allowedOrigin = process.env.APP_ORIGIN ?? `${req.protocol}://${req.get("host")}`;
  const requestOrigin = origin || (referer ? new URL(referer).origin : null);

  if (process.env.NODE_ENV === "production" && requestOrigin !== allowedOrigin) {
    return res.status(403).json({ error: "Cross-origin request rejected." });
  }
  next();
}

/* ── Auth callback — exchange code for session ────────────────────────────── */
router.get(
  "/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const code = req.query["code"] as string | undefined;
    if (!code) return res.redirect("/?error=no_code");

    const { data, error } = await supabaseService.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw error ?? new Error("No session");

    const { user, session } = data;

    const { data: profile } = await supabaseService
      .from("profiles")
      .select("role, display_name")
      .eq("id", user.id)
      .single();

    // Regenerate session ID on login to prevent session fixation
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = {
      id: user.id,
      email: user.email!,
      display_name:
        profile?.display_name ??
        user.user_metadata?.["display_name"] ??
        user.user_metadata?.["full_name"],
      role: profile?.role ?? "user",
    };
    req.session.accessToken = session.access_token;
    req.session.refreshToken = session.refresh_token;

    res.redirect("/profile");
  })
);

/* ── Client session sync ─────────────────────────────────────────────────── */
// Accept only JSON (not form-urlencoded) and enforce same-origin to prevent
// login CSRF (attacker POSTing their own valid token to log victim in as attacker).
router.post(
  "/session",
  sameOriginOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { access_token, refresh_token } = req.body as {
      access_token?: unknown;
      refresh_token?: unknown;
    };

    if (typeof access_token !== "string" || !access_token) {
      return res.status(400).json({ error: "Missing or invalid token." });
    }

    const {
      data: { user },
      error,
    } = await supabaseService.auth.getUser(access_token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const { data: profile } = await supabaseService
      .from("profiles")
      .select("role, display_name")
      .eq("id", user.id)
      .single();

    // Regenerate session ID on login to prevent session fixation
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = {
      id: user.id,
      email: user.email!,
      display_name:
        profile?.display_name ??
        user.user_metadata?.["display_name"] ??
        user.user_metadata?.["full_name"],
      role: profile?.role ?? "user",
    };
    req.session.accessToken = access_token;
    req.session.refreshToken = typeof refresh_token === "string" ? refresh_token : undefined;

    res.json({ success: true, user: req.session.user });
  })
);

/* ── Sign-out ─────────────────────────────────────────────────────────────── */
router.post("/signout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

/* ── Auth callback page (client-side magic link handler) ─────────────────── */
router.get("/callback/client", (_req: Request, res: Response) => {
  res.render("auth-callback", {
    title: "Signing in… — SuggFeed",
  });
});

export default router;
