"use strict";
(() => {
    if (window.sfMotion)
        return;
    let cleanup;
    let effects = [];
    let seen = new WeakSet();
    function refresh(root = document) { if (!cleanup || SfMotion.editing())
        return; effects.forEach(effect => effect.refresh?.(root)); }
    function destroy() { cleanup?.(); cleanup = undefined; effects = []; seen = new WeakSet(); }
    function mount() {
        if (cleanup)
            return;
        const lifetime = new AbortController(), reduced = matchMedia('(prefers-reduced-motion: reduce)'), fine = matchMedia('(hover:hover) and (pointer:fine)');
        const context = { signal: lifetime.signal, reduced, fine, seen, on(target, type, listener, options = {}) { target.addEventListener(type, listener, { ...options, signal: lifetime.signal }); } };
        let effectLifetime = new AbortController(), preferenceFrame = 0;
        let reducedValue = reduced.matches, fineValue = fine.matches;
        const start = () => { reducedValue = reduced.matches; fineValue = fine.matches; effectLifetime.abort(); effects.forEach(effect => effect.destroy()); effectLifetime = new AbortController(); const effectContext = { ...context, signal: effectLifetime.signal, on(target, type, listener, options = {}) { target.addEventListener(type, listener, { ...options, signal: effectLifetime.signal }); } }; effects = SfMotion.factories.map(factory => factory(effectContext)); refresh(); effects.forEach(effect => effect.pause?.(document.hidden)); };
        const observer = new MutationObserver(records => { for (const record of records) {
            if (record.type === 'attributes' && record.target instanceof HTMLElement)
                refresh(record.target);
            for (const node of record.removedNodes)
                if (node instanceof HTMLElement)
                    effects.forEach(effect => effect.remove?.(node));
            for (const node of record.addedNodes)
                if (node instanceof HTMLElement && !node.closest('[data-sf-generated]'))
                    refresh(node);
        } });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'hidden', 'open'] });
        cleanup = () => { cancelAnimationFrame(preferenceFrame); reduced.removeEventListener('change', start); fine.removeEventListener('change', start); observer.disconnect(); lifetime.abort(); effectLifetime.abort(); effects.forEach(effect => effect.destroy()); document.documentElement.removeAttribute('data-sf-motion-ready'); };
        for (const [key, value] of Object.entries(SfMotion.config))
            if (typeof value === 'number')
                document.documentElement.style.setProperty('--sf-motion-' + key, key === 'marqueeSpeed' || key === 'threshold' ? String(value) : key === 'distance' || key === 'mobileDistance' || key === 'magnet' ? value + 'px' : value + 'ms');
        document.documentElement.style.setProperty('--sf-motion-ease', SfMotion.config.ease);
        // Keep preference queries rooted for their full mounted lifetime, including idle documents.
        reduced.addEventListener('change', start);
        fine.addEventListener('change', start);
        context.on(document, 'visibilitychange', () => effects.forEach(effect => effect.pause?.(document.hidden)));
        context.on(window, 'pagehide', event => { if (event.persisted)
            effects.forEach(effect => effect.pause?.(true));
        else
            destroy(); });
        context.on(window, 'pageshow', () => effects.forEach(effect => effect.pause?.(false)));
        document.documentElement.dataset.sfMotionReady = 'true';
        start();
        // Initial media-query evaluation can coalesce a preference change before first paint.
        preferenceFrame = requestAnimationFrame(() => { preferenceFrame = 0; if (reducedValue !== reduced.matches || fineValue !== fine.matches)
            start(); });
    }
    window.sfMotion = { mount, refresh, destroy };
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    else
        mount();
})();
