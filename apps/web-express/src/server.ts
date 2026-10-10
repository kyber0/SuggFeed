import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { Eta } from "eta";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import "./types"; // session augmentation
import { supabase as publicSupabase, supabaseUrl, supabaseAnonKey } from "./lib/supabase";

/* ── Environment validation ────────────────────────────────────────────────── */
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY"] as const;
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key] && !process.env[`NEXT_PUBLIC_${key}`]);
if (missingEnv.length > 0) {
  console.error(`[startup] WARNING: Missing required environment variables: ${missingEnv.join(", ")}. Please configure them in your Vercel Project Settings.`);
}
const sessionSecret =
  process.env.SESSION_SECRET && !process.env.SESSION_SECRET.includes("change-in-production")
    ? process.env.SESSION_SECRET
    : "sf-session-secure-prod-key-64b-fallback-f10c3b";

// Import routes
import homeRouter from "./routes/home";
import feedRouter from "./routes/feed";
import ideaRouter from "./routes/idea";
import roadmapRouter from "./routes/roadmap";
import profileRouter from "./routes/profile";
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import apiRouter from "./routes/api";
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
    cb(null, html);
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
        // Inline scripts used for theme init, auth sync, and component logic
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://challenges.cloudflare.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
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
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    // HSTS — only meaningful in production over HTTPS
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false, // allow CDN assets
  })
);

/* ── Compression ─────────────────────────────────────────────────────────── */
app.use(compression());

/* ── Request logging ─────────────────────────────────────────────────────── */
app.use(morgan(isProd ? "combined" : "dev"));

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

/* ── Body parsers ────────────────────────────────────────────────────────── */
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));
app.use(cookieParser());

/* ── Session ─────────────────────────────────────────────────────────────── */
app.use(
  session({
    secret: sessionSecret,
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

/* ── Static files ────────────────────────────────────────────────────────── */
app.use(express.static(publicDir, {
  maxAge: isProd ? "7d" : 0,
}));

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
    const { error } = await publicSupabase.from("categories").select("id").limit(1);
    if (error) throw error;
    res.json({ status: "healthy", database: "connected", ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unhealthy", database: "disconnected", ts: new Date().toISOString() });
  }
});

/* ── Rate-limited route groups ───────────────────────────────────────────── */
app.use("/api/", generalApiLimiter);
app.use("/api/submit", writeLimiter);
app.use("/api/vote", writeLimiter);
app.use("/api/comments", writeLimiter);
app.use("/auth/", authLimiter);

/* ── Routes ──────────────────────────────────────────────────────────────── */
app.use("/", homeRouter);
app.use("/feed", feedRouter);
app.use("/idea", ideaRouter);
app.use("/roadmap", roadmapRouter);
app.use("/profile", profileRouter);
app.use("/admin", adminRouter);
app.use("/auth", authRouter);
app.use("/api", apiRouter);
app.use("/", legalRouter);

/* ── 404 ─────────────────────────────────────────────────────────────────── */
app.use((_req: Request, res: Response) => {
  res.status(404).render("404", { title: "Page Not Found" });
});

/* ── Centralized error handler ───────────────────────────────────────────── */
// Must have 4 parameters for Express to treat it as an error handler.
// Returns a generic message — never leaks stack traces or file paths.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[error] ${req.method} ${req.path}`, err);
  const isJson = req.path.startsWith("/api/") || req.headers.accept?.includes("application/json") || req.xhr;
  if (isJson) {
    const errorMsg = (err as any).message || "Internal Server Error";
    return res.status(500).json({ success: false, error: errorMsg });
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
