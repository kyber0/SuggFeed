"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./auth-context";
import { AuthModal } from "./auth-modal";
import { ProfilePanel } from "./profile-panel";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const { user, signOut, openAuthModal } = useAuth();
  const pathname = usePathname();
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
          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit", padding: "8px 12px" }}
          >
            <User size={14} /> My Profile & Ideas
          </Link>
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
      <Link
        href="/profile"
        className={`btn-ghost ${pathname === "/profile" ? "active" : ""}`}
        aria-label="My profile"
        style={{ display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}
      >
        <User size={14} />
        <span className="profile-label">Profile</span>
      </Link>
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
          <Link href="/" className={`nav-link-hide-mobile ${pathname === "/" ? "active" : ""}`}>Home</Link>
          <Link href="/feed" className={`nav-link-hide-mobile ${pathname === "/feed" ? "active" : ""}`}>Community ideas</Link>
          <Link href="/roadmap" className={`nav-link-hide-mobile ${pathname === "/roadmap" ? "active" : ""}`}>Roadmap</Link>
          <Link href="/profile" className={`nav-link-hide-mobile ${pathname === "/profile" ? "active" : ""}`}>Profile</Link>
          <Link href="/admin" className={`nav-link-hide-mobile ${pathname === "/admin" ? "active" : ""}`}>Staff portal</Link>
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
