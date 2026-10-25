"use strict";
/** Small enhancements for the shared server-rendered staff workspace. */
(() => {
    const portal = document.querySelector('.staff-workspace');
    if (!portal || portal.dataset.portalReady)
        return;
    portal.dataset.portalReady = 'true';
    for (const table of portal.querySelectorAll('table')) {
        if (table.closest('.sf-responsive-table,.analytics-table-wrap,.staff-table-wrap,.portal-table-scroll'))
            continue;
        const wrap = document.createElement('div');
        wrap.className = 'portal-table-scroll';
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', table.caption?.textContent?.trim() || 'Scrollable records');
        table.before(wrap);
        wrap.append(table);
    }
    for (const form of portal.querySelectorAll('[data-safety-review]')) {
        const action = form.querySelector('[data-portal-safety-action]');
        if (!action)
            continue;
        const update = () => { const category = form.querySelector('[data-portal-safety-category]'), urgent = form.querySelector('[data-portal-safety-urgent]'); if (category)
            category.hidden = action.value !== 'category'; if (urgent)
            urgent.hidden = action.value !== 'urgent'; };
        action.addEventListener('change', update);
        update();
    }
    document.addEventListener('click', event => { const target = event.target; if (!(target instanceof Element))
        return; const button = target.closest('[data-portal-open]'); if (!button)
        return; const details = document.getElementById(button.dataset.portalOpen || ''); if (details instanceof HTMLDetailsElement) {
        details.open = true;
        details.querySelector('input,textarea,select')?.focus();
    } });
    // Remember positions only for Back/Forward navigation, never drafts or private text.
    const key = typeof sfSchoolKey === 'function' ? sfSchoolKey('portal-scroll:' + location.pathname + location.search) : '';
    const restore = () => { if (!key)
        return; const navigation = performance.getEntriesByType('navigation')[0]; if (navigation?.type !== 'back_forward')
        return; try {
        const saved = sessionStorage.getItem(key);
        const y = saved === null ? NaN : Number(saved);
        if (Number.isFinite(y) && y >= 0)
            requestAnimationFrame(() => scrollTo({ top: y, behavior: 'instant' }));
    }
    catch { /* Browser history still works without storage. */ } };
    window.addEventListener('pagehide', () => { if (key)
        try {
            sessionStorage.setItem(key, String(scrollY));
        }
        catch { /* Storage is optional. */ } });
    window.addEventListener('pageshow', restore);
    restore();
})();
