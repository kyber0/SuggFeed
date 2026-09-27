"use client";
import { FormEvent, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth-context";
import { useToast } from "./toast";
import { getStoredPreference, setStoredPreference } from "../lib/cache-manager";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, X } from "lucide-react";

/* ── Google G logo (full-color inline SVG) ── */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-19.3 0-1.3-.1-2.5-.3-3.7z" />
      <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.4 4.4-17.7 10.7z" />
      <path fill="#FBBC05" d="M24 45c5.6 0 10.6-1.9 14.5-5.1L32 33.8c-2 1.3-4.5 2.2-8 2.2-6.3 0-11.6-4.2-13.5-10l-7.1 5.5C8.9 40.4 15.9 45 24 45z" />
      <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.9 2.9-2.8 5.3-5.4 6.9l6.5 5.1c3.8-3.5 6.1-8.7 6.1-15.2 0-1.3-.1-2.5-.5-5.3z" />
    </svg>
  );
}

export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">(authModalTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const savedEmail = getStoredPreference<string>("auth_email", "");
    if (savedEmail) setEmail(savedEmail);
  }, []);

  if (!authModalOpen) return null;

  function reset() {
    setPassword(""); setName("");
    setBusy(false); setMagicSent(false); setShowPassword(false);
  }

  function switchTab(t: "signin" | "signup") { setTab(t); reset(); }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast(error.message, "error"); return; }
    setStoredPreference("auth_email", email.trim());
    toast("Welcome back! You're now signed in.", "success");
    closeAuthModal(); reset();
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    setBusy(false);
    if (error) { toast(error.message, "error"); return; }
    setStoredPreference("auth_email", email.trim());
    toast("Account created! Check your email to confirm.", "success");
    closeAuthModal(); reset();
  }

  async function handleMagicLink() {
    if (!email) { toast("Enter your email address first.", "error"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { toast(error.message, "error"); return; }
    setMagicSent(true);
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { toast(error.message, "error"); setBusy(false); }
  }

  const isSignIn = tab === "signin";

  return (
    <div
      className="am-backdrop"
      onClick={(e) => e.target === e.currentTarget && closeAuthModal()}
      role="presentation"
    >
      <div
        className="am-card"
        role="dialog"
        aria-modal="true"
        aria-label={isSignIn ? "Sign in to SuggFeed" : "Create your SuggFeed account"}
      >
        {/* Mobile drag handle */}
        <div className="am-handle" aria-hidden="true" />

        {/* Close button */}
        <button type="button" className="am-close" onClick={closeAuthModal} aria-label="Close">
          <X size={16} strokeWidth={2.5} />
        </button>

        {magicSent ? (
          /* ── Magic link sent ── */
          <div className="am-magic-confirm">
            <div className="am-magic-icon" aria-hidden="true">📬</div>
            <h2 className="am-magic-heading">Check your inbox</h2>
            <p className="am-magic-body">
              We sent a sign-in link to <strong>{email}</strong>. Click the link in the email to sign in instantly — no password needed.
            </p>
            <button type="button" className="am-btn-ghost" onClick={() => setMagicSent(false)}>
              ← Try another way
            </button>
          </div>
        ) : (
          <>
            {/* ── Tab switcher ── */}
            <div className="am-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={isSignIn}
                className={`am-tab${isSignIn ? " am-tab--active" : ""}`}
                onClick={() => switchTab("signin")}
              >
                Sign in
              </button>
              <button
                role="tab"
                aria-selected={!isSignIn}
                className={`am-tab${!isSignIn ? " am-tab--active" : ""}`}
                onClick={() => switchTab("signup")}
              >
                Create account
              </button>
            </div>

            {/* ── Brand header ── */}
            <div className="am-brand">
              <div className="am-brand-icon" aria-hidden="true">
                <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                  <rect width="32" height="32" rx="10" fill="var(--navy)" />
                  <path d="M8 12h16M8 16h10M8 20h12" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h1 className="am-heading">
                  {isSignIn ? "Welcome back" : "Join SuggFeed"}
                </h1>
                <p className="am-subtext">
                  {isSignIn ? "Sign in to your campus account" : "Make your campus voice heard"}
                </p>
              </div>
            </div>

            {/* ── Google SSO ── */}
            <button type="button" className="am-btn-google" onClick={handleGoogleSignIn} disabled={busy}>
              <GoogleLogo />
              <span>Continue with Google</span>
            </button>

            <div className="am-divider"><span>or</span></div>

            {/* ── Sign In Form ── */}
            {isSignIn ? (
              <form onSubmit={handleSignIn} className="am-form" noValidate>
                <div className="am-field">
                  <label className="am-label" htmlFor="am-email-signin">Email address</label>
                  <div className="am-input-wrap">
                    <Mail size={15} className="am-input-icon" aria-hidden="true" />
                    <input
                      id="am-email-signin"
                      className="am-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="am-field">
                  <label className="am-label" htmlFor="am-password-signin">Password</label>
                  <div className="am-input-wrap">
                    <Lock size={15} className="am-input-icon" aria-hidden="true" />
                    <input
                      id="am-password-signin"
                      className="am-input am-input--has-toggle"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="am-pw-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button className="am-btn-primary" type="submit" disabled={busy}>
                  {busy
                    ? <Loader2 size={16} className="am-spinner" />
                    : <><span>Sign in</span><ArrowRight size={15} strokeWidth={2.5} /></>}
                </button>

                <button type="button" className="am-btn-ghost" onClick={handleMagicLink} disabled={busy}>
                  <Mail size={14} />
                  Email me a sign-in link
                </button>

                <p className="am-switch-hint">
                  Don&rsquo;t have an account?{" "}
                  <button type="button" className="am-switch-link" onClick={() => switchTab("signup")}>
                    Create one
                  </button>
                </p>
              </form>
            ) : (
              /* ── Create Account Form ── */
              <form onSubmit={handleSignUp} className="am-form" noValidate>
                <div className="am-field">
                  <label className="am-label" htmlFor="am-name-signup">
                    Full name <span className="am-label-hint">(optional)</span>
                  </label>
                  <div className="am-input-wrap">
                    <User size={15} className="am-input-icon" aria-hidden="true" />
                    <input
                      id="am-name-signup"
                      className="am-input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your display name"
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div className="am-field">
                  <label className="am-label" htmlFor="am-email-signup">Email address</label>
                  <div className="am-input-wrap">
                    <Mail size={15} className="am-input-icon" aria-hidden="true" />
                    <input
                      id="am-email-signup"
                      className="am-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="am-field">
                  <label className="am-label" htmlFor="am-password-signup">Password</label>
                  <div className="am-input-wrap">
                    <Lock size={15} className="am-input-icon" aria-hidden="true" />
                    <input
                      id="am-password-signup"
                      className="am-input am-input--has-toggle"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="am-pw-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {password.length > 0 && password.length < 8 && (
                    <p className="am-field-error">At least 8 characters required</p>
                  )}
                </div>

                <button className="am-btn-primary" type="submit" disabled={busy}>
                  {busy
                    ? <Loader2 size={16} className="am-spinner" />
                    : <><span>Create account</span><ArrowRight size={15} strokeWidth={2.5} /></>}
                </button>

                <p className="am-switch-hint">
                  Already have an account?{" "}
                  <button type="button" className="am-switch-link" onClick={() => switchTab("signin")}>
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

