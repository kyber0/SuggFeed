"use strict";
(() => {
    const connection = navigator.connection;
    const warmed = new Map();
    const pending = new Map();
    let candidate = null;
    let timer;
    let budget = 8;
    function allowedConnection() {
        return navigator.onLine && !document.hidden && !connection?.saveData
            && !['slow-2g', '2g'].includes(connection?.effectiveType || '');
    }
    function destination(target) {
        const link = target instanceof Element ? target.closest('a[href]') : null;
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')
            || link.closest('[data-no-navigation-loader]'))
            return null;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || url.protocol !== location.protocol)
            return null;
        if (!['/', '/feed', '/feed/', '/roadmap', '/roadmap/'].includes(url.pathname))
            return null;
        if (url.pathname === location.pathname && url.search === location.search)
            return null;
        if (url.searchParams.get('scope') === 'following')
            return null;
        // Copy only public filters, never unknown capability or account parameters.
        const safe = new URL(url.pathname, location.origin);
        for (const key of ['sort', 'category', 'search', 'scope', 'page', 'stage', 'view']) {
            const value = url.searchParams.get(key);
            if (value !== null)
                safe.searchParams.set(key, value.slice(0, 120));
        }
        return safe;
    }
    function warm(url) {
        if (sfSchoolBase)
            return;
        if (!allowedConnection() || budget <= 0 || pending.size >= 2)
            return;
        const key = url.pathname + url.search;
        if (pending.has(key) || (warmed.get(key) || 0) > Date.now())
            return;
        budget--;
        const endpoint = new URL(sfSchoolPath('/api/navigation-cache'), location.origin);
        endpoint.search = url.search;
        endpoint.searchParams.set('path', url.pathname);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 4000);
        const request = sfSchoolFetch(endpoint, { credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } })
            .then(response => { if (response.ok)
            warmed.set(key, Date.now() + 10000); })
            .catch(() => undefined)
            .finally(() => { clearTimeout(timeout); pending.delete(key); });
        pending.set(key, request);
    }
    function schedule(event) {
        const url = destination(event.target);
        if (!url || !allowedConnection())
            return;
        const key = url.pathname + url.search;
        if (candidate === key)
            return;
        clearTimeout(timer);
        candidate = key;
        timer = window.setTimeout(() => { candidate = null; warm(url); }, 120);
    }
    function clearCandidate() { clearTimeout(timer); candidate = null; }
    document.addEventListener('pointerover', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('pointerout', event => {
        if (!(event.target instanceof Element))
            return;
        const link = event.target.closest('a[href]');
        if (link && (!(event.relatedTarget instanceof Node) || !link.contains(event.relatedTarget)))
            clearCandidate();
    });
    document.addEventListener('focusout', clearCandidate);
    window.addEventListener('pagehide', clearCandidate);
    // Cache immutable/versioned assets, not documents containing account state.
    function registerAssets() {
        if ('serviceWorker' in navigator && window.isSecureContext) {
            void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
        }
    }
    if (document.readyState === 'complete')
        registerAssets();
    else
        window.addEventListener('load', registerAssets, { once: true });
})();
