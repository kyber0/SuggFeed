"use client";

import { useEffect, useRef, useState } from "react";
import { X, User, EyeOff, LogIn, LogOut, Save, Check, Bell } from "lucide-react";
import { useAuth } from "./auth-context";
import { supabase } from "../lib/supabase";

interface Props {
  onClose: () => void;
}

export function ProfilePanel({ onClose }: Props) {
  const { user, signOut, openAuthModal } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load persisted prefs from localStorage after mount
  useEffect(() => {
    setDisplayName(localStorage.getItem("cv_display_name") ?? "");
    setIsAnonymous(localStorage.getItem("cv_anon_pref") === "true");
  }, []);

  // Seed display name from auth profile when signed in
  useEffect(() => {
    if (user) {
      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.display_name ??
        localStorage.getItem("cv_display_name") ??
        "";
      setDisplayName(name);
      // Fetch email_notifications_enabled from profiles
      supabase
        .from("profiles")
        .select("email_notifications_enabled")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setEmailNotifications(data.email_notifications_enabled ?? false);
        });
    }
  }, [user]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSave() {
    setSaving(true);
    // Always persist to localStorage (quick + works for anon)
    localStorage.setItem("cv_display_name", displayName.trim());
    localStorage.setItem("cv_anon_pref", String(isAnonymous));

    // If signed in, also update the profiles table
    if (user) {
      await supabase
        .from("profiles")
        .update({ 
          display_name: displayName.trim() || null,
          email_notifications_enabled: emailNotifications
        })
        .eq("id", user.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const initial = displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      <div className="panel-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="detail-panel profile-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="Your profile">
        {/* Header */}
        <div className="detail-panel-header">
          <div className="detail-panel-badges">
            <User size={14} strokeWidth={2} style={{ color: "var(--muted)" }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>My Profile</span>
          </div>
          <button className="panel-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="detail-panel-body">
          {/* Avatar */}
          <div className="profile-avatar-block">
            <div className="profile-avatar-large">{initial}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>
                {displayName || (user?.email?.split("@")[0] ?? "Anonymous user")}
              </div>
              {user && (
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{user.email}</div>
              )}
            </div>
          </div>

          {/* Auth status */}
          {!user ? (
            <div className="profile-auth-prompt">
              <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
                Sign in to link your comments and votes to your account across devices.
              </p>
              <button
                className="btn-primary"
                style={{ marginTop: 12, width: "100%" }}
                onClick={() => { openAuthModal("signin"); onClose(); }}
              >
                <LogIn size={14} strokeWidth={2} style={{ marginRight: 6 }} />
                Sign in
              </button>
              <button
                className="btn-ghost"
                style={{ marginTop: 8, width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => { openAuthModal("signup"); onClose(); }}
              >
                Create account
              </button>
            </div>
          ) : (
            <div className="profile-auth-prompt">
              <button
                className="btn-ghost danger-ghost"
                style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}
                onClick={async () => { await signOut(); onClose(); }}
              >
                <LogOut size={14} strokeWidth={2} />
                Sign out
              </button>
            </div>
          )}

          <hr className="profile-divider" />

          {/* Activity Link */}
          <div className="field">
            <a href="/profile" className="btn-ghost" style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6 }}>
              View my activity history
            </a>
          </div>

          <hr className="profile-divider" />

          {/* Display name */}
          <div className="field">
            <label htmlFor="profile-display-name">
              Display name
              <span className="field-hint">Shown on your comments</span>
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Student, Alex, or leave blank"
              maxLength={60}
            />
          </div>

          {/* Anonymous toggle */}
          <label className="anon-toggle-row" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            <span className="anon-toggle-label">
              <EyeOff size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
              Post comments anonymously by default
            </span>
          </label>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            When enabled, your display name will be hidden on new comments. You can still override this per comment.
          </p>

          {/* Email Notifications toggle (only if signed in) */}
          {user && (
            <>
              <label className="anon-toggle-row" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                />
                <span className="anon-toggle-label">
                  <Bell size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  Receive email updates
                </span>
              </label>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
                Get notified when the status of your ideas change, or when someone comments on your ideas.
              </p>
            </>
          )}

          <button
            className="btn-primary"
            style={{ marginTop: 20, width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saved
              ? <><Check size={14} strokeWidth={2.5} />Saved!</>
              : saving
                ? "Saving…"
                : <><Save size={14} strokeWidth={2} />Save preferences</>}
          </button>
        </div>
      </aside>
    </>
  );
}
