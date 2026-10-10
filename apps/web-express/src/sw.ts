/// <reference lib="webworker" />
// SuggFeed Service Worker
// Cache strategy:
//   - Static assets (JS/CSS/images): Cache-first, fallback to network
//   - Supabase API / Edge Functions: Network-first, fallback to cache
//   - Navigation (HTML): Network-first, fallback to offline shell

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "cv-v8-workspace-ux";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS: string[] = [
  "/offline.html",
  "/manifest.json",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(STATIC_ASSETS).catch(() => {
          // Non-fatal: offline.html may not exist yet on first deploy
        })
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("cv-") &&
                key !== STATIC_CACHE &&
                key !== API_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests, the sw.js file itself, and range requests (streaming/video)
  if (request.method !== "GET") return;
  if (url.pathname === "/sw.js") return;
  if (request.headers.has("range")) return;

  // ⚠️  IMPORTANT: Never intercept cross-origin requests (e.g. Google Fonts, Sentry CDN).
  // The CSP connect-src directive blocks the SW from re-fetching external origins,
  // which causes a flood of "Failed to fetch" / CSP violation errors.
  if (url.origin !== self.location.origin) return;
  // Never cache login callbacks, session state, private pages or API responses.
  if (/^\/(auth|api|admin|profile)(\/|$)/.test(url.pathname)) return;
  // Public detail JSON must reflect moderation changes and unpublished ideas immediately.
  if (url.pathname.startsWith("/roadmap/idea/")) return;

  // Supabase / edge function calls — network-first
  if (
    url.hostname.endsWith(".supabase.co") ||
    url.pathname.startsWith("/functions/")
  ) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Next.js _next/static — cache-first (long-lived hashed filenames)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigation — network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/offline.html")
          .then(
            (r) =>
              r ??
              new Response("You are offline.", {
                headers: { "Content-Type": "text/plain" },
              })
          )
      )
    );
    return;
  }

  // Everything else (same-origin assets) — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as {
    title?: string;
    body?: string;
    data?: { submissionId?: string };
  };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "SuggFeed", {
      body: data.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.data ?? {},
      tag: data.data?.submissionId ?? "sugg-feed",
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const submissionId = (
    event.notification.data as { submissionId?: string } | null
  )?.submissionId;
  const url = submissionId ? `/?track=${submissionId}` : "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (
            client.url.includes(self.location.origin) &&
            "focus" in client
          ) {
            (client as WindowClient).navigate(url);
            return (client as WindowClient).focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
// Cache API only supports complete responses (HTTP 200).
// Partial content (206), redirects, and opaque (0) responses throw TypeError on cache.put().
function isCacheable(response: Response): boolean {
  return response.status === 200 && response.type !== "opaque";
}

// Safe wrapper — swallows any TypeError thrown by cache.put (e.g. for 206 partial responses).
async function safeCachePut(
  cache: Cache,
  request: Request,
  response: Response
): Promise<void> {
  try {
    await cache.put(request, response);
  } catch {
    // Ignore — likely a 206 partial content response that the Cache API cannot store
  }
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(cacheName);
    await safeCachePut(cache, request, response.clone());
  }
  return response;
}

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(cacheName);
      await safeCachePut(cache, request, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ??
      new Response(JSON.stringify({ error: "You are offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

async function staleWhileRevalidate(
  request: Request,
  cacheName: string
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (isCacheable(response))
        await safeCachePut(cache, request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? (networkPromise as Promise<Response>);
}

export {};
