import assistantRouter from './routes/assistant';
import assistantAdminRouter from './routes/assistant-admin';
import submissionSafetyRouter from './routes/submission-safety';
import "dotenv/config";
import { requireStaffAssurance } from './lib/auth-assurance';
import { navigationContext } from './lib/navigation-context';
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { Eta } from "eta";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import {readBurstLimit,sharedReadBudget} from './lib/read-budget';
import securityMaintenanceRouter from './routes/security-maintenance';
import rateLimit from "express-rate-limit";
import { randomBytes } from "crypto";
import { SupabaseSessionStore } from "./lib/session-store";
import { sameOriginOnly, browserSecurityHeaders } from "./lib/security";
import { safeRequestPath } from "./lib/request-path";
import accountSecurityRouter from './routes/account-security';
import { validateIdentity } from "./lib/identity";
import { startFeedAccountState } from "./lib/feed-account";
import { startPublicNavigation, warmPublicNavigation, publicFeedTotal } from "./lib/navigation-data";
import { resolveSchool } from './lib/school-context';
import { schoolUser,currentSchool } from './lib/school-scope';
import { schoolHtml } from './lib/school-path';
import schoolsRouter from './routes/schools';
import platformDashboardRouter from './routes/platform-dashboard';
import studentAccessRouter from './routes/student-access';
import schoolMembersRouter from './routes/school-members';
import schoolSubmissionsRouter from './routes/school-submissions';
import schoolBrandingRouter from './routes/school-branding';
import schoolCustomizationRouter from './routes/school-customization';
import { sharedWriteBudget, sharedAuthBudget } from './lib/shared-rate-limit';
import "./types"; // session augmentation
import { supabase as publicSupabase, supabaseService, supabasePlatform, supabaseUrl, supabaseAnonKey } from "./lib/supabase";

/* ── Environment validation ────────────────────────────────────────────────── */
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY"] as const;
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key] && !process.env[`NEXT_PUBLIC_${key}`]);
if (missingEnv.length > 0) {
  console.error(`[startup] WARNING: Missing required environment variables: ${missingEnv.join(", ")}. Please configure them in your Vercel Project Settings.`);
}
const configuredSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && (
  missingEnv.length || !process.env.SUPABASE_SERVICE_ROLE_KEY || !configuredSecret ||
  configuredSecret.length < 32 || /change-|placeholder|fallback/i.test(configuredSecret)
)) throw new Error("Production requires Supabase keys and a strong SESSION_SECRET (32+ characters).");
const sessionSecret = configuredSecret || randomBytes(32).toString("hex");

// Import routes
import homeRouter from "./routes/home";
import feedRouter from "./routes/feed";
import ideaRouter from "./routes/idea";
import roadmapRouter from "./routes/roadmap";
import profileRouter from "./routes/profile";
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import apiRouter from "./routes/api";
import assignmentsRouter from './routes/assignments';
import staffWorkspaceRouter from './routes/staff-workspace';
import progressRouter from './routes/progress';
import notificationsRouter from './routes/notifications';
import engagementRouter from './routes/engagement';
import progressEvidenceRouter, { cleanupHandler } from './routes/progress-evidence';
import { communityRouter, communityPages } from './routes/community';
import digestRouter from './routes/digests';
import legalRouter from "./routes/legal";

const app = express();
const isProd = process.env.NODE_ENV === "production";

/* ── Trust reverse proxy (Render, Railway, Fly, Cloudflare, Nginx) ───────── */
app.set("trust proxy", 1);

/* ── Eta Template Engine & Static Paths ─────────────────────────────────── */
const viewsDir = fs.existsSync(path.join(process.cwd(), "views"))
  ? path.join(process.cwd(), "views")
  : path.join(__dirname, "..", "views");

const publicDir = fs.existsSync(path.join(process.cwd(), "public"))
  ? path.join(process.cwd(), "public")
  : path.join(__dirname, "..", "public");

const eta = new Eta({
  views: viewsDir,
  cache: isProd,
});

app.engine("eta", (filePath: string, data: object, cb: (err: any, str?: string) => void) => {
  try {
    const viewName = path
      .relative(viewsDir, filePath)
      .replace(/\\/g, "/");
    const html = eta.render(viewName, data as Record<string, unknown>);
    cb(null, schoolHtml(html, (data as any).schoolBase || ''));
  } catch (err) {
    cb(err as Error);
  }
});
app.set("view engine", "eta");
app.set("views", viewsDir);

/* ── Security headers (helmet) ───────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Executable scripts are self-hosted; inline JSON blocks are data only.
        scriptSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
        ],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: [
          "'self'",
          ...(supabaseUrl ? [supabaseUrl] : []),
          // Supabase realtime / storage sub-domains
          "https://*.supabase.co",
          "https://challenges.cloudflare.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.supabase.co",
          "https://*.googleusercontent.com",
          "https://lh3.googleusercontent.com",
        ],
        frameSrc: ["https://challenges.cloudflare.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    // HSTS — only meaningful in production over HTTPS
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false, // allow CDN assets
  })
);
app.use(browserSecurityHeaders);

/* ── Compression ─────────────────────────────────────────────────────────── */
app.use(compression());

