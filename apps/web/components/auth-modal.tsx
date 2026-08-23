"use client";
import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./auth-context";
import { useToast } from "./toast";

export function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">(authModalTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const { toast } = useToast();

  if (!authModalOpen) return null;

  function reset() { setEmail(""); setPassword(""); setName(""); setBusy(false); setMagicSent(false); }

  function switchTab(t: "signin" | "signup") { setTab(t); reset(); }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast(error.message, "error"); return; }
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
      options: { redirectTo: window.location.origin },
    });
    if (error) { toast(error.message, "error"); setBusy(false); }
    // On success the browser redirects — no need to reset busy
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeAuthModal()}>
      <div className="modal-sheet" role="dialog" aria-modal="true">
        <div className="modal-handle" />

        <div className="modal-tabs">
          <button className={tab === "signin" ? "active" : ""} onClick={() => switchTab("signin")}>Sign in</button>
          <button className={tab === "signup" ? "active" : ""} onClick={() => switchTab("signup")}>Create account</button>
        </div>

        {magicSent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
            <h2 style={{ marginBottom: 8 }}>Check your inbox</h2>
            <p>We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.</p>
            <button
              className="magic-link-btn"
              style={{ marginTop: 24 }}
              onClick={() => setMagicSent(false)}
            >Try another way</button>
          </div>
        ) : tab === "signin" ? (
          <form onSubmit={handleSignIn}>
            <button type="button" className="btn-google" onClick={handleGoogleSignIn} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-19.3 0-1.3-.1-2.5-.3-3.7z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.4 4.4-17.7 10.7z" opacity="0"/>
              </svg>
              Continue with Google
            </button>
            <div className="modal-divider">or</div>
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
            <div className="modal-divider">or</div>
            <button type="button" className="magic-link-btn" onClick={handleMagicLink} disabled={busy}>
              ✉️ &nbsp; Email me a sign-in link
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp}>
            <button type="button" className="btn-google" onClick={handleGoogleSignIn} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-19.3 0-1.3-.1-2.5-.3-3.7z"/>
              </svg>
              Continue with Google
            </button>
            <div className="modal-divider">or</div>
            <div className="field">
              <label>Full name <span className="field-hint">(optional)</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
            </div>
            <button className="btn-primary" type="submit" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? "Creating account…" : "Create account →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
