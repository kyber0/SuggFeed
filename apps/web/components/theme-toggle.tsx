"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button 
        className="btn-ghost" 
        style={{ padding: "6px", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0 }} 
        aria-hidden="true" 
      >
        <Sun size={18} />
      </button>
    );
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme;

  return (
    <button
      className="btn-ghost"
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      title="Toggle theme"
      style={{ padding: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {currentTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