/* ── Request logging ─────────────────────────────────────────────────────── */
// OAuth and tracking codes must not enter request logs.
morgan.token("safe-path", req => safeRequestPath(req.url ?? "/"));
app.use(morgan(":method :safe-path :status :response-time ms"));

/* ── Rate limiters ───────────────────────────────────────────────────────── */
// General API: 200 req / 15 min per IP
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests — please slow down." },
});

// Write endpoints: 10 req / hour per IP
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Submission limit reached. Please try again later." },
});

// Auth endpoints: 20 req / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many auth attempts — please wait." },
});

// Error pages must render even if parsing, session storage or identity fails.
app.use((req,res,next) => {
  Object.assign(res.locals,{user:null,currentPath:req.path,supabaseUrl,supabaseAnonKey});
  next();
});

/* ── Body parsers ────────────────────────────────────────────────────────── */
app.use(sameOriginOnly);
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));
app.use(cookieParser());
// Assets do not need session DB reads.
app.use(express.static(publicDir, {
  maxAge: isProd ? "7d" : 0,
  setHeaders(res,filePath){if(path.basename(filePath)==='sw.js')res.setHeader('Cache-Control','no-cache');},
}));
/* ── Session ─────────────────────────────────────────────────────────────── */
app.use(readBurstLimit);
app.use(sharedReadBudget);
app.use(securityMaintenanceRouter);
app.use((_req,res,next)=>{res.locals.sessionStarted=performance.now();next();});
app.use(
  session({
    secret: sessionSecret,
    store: isProd ? new SupabaseSessionStore(supabasePlatform, sessionSecret) : undefined,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,         // HTTPS-only in production
      httpOnly: true,         // No JS access to the cookie
      sameSite: "lax",        // CSRF mitigation for standard navigation
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use((_req,res,next)=>{res.append("Server-Timing",`session;dur=${(performance.now()-res.locals.sessionStarted).toFixed(1)}`);delete res.locals.sessionStarted;next();});
app.use(validateIdentity);
app.use((_req,res,next)=>{
  const status=res.locals.publicNavigationCache;
  if(['hit','pending','miss'].includes(status))res.append('Server-Timing',`public-cache;desc="${status}"`);
  next();
});
// HTML and API responses can contain account-specific data.
app.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });

/* ── Locals available in every template ──────────────────────────────────── */
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals["user"] = req.session.user ?? null;
  // Anon key is safe to expose to templates (used for client-side Supabase Auth)
  res.locals["supabaseUrl"] = supabaseUrl;
  res.locals["supabaseAnonKey"] = supabaseAnonKey;
  res.locals["currentPath"] = req.path;
  next();
});

