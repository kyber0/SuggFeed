"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User, Settings } from "lucide-react";
import { useAuth } from "./auth-context";
import { AuthModal } from "./auth-modal";
import { ProfilePanel } from "./profile-panel";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const { user, signOut, openAuthModal } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const initial = user?.user_metadata?.full_name?.[0]?.toUpperCase()
    ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "Account";

  // Auth state is only known after mount (supabase session check happens in useEffect).
  // Render the anonymous buttons by default — they match what the server sends and
  // what the client initially sees when no session is detected.
  // Only swap to the avatar chip AFTER mount when a signed-in user is confirmed.
  const navControls = mounted && user ? (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <button
        className="avatar-chip"
        onClick={() => setDropdownOpen((v) => !v)}
        aria-expanded={dropdownOpen}
      >
        <div className="avatar-circle">
          {user.user_metadata?.avatar_url
            ? <img src={user.user_metadata.avatar_url} alt={initial} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} referrerPolicy="no-referrer" />
            : initial}
        </div>
        <span>{displayName.split(" ")[0]}</span>
        <ChevronDown size={14} color="var(--muted)" />
      </button>
      {dropdownOpen && (
        <div className="dropdown-menu" onMouseLeave={() => setDropdownOpen(false)}>
        <div className="dropdown-user-header">
            <div className="dropdown-user-name">{displayName}</div>
            <div className="dropdown-user-email">{user.email}</div>
          </div>
          <div className="divider" />
          <button
            onClick={() => { setProfileOpen(true); setDropdownOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Settings size={14} /> My Profile
          </button>
          <div className="divider" />
          <button
            className="danger"
            onClick={async () => { await signOut(); setDropdownOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  ) : (
    <>
      <button
        className="btn-ghost"
        onClick={() => setProfileOpen(true)}
        aria-label="My profile"
        style={{ display: "flex", alignItems: "center", gap: 5 }}
      >
        <User size={14} />
        <span className="profile-label">Profile</span>
      </button>
      <button className="btn-primary-sm" onClick={() => openAuthModal("signin")}>
        Sign in
      </button>
    </>
  );


  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">Sugg<span>Feed</span></a>
        <nav>
          <a href="/roadmap" className="nav-link-hide-mobile">Roadmap</a>
          <a href="/#feed" className="nav-link-hide-mobile">Community ideas</a>
          <a href="/admin" className="nav-link-hide-mobile">Staff portal</a>
          {navControls}
          <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
          <ThemeToggle />
        </nav>
      </header>

      <AuthModal />
      {profileOpen && <ProfilePanel onClose={() => setProfileOpen(false)} />}
    </>
  );
}
