/// <reference lib="webworker" />
// SuggFeed Service Worker
// Cache strategy:
//   - Versioned static assets: Cache-first
//   - Other static assets: Stale-while-revalidate
//   - Navigation (HTML): Network-first, fallback to offline shell

(() => {
  const worker = self as unknown as ServiceWorkerGlobalScope;

  const CACHE_VERSION = "cv-v14-product-ux-assets";
  const STATIC_CACHE = `${CACHE_VERSION}-static`;
  const MAX_STATIC_ENTRIES = 200;

  const STATIC_ASSETS: string[] = [
    "/offline.html",
    "/manifest.json",
    "/branding/sf-monogram.png",
  ];

  // ── Install ──────────────────────────────────────────────────────────────────
  worker.addEventListener("install", (event: ExtendableEvent) => {
    event.waitUntil(
      caches
        .open(STATIC_CACHE)
        .then((cache) =>
          cache.addAll(STATIC_ASSETS).catch(() => {
            // Non-fatal: offline.html may not exist yet on first deploy
          })
        )
        .then(() => worker.skipWaiting())
    );
  });

  // ── Activate ─────────────────────────────────────────────────────────────────
  worker.addEventListener("activate", (event: ExtendableEvent) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith("cv-") &&
                  key !== STATIC_CACHE
              )
              .map((key) => caches.delete(key))
          )
        )
        .then(() => worker.clients.claim())
    );
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  worker.addEventListener("fetch", (event: FetchEvent) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests, the sw.js file itself, and range requests (streaming/video)
    if (request.method !== "GET") return;
    if (url.pathname === "/sw.js") return;
    if (request.headers.has("range")) return;

    // ⚠️  IMPORTANT: Never intercept cross-origin requests (e.g. Google Fonts, Sentry CDN).
    // The CSP connect-src directive blocks the SW from re-fetching external origins,
    // which causes a flood of "Failed to fetch" / CSP violation errors.
    if (url.origin !== worker.location.origin) return;
    // School documents and APIs always recheck server authorization, including offline.
    if (/^\/s(?:\/|$)/.test(url.pathname)) return;
    // Never cache login callbacks, session state, private pages or API responses.
    if (/^\/(auth|api|admin|profile|notifications|staff|internal|inbox|digest)(\/|$)/.test(url.pathname)) return;
    if(url.pathname==='/feed' && url.searchParams.get('scope')==='following') return;
    // Public detail JSON must reflect moderation changes and unpublished ideas immediately.
    if (url.pathname.startsWith("/roadmap/idea/")) return;

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

    // Only actual static assets may enter the persistent cache. Unknown GETs,
    // account data, JSON endpoints and authorization responses stay on the network.
    const staticPath=url.pathname.startsWith('/_next/static/') || /^\/(?:css|js|fonts|icons|images|img)\//.test(url.pathname)
      || /^\/(?:offline\.html|manifest\.json|logo\.png|favicon(?:-\d+x\d+)?\.(?:ico|png)|apple-touch-icon\.png)$/.test(url.pathname);
    if(!staticPath)return;
    if(url.searchParams.has('v') || url.pathname.startsWith('/_next/static/')){
      event.respondWith(cacheFirst(request,STATIC_CACHE));
    } else {
      event.respondWith(staleWhileRevalidate(request,STATIC_CACHE,event));
    }
  });

  // ── Push notifications ────────────────────────────────────────────────────────
  worker.addEventListener("push", (event: PushEvent) => {
    if (!event.data) return;
    const data = event.data.json() as {
      title?: string;
      body?: string;
      data?: { submissionId?: string };
    };
    event.waitUntil(
      worker.registration.showNotification(data.title ?? "SuggFeed", {
        body: data.body ?? "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: data.data ?? {},
        tag: data.data?.submissionId ?? "sugg-feed",
      })
    );
  });

  worker.addEventListener("notificationclick", (event: NotificationEvent) => {
    event.notification.close();
    const submissionId = (
      event.notification.data as { submissionId?: string } | null
    )?.submissionId;
    const url = submissionId ? `/?track=${submissionId}` : "/";
    event.waitUntil(
      worker.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windowClients) => {
          for (const client of windowClients) {
            if (
              client.url.includes(worker.location.origin) &&
              "focus" in client
            ) {
              (client as WindowClient).navigate(url);
              return (client as WindowClient).focus();
            }
          }
          return worker.clients.openWindow(url);
        })
    );
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────
  // Cache API only supports complete responses (HTTP 200).
  // Partial content (206), redirects, and opaque (0) responses throw TypeError on cache.put().
  function isCacheable(response: Response): boolean {
    return response.status === 200 && response.type !== "opaque" && !response.redirected
      && !/(?:^|,)\s*(?:no-store|private)\b/i.test(response.headers.get('Cache-Control') || '');
  }

  // Safe wrapper — swallows any TypeError thrown by cache.put (e.g. for 206 partial responses).
  async function safeCachePut(
    cache: Cache,
    request: Request,
    response: Response
  ): Promise<void> {
    try {
      await cache.put(request, response);
      const keys=await cache.keys();
      if(keys.length>MAX_STATIC_ENTRIES){
        await Promise.all(keys.filter(key=>!STATIC_ASSETS.includes(new URL(key.url).pathname))
          .slice(0,keys.length-MAX_STATIC_ENTRIES).map(key=>cache.delete(key)));
      }
    } catch {
      // Ignore — likely a 206 partial content response that the Cache API cannot store
    }
  }

  async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheable(response)) {
      await safeCachePut(cache, request, response.clone());
    }
    return response;
  }

  async function staleWhileRevalidate(
    request: Request,
    cacheName: string,
    event: FetchEvent
  ): Promise<Response> {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkPromise = fetch(request,{cache:'no-cache'})
      .then(async (response) => {
        if (isCacheable(response))
          await safeCachePut(cache, request, response.clone());
        return response;
      })
      .catch(() => cached);
    // Keep background revalidation alive after serving a cached response.
    event.waitUntil(networkPromise.then(()=>undefined));
    const response=cached ?? await networkPromise;
    return response ?? new Response('Asset unavailable.',{status:503});
  }

})();
