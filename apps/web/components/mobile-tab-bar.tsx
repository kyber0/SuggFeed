"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, MessageSquare, Map, User } from "lucide-react";
import { useAuth } from "./auth-context";

const TABS = [
  { href: "/",        label: "Submit",    Icon: PlusCircle },
  { href: "/feed",    label: "Ideas",     Icon: MessageSquare },
  { href: "/roadmap", label: "Roadmap",   Icon: Map },
  { href: "/profile", label: "My Activity", Icon: User },
];

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tab-bar" aria-label="Mobile navigation">
      {TABS.map(({ href, label, Icon }) => {
        // Match exact root, prefix-match everything else
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`mobile-tab${isActive ? " mobile-tab--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
