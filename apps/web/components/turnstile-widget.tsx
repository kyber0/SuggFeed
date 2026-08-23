"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

// Cloudflare official always-passes test key for localhost dev.
// See https://developers.cloudflare.com/turnstile/reference/testing/
const DEV_TEST_KEY = "1x00000000000000000000AA";

function getCurrentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.hasAttribute("data-theme") ? "dark" : "light";
}

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey?: string;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  
  // Keep onToken in a ref — widget never re-renders when callback identity changes
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  // Use the provided siteKey. Only fall back to the test key if no key is configured.
  // Forcing DEV_TEST_KEY in dev causes verification to fail when testing against a production backend.
  const key = siteKey || DEV_TEST_KEY;

  useEffect(() => {
    if (!key || !container.current) return;

    const render = () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
      if (container.current && window.turnstile) {
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: key,
          theme: getCurrentTheme(),
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      }
    };

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/"]'
      );
      const script = existing ?? document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      if (!existing) document.head.appendChild(script);
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [key]); // only key changes should recreate the widget

  if (!key) {
    return (
      <p className="configuration-warning">
        Spam protection is not configured. Add{" "}
        <code>NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> to .env.local before going
        to production.
      </p>
    );
  }

  return <div className="turnstile" ref={container} />;
}
