"use strict";
// Browser source extracted from views/roadmap.eta.
(function () {
    const RM_ITEMS = JSON.parse(document.getElementById('sf-roadmap-data').textContent || '[]');
    function rmSetViewMode(mode) {
        const isBoard = mode === 'board';
        document.getElementById('rm-btn-board').classList.toggle('rm-view-btn--active', isBoard);
        document.getElementById('rm-btn-board').setAttribute('aria-pressed', String(isBoard));
        document.getElementById('rm-btn-timeline').classList.toggle('rm-view-btn--active', !isBoard);
        document.getElementById('rm-btn-timeline').setAttribute('aria-pressed', String(!isBoard));
        if (isBoard) {
            document.getElementById('rm-board-view').removeAttribute('hidden');
            document.getElementById('rm-timeline-view').setAttribute('hidden', '');
        }
        else {
            document.getElementById('rm-board-view').setAttribute('hidden', '');
            document.getElementById('rm-timeline-view').removeAttribute('hidden');
        }
    }
    function rmSetMobileTab(tab) {
        ['now', 'next', 'later'].forEach(t => {
            const active = t === tab;
            const btn = document.getElementById(`rm-tab-${t}`);
            const col = document.getElementById(`col-${t}`);
            if (btn) {
                btn.classList.toggle('rm-mobile-tab-btn--active', active);
                btn.setAttribute('aria-selected', String(active));
            }
            if (col) {
                col.classList.toggle('rm-column--mobile-active', active);
            }
        });
    }
    function rmApplyFilters() {
        const q = (document.getElementById('rm-search-input').value || '').toLowerCase().trim();
        const owner = document.getElementById('rm-owner-filter').value;
        const tag = document.getElementById('rm-tag-filter').value.toLowerCase();
        const quarter = document.getElementById('rm-quarter-filter').value;
        const hasActive = q || owner !== 'all' || tag !== 'all' || quarter !== 'all';
        const resetBtn = document.getElementById('rm-filter-reset');
        if (resetBtn)
            resetBtn.classList.toggle('rm-filter-reset-hidden', !hasActive);
        document.querySelectorAll('.rm-card').forEach(card => {
            const cardTitle = card.getAttribute('data-title') || '';
            const cardDesc = card.getAttribute('data-desc') || '';
            const cardOwner = card.getAttribute('data-owner') || '';
            const cardTag = card.getAttribute('data-tag') || '';
            const cardQuarter = card.getAttribute('data-quarter') || '';
            const matchQ = !q || cardTitle.includes(q) || cardDesc.includes(q) || cardTag.includes(q);
            const matchOwner = owner === 'all' || cardOwner === owner;
            const matchTag = tag === 'all' || cardTag.includes(tag);
            const matchQuarter = quarter === 'all' || cardQuarter === quarter;
            const matches = matchQ && matchOwner && matchTag && matchQuarter;
            card.classList.toggle('rm-card--dimmed', !matches);
        });
    }
    function rmClearFilters() {
        document.getElementById('rm-search-input').value = '';
        document.getElementById('rm-owner-filter').value = 'all';
        document.getElementById('rm-tag-filter').value = 'all';
        document.getElementById('rm-quarter-filter').value = 'all';
        rmApplyFilters();
    }
    function rmOpenDrawer(id) {
        const item = RM_ITEMS.find(i => i.id === id);
        if (!item)
            return;
        const overlay = document.getElementById('rm-drawer-overlay');
        const colorHex = item.status === 'now' ? '#F59E0B' : (item.status === 'next' ? '#3B82F6' : '#64748B');
        const statusLabel = item.status === 'now' ? 'Now' : (item.status === 'next' ? 'Next' : 'Later');
        document.getElementById('drawer-dot').style.background = colorHex;
        document.getElementById('drawer-status-label').textContent = statusLabel;
        document.getElementById('drawer-title').textContent = item.title;
        document.getElementById('drawer-pill-status').textContent = statusLabel + ' (' + (item.status === 'now' ? 'In Development' : (item.status === 'next' ? 'Approved & Prioritized' : 'Future Consideration')) + ')';
        document.getElementById('drawer-effort').textContent = item.effort || 'M';
        document.getElementById('drawer-avatar').textContent = (item.owner?.name || 'CO').slice(0, 2).toUpperCase();
        document.getElementById('drawer-owner-name').textContent = item.owner?.name || 'Campus Team';
        document.getElementById('drawer-owner-role').textContent = item.owner?.role || 'Campus Administration';
        document.getElementById('drawer-quarter').textContent = item.quarter || 'Q3 2026';
        const ideaLink = document.getElementById('drawer-idea-link');
        ideaLink.href = `/idea/${item.id}`;
        ideaLink.setAttribute('data-idea-id', item.id);
        const tagsCont = document.getElementById('drawer-tags');
        tagsCont.innerHTML = '';
        (item.tags || []).forEach(t => {
            const sp = document.createElement('span');
            sp.className = 'rm-card-tag';
            sp.textContent = t;
            tagsCont.appendChild(sp);
        });
        overlay.removeAttribute('hidden');
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('item', id);
            window.history.pushState({ itemId: id }, '', url.toString());
        }
        catch (e) { }
    }
    function rmCloseDrawer() {
        const overlay = document.getElementById('rm-drawer-overlay');
        overlay.setAttribute('hidden', '');
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('item');
            window.history.replaceState({}, '', url.toString());
        }
        catch (e) { }
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape')
            rmCloseDrawer();
    });
    // URL sync on load
    document.addEventListener('DOMContentLoaded', function () {
        try {
            const params = new URLSearchParams(window.location.search);
            const itemId = params.get('item');
            if (itemId)
                rmOpenDrawer(itemId);
        }
        catch (e) { }
    });
    Object.assign(window, { rmSetViewMode, rmSetMobileTab, rmApplyFilters, rmClearFilters, rmOpenDrawer, rmCloseDrawer });
})();
