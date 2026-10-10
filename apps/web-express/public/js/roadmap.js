"use strict";
(() => {
    const items = JSON.parse(document.getElementById('sf-roadmap-data').textContent || '[]');
    const board = document.getElementById('campus-roadmap-board');
    const dialog = document.getElementById('roadmap-dialog');
    const labels = { approved: 'Planned', in_progress: 'In progress', resolved: 'Completed' };
    const hints = { approved: 'The school has approved this idea. A delivery date has not been announced.', in_progress: 'Work on this idea is underway. Follow the discussion for updates from your school.', resolved: 'The school has marked this idea as completed.' };
    let returnFocus = null;
    let syncingHistory = false;
    let detailRequest;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function setView(view, updateUrl = true) {
        board.dataset.view = view;
        document.getElementById('roadmap-view-input').value = view;
        document.querySelectorAll('[data-roadmap-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.roadmapView === view)));
        document.querySelectorAll('[data-roadmap-state-link]').forEach(link => { const url = new URL(link.href); url.searchParams.set('view', view); link.href = url.toString(); });
        if (updateUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set('view', view);
            window.history.replaceState(null, '', url);
        }
    }
    document.querySelectorAll('[data-roadmap-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.roadmapView)));
    function show(item) {
        document.getElementById('roadmap-detail-content').hidden = false;
        document.getElementById('roadmap-detail-error').textContent = '';
        const badge = document.getElementById('roadmap-detail-status');
        badge.textContent = labels[item.status];
        badge.dataset.status = item.status;
        document.getElementById('roadmap-detail-title').textContent = item.title;
        document.getElementById('roadmap-detail-description').textContent = item.description;
        document.getElementById('roadmap-detail-meta').textContent = item.category + ' · ' + item.votes + ' votes · Updated ' + new Date(item.updated_at).toLocaleDateString('en-PH', { dateStyle: 'medium' });
        document.getElementById('roadmap-detail-response').textContent = item.response || 'The school has not posted a public response yet.';
        document.getElementById('roadmap-detail-hint').textContent = hints[item.status];
        document.getElementById('roadmap-detail-link').href = '/idea/' + encodeURIComponent(item.id);
        document.querySelectorAll('[data-progress-stage]').forEach(step => { if (step.dataset.progressStage === item.status)
            step.setAttribute('aria-current', 'step');
        else
            step.removeAttribute('aria-current'); });
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
            if (!response.ok || !body.success)
                throw new Error(response.status === 404 ? 'This idea is no longer on the public roadmap.' : 'This idea could not load. Close the panel and reopen it to retry.');
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
    document.querySelectorAll('[data-roadmap-open]').forEach(button => button.addEventListener('click', () => void open(button.dataset.roadmapOpen)));
    document.getElementById('roadmap-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left)
        dialog.close(); });
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
        setView(url.searchParams.get('view') === 'list' ? 'list' : 'board', false);
        const id = url.searchParams.get('item');
        if (id)
            void open(id, false);
        else if (dialog.open) {
            syncingHistory = true;
            dialog.close();
        }
    });
    setView(new URL(window.location.href).searchParams.get('view') === 'list' ? 'list' : 'board', false);
    const initial = new URL(window.location.href).searchParams.get('item');
    if (initial)
        void open(initial, false);
})();
