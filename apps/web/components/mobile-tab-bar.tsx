"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, MessageSquare, Map, User } from "lucide-react";
import { useAuth } from "./auth-context";
import { useSubmitIdea } from "./submit-idea-context";

type Tab = { href: string; label: string; Icon: any; isAction?: boolean };

const TABS: Tab[] = [
  { href: "/",        label: "Home",      Icon: Home },
  { href: "/feed",    label: "Ideas",     Icon: MessageSquare },
  { href: "#submit",  label: "Submit",    Icon: PlusCircle, isAction: true },
  { href: "/roadmap", label: "Roadmap",   Icon: Map },
  { href: "/profile", label: "Profile",   Icon: User },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { openSubmitPanel } = useSubmitIdea();

  return (
    <nav className="mobile-tab-bar" aria-label="Mobile navigation">
      {TABS.map(({ href, label, Icon, isAction }) => {
        // Special case for Submit action tab
        if (isAction) {
          return (
            <button
              key="submit"
              onClick={openSubmitPanel}
              className="mobile-tab"
              type="button"
            >
              <Icon size={22} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          );
        }

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
