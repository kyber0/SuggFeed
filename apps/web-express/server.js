require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

/* ── Middleware ──────────────────────────────────────────────────────────── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
  })
);

/* ── Static files ────────────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, "public")));

/* ── View engine ─────────────────────────────────────────────────────────── */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ── Make user & config available in all templates ───────────────────────── */
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.supabaseUrl = process.env.SUPABASE_URL;
  res.locals.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  res.locals.currentPath = req.path;
  next();
});

/* ── Routes ──────────────────────────────────────────────────────────────── */
app.use("/", require("./routes/home"));
app.use("/feed", require("./routes/feed"));
app.use("/idea", require("./routes/idea"));
app.use("/roadmap", require("./routes/roadmap"));
app.use("/profile", require("./routes/profile"));
app.use("/admin", require("./routes/admin"));
app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/api"));

/* ── 404 ─────────────────────────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found" });
});

/* ── Start ───────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  🚀 SuggFeed (Express) running at http://localhost:${PORT}\n`);
});