/* ── Health check (before rate limiters) ─────────────────────────────────── */
// Aliased at both /health and /api/health so container orchestrators and the
// API router both work correctly.
app.get(["/health", "/api/health"], async (_req: Request, res: Response) => {
  try {
    const { error } = await supabasePlatform.from("schools").select("id").limit(1);
    if (error) throw error;
    res.json({ status: "healthy", database: "connected", ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unhealthy", database: "disconnected", ts: new Date().toISOString() });
  }
});

/* Global identity and school onboarding routes. */
app.use('/auth', sharedAuthBudget, (req,res,next) => req.method === 'POST' ? authLimiter(req,res,next) : next(), authRouter);
app.use(['/schools','/platform','/s/:schoolSlug/admin'],sharedAuthBudget);
app.use(navigationContext);
app.use('/account/security', accountSecurityRouter);
app.use('/', schoolCustomizationRouter);
app.use('/', platformDashboardRouter);
app.use('/', schoolsRouter);
app.use('/', studentAccessRouter);
app.use('/', schoolMembersRouter);
app.use('/', digestRouter); // only global internal cron matches without a school
app.get('/internal/progress-evidence-cleanup', cleanupHandler);
app.use('/', legalRouter);
app.use('/',(req,res,next)=>req.path==='/internal/assignment-escalation'?assignmentsRouter(req,res,next):next());
app.use('/',(req,res,next)=>req.path==='/help'||/^\/profile\/help\/?$/i.test(req.path)||req.path.startsWith('/help/')||req.path.startsWith('/api/assistant/')?generalApiLimiter(req,res,()=>assistantRouter(req,res,next)):next());
app.use('/',(req,res,next)=>req.path.startsWith('/platform/assistant')?assistantAdminRouter(req,res,next):next());
app.get('/', (_req,res) => res.redirect(302, '/account/home'));
// Legacy entry points cannot silently choose a customer's school.
app.use((req,res,next) => {
  if (req.path === '/s' || req.path.startsWith('/s/')) return next();
  if (['GET','HEAD'].includes(req.method)) {
    if (['/feed','/roadmap','/profile','/notifications','/inbox','/admin','/admin/reviews','/admin/my-work','/admin/routing','/admin/assignments','/admin/safety','/admin/board','/admin/community','/admin/analytics','/admin/staff'].includes(req.path.replace(/\/$/, ''))) return res.redirect(302, '/account/home');
    return res.status(404).render('404', { title: 'Page not found' });
  }
  return res.status(410).json({success:false,error:'Choose a school and use its current address.'});
});
app.use(resolveSchool);
app.use((req,_res,next)=>{const school=currentSchool();if(school)school.staffRead=/^\/(?:admin(?:\/|$)|api\/staff(?:\/|$)|staff\/workspace(?:\/|$)|api\/community\/staff(?:\/|$))/.test(req.path);next();});
app.use((req,res,next) => {res.locals.currentPath=req.path;res.locals.user=schoolUser(req);next();});
// Scope and freshly verified membership precede privileged assurance checks.
app.use(requireStaffAssurance);
app.use('/branding',schoolBrandingRouter);
app.use(startFeedAccountState);
app.use(startPublicNavigation);
app.get('/api/navigation-cache',generalApiLimiter,warmPublicNavigation);
app.get('/api/feed-total',generalApiLimiter,publicFeedTotal);
app.use(sharedWriteBudget);
app.use('/api/', generalApiLimiter);
app.use(schoolSubmissionsRouter);
app.use('/api/submit', writeLimiter);
app.use('/api/vote', writeLimiter);
app.use('/api/comments', writeLimiter);
app.use('/', homeRouter);
app.use('/feed', feedRouter);
app.use('/idea', ideaRouter);
app.use('/roadmap', roadmapRouter);
app.use('/profile', profileRouter);
app.use('/notifications', notificationsRouter);
app.use('/',assistantRouter);
app.use('/',assistantAdminRouter);
app.use('/',submissionSafetyRouter);
app.use('/', assignmentsRouter);
app.use('/admin', adminRouter);
app.use('/api/community', communityRouter);
app.use('/', communityPages);
app.use('/', digestRouter);
app.use('/api', apiRouter);
app.use('/api', engagementRouter);
app.use('/api/progress-evidence', progressEvidenceRouter);
app.use('/api/staff/progress-upload', progressEvidenceRouter);
app.use('/api/staff', progressRouter);
app.use('/staff/workspace', generalApiLimiter, progressRouter);
app.use('/api/staff', staffWorkspaceRouter);

/* ── 404 ─────────────────────────────────────────────────────────────────── */
app.use((_req: Request, res: Response) => {
  res.status(404).render("404", { title: "Page Not Found" });
});

/* ── Centralized error handler ───────────────────────────────────────────── */
// Must have 4 parameters for Express to treat it as an error handler.
// Returns a generic message — never leaks stack traces or file paths.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  res.setHeader("Cache-Control","private, no-store");
  console.error(`[error] ${req.method} ${safeRequestPath(req.path)}: ${err.name}`);
  if ((err as any).status === 503) {
    res.setHeader('Retry-After','30');
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.headers.accept?.includes('application/json') || req.xhr) return res.status(503).json({success:false,error:'The service is temporarily unavailable. Please try again shortly.'});
    return res.status(503).render('school-message',{title:'Temporarily unavailable',message:'The service is temporarily unavailable. Please try again shortly.'});
  }
  const isJson = req.path.startsWith("/api/") || req.path.startsWith("/auth/") || req.path.startsWith('/roadmap/idea/') || req.headers.accept?.includes("application/json") || req.xhr;
  if (isJson) {
    const status = (err as any).status === 400 ? 400 : (err as any).status === 413 ? 413 : 500;
    return res.status(status).json({ success: false, error: status === 400 ? "Invalid request body." : status === 413 ? "Request is too large." : "The service could not complete this request. Please try again." });
  }
  res.status(500).render("500", { title: "Server Error — SuggFeed" });
});

/* ── Start server (only in standalone Node environments, not on Vercel) ───── */
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3001;
  const server = app.listen(PORT, () => {
    console.log(`\n  🚀 SuggFeed (Express + Eta + TS) → http://localhost:${PORT}\n`);
  });

  /* ── Graceful shutdown (SIGTERM from container orchestrators, SIGINT from Ctrl-C) ── */
  function shutdown(signal: string) {
    console.log(`[shutdown] Received ${signal} — draining connections…`);
    server.close(() => {
      console.log("[shutdown] HTTP server closed. Exiting.");
      process.exit(0);
    });
    // Force-exit after 10 s if connections don't drain
    setTimeout(() => {
      console.error("[shutdown] Forced exit after timeout.");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
export { app };
