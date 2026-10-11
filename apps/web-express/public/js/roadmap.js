"use strict";
(() => {
    const items = JSON.parse(document.getElementById('sf-roadmap-data').textContent || '[]');
    const board = document.getElementById('campus-roadmap-board');
    const dialog = document.getElementById('roadmap-dialog');
    const labels = { approved: 'Planned', in_progress: 'In progress', resolved: 'Completed' };
    const hints = {
        approved: 'The school has approved this idea. A delivery date has not been announced.',
        in_progress: 'Work on this idea is underway. Follow the discussion for updates from your school.',
        resolved: 'The school has marked this idea as completed.'
    };
    let returnFocus = null;
    let syncingHistory = false;
    let detailRequest;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function normalizeView(view) {
        if (view === 'tree' || view === 'list')
            return 'tree';
        if (view === 'timeline')
            return 'timeline';
        return 'board';
    }
    function setView(view, updateUrl = true) {
        const normalized = normalizeView(view);
        board.dataset.view = normalized;
        const viewInput = document.getElementById('roadmap-view-input');
        if (viewInput)
            viewInput.value = normalized;
        document.querySelectorAll('[data-roadmap-view]').forEach(b => {
            const bView = normalizeView(b.dataset.roadmapView);
            b.setAttribute('aria-pressed', String(bView === normalized));
        });
        document.querySelectorAll('[data-roadmap-state-link]').forEach(link => {
            try {
                const url = new URL(link.href, window.location.origin);
                url.searchParams.set('view', normalized);
                link.href = url.toString();
            }
            catch { }
        });
        if (updateUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set('view', normalized);
            window.history.replaceState(null, '', url);
        }
    }
    document.querySelectorAll('[data-roadmap-view]').forEach(button => {
        button.addEventListener('click', () => setView(button.dataset.roadmapView));
    });
    // Tree category branch folding
    function toggleBranch(header) {
        const isExpanded = header.getAttribute('aria-expanded') !== 'false';
        const nextState = isExpanded ? 'false' : 'true';
        header.setAttribute('aria-expanded', nextState);
        const branch = header.closest('.roadmap-tree-branch');
        if (branch) {
            branch.classList.toggle('is-collapsed', !isExpanded);
        }
    }
    document.querySelectorAll('.roadmap-tree-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking an inner link
            if (e.target.tagName === 'A')
                return;
            toggleBranch(header);
        });
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleBranch(header);
            }
        });
    });
    function formatManilaDate(dateStr) {
        if (!dateStr)
            return '';
        return new Date(dateStr).toLocaleDateString('en-PH', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
    function show(item) {
        document.getElementById('roadmap-detail-content').hidden = false;
        document.getElementById('roadmap-detail-error').textContent = '';
        const badge = document.getElementById('roadmap-detail-status');
        badge.textContent = labels[item.status] || item.status;
        badge.dataset.status = item.status;
        document.getElementById('roadmap-detail-title').textContent = item.title;
        document.getElementById('roadmap-detail-description').textContent = item.description;
        const datePrefix = item.status === 'resolved' ? 'Completed ' : 'Updated ';
        const dateValue = item.status === 'resolved' ? (item.resolved_at || item.updated_at) : item.updated_at;
        document.getElementById('roadmap-detail-meta').textContent = `${item.category} · ${item.votes} votes · ${datePrefix}${formatManilaDate(dateValue)}`;
        document.getElementById('roadmap-detail-response').textContent = item.response || 'The school has not posted a public response yet.';
        document.getElementById('roadmap-detail-hint').textContent = hints[item.status] || '';
        document.getElementById('roadmap-detail-link').href = '/idea/' + encodeURIComponent(item.id);
        document.querySelectorAll('[data-progress-stage]').forEach(step => {
            if (step.dataset.progressStage === item.status)
                step.setAttribute('aria-current', 'step');
            else
                step.removeAttribute('aria-current');
        });
    }
    async function open(id, push = true) {
        detailRequest?.abort();
        detailRequest = undefined;
        if (!dialog.open)
            returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!dialog.open)
            dialog.showModal();
        if (push) {
            const url = new URL(window.location.href);
            url.searchParams.set('item', id);
            window.history.pushState(null, '', url);
        }
        const item = items.find(i => i.id === id);
        if (item) {
            show(item);
            return;
        }
        document.getElementById('roadmap-detail-title').textContent = 'Loading idea…';
        document.getElementById('roadmap-detail-content').hidden = true;
        document.getElementById('roadmap-detail-status').textContent = '';
        document.getElementById('roadmap-detail-meta').textContent = '';
        document.getElementById('roadmap-detail-error').textContent = '';
        if (!uuid.test(id)) {
            document.getElementById('roadmap-detail-title').textContent = 'Idea unavailable';
            document.getElementById('roadmap-detail-error').textContent = 'This link does not contain a valid idea ID.';
            return;
        }
        const controller = new AbortController();
        detailRequest = controller;
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('/roadmap/idea/' + encodeURIComponent(id), { signal: controller.signal });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(response.status === 404 ? 'This idea is no longer on the public roadmap.' : 'This idea could not load. Close the panel and reopen it to retry.');
            }
            if (dialog.open && detailRequest === controller)
                show(body.item);
        }
        catch (error) {
            if (dialog.open && detailRequest === controller) {
                document.getElementById('roadmap-detail-title').textContent = 'Idea unavailable';
                document.getElementById('roadmap-detail-error').textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Loading timed out. Close the panel and reopen it to retry.';
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    document.addEventListener('click', event => {
        const btn = event.target?.closest('[data-roadmap-open]');
        if (btn && btn.dataset.roadmapOpen) {
            event.preventDefault();
            void open(btn.dataset.roadmapOpen);
        }
    });
    document.getElementById('roadmap-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left)
            dialog.close();
    });
    dialog.addEventListener('close', () => {
        detailRequest?.abort();
        returnFocus?.focus();
        if (!syncingHistory) {
            const url = new URL(window.location.href);
            url.searchParams.delete('item');
            window.history.replaceState(null, '', url);
        }
        syncingHistory = false;
    });
    window.addEventListener('popstate', () => {
        const url = new URL(window.location.href);
        setView(url.searchParams.get('view'), false);
        const id = url.searchParams.get('item');
        if (id)
            void open(id, false);
        else if (dialog.open) {
            syncingHistory = true;
            dialog.close();
        }
    });
    setView(new URL(window.location.href).searchParams.get('view'), false);
    const initial = new URL(window.location.href).searchParams.get('item');
    if (initial)
        void open(initial, false);
})();
