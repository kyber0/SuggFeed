"use strict";
(() => {
    const dialog = document.getElementById('work-record-dialog');
    if (!dialog)
        return;
    const items = JSON.parse(document.getElementById('sf-roadmap-data')?.textContent || '[]');
    const element = (name) => document.getElementById('work-record-' + name);
    if (document.getElementById('campus-roadmap-board')?.dataset.view === 'done') {
        element('context-label').textContent = 'COMPLETED OUTCOMES';
        element('panel-label').textContent = 'Completion record';
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const stages = ['approved', 'in_progress', 'resolved'];
    const labels = { approved: 'Planned', in_progress: 'In progress', resolved: 'Completed' };
    const kinds = { started: 'Work started', update: 'Progress update', milestone: 'Milestone', blocked: 'Work paused', completed: 'Completed', correction: 'Correction', resumed: 'Work resumed', reopened: 'Work reopened', withdrawn: 'Withdrawn' };
    let request;
    let returnFocus = null;
    let selectedId = '';
    let syncingHistory = false;
    function date(value) {
        if (!value || !Number.isFinite(Date.parse(value)))
            return 'Not recorded';
        return new Date(value.length === 10 ? value + 'T00:00:00+08:00' : value)
            .toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' });
    }
    function show(item) {
        element('title').textContent = item.title;
        element('category').textContent = item.category;
        element('stage').textContent = (labels[item.status] || 'Public idea') + (item.is_blocked ? ' · Paused' : '');
        element('stage').dataset.status = item.status;
        element('start').textContent = date(item.started_at);
        element('end').textContent = item.status === 'resolved'
            ? (item.resolved_at_estimated && item.resolved_at ? 'Around ' : '') + date(item.resolved_at)
            : item.status === 'in_progress' && item.started_at ? item.is_blocked ? 'Paused' : 'Still underway' : 'Not completed';
        element('percent').textContent = typeof item.progress_percent === 'number' ? item.progress_percent + '%' : 'Not estimated';
        element('updated').textContent = date(item.last_public_update);
        element('description').textContent = item.description;
        element('outcome-section').hidden = item.status !== 'resolved';
        element('outcome').textContent = item.outcome || 'Marked completed; an outcome summary has not been posted.';
        element('content').hidden = false;
        for (const step of element('stages').querySelectorAll('[data-work-stage]')) {
            const index = stages.indexOf(step.dataset.workStage || '');
            step.dataset.state = index < stages.indexOf(item.status) ? 'complete' : index === stages.indexOf(item.status) ? 'current' : 'upcoming';
            if (step.dataset.state === 'current')
                step.setAttribute('aria-current', 'step');
            else
                step.removeAttribute('aria-current');
        }
        const discussion = element('discussion');
        discussion.href = '/idea/' + encodeURIComponent(item.id);
        discussion.hidden = false;
    }
    function showHistory(updates, item) {
        const ordered = [...updates].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
        const latest = [...updates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        element('latest-body').textContent = latest?.body || 'The school has not posted a public work update yet.';
        element('latest-title').textContent = latest ? kinds[latest.kind] || 'Latest school update' : 'Latest school update';
        element('next').textContent = item.is_blocked && latest?.blocked_reason ? 'Waiting on: ' + latest.blocked_reason : latest?.next_step ? 'Next step: ' + latest.next_step : '';
        element('next').hidden = !element('next').textContent;
        element('history-count').textContent = ordered.length >= 100 ? 'Latest 100 updates' : ordered.length + ' updates';
        element('empty').hidden = !!ordered.length;
        const list = element('history');
        list.replaceChildren();
        for (const update of ordered) {
            const entry = document.createElement('li');
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            const title = document.createElement('strong');
            title.textContent = kinds[update.kind] || 'School update';
            const time = document.createElement('time');
            time.dateTime = update.occurred_on;
            time.textContent = date(update.occurred_on);
            summary.append(title, time);
            const office = document.createElement('p');
            office.className = 'workspace-detail-meta';
            office.textContent = update.office_label;
            const body = document.createElement('p');
            body.textContent = update.body;
            details.append(summary, office, body);
            for (const [label, text] of [['Waiting on', update.blocked_reason], ['Next step', update.next_step]]) {
                if (text) {
                    const paragraph = document.createElement('p');
                    paragraph.textContent = label + ': ' + text;
                    details.append(paragraph);
                }
            }
            for (const file of update.files || []) {
                if (!uuid.test(file.id))
                    continue;
                const link = document.createElement('a');
                link.className = 'work-record-evidence';
                link.href = '/api/progress-evidence/' + encodeURIComponent(file.id);
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = (file.mime_type === 'application/pdf' ? 'PDF' : 'Image') + ' · ' + file.display_name + ' ↗';
                if (file.alt)
                    link.setAttribute('aria-label', file.display_name + ': ' + file.alt);
                details.append(link);
            }
            entry.append(details);
            list.append(entry);
        }
    }
    async function open(id, push = true) {
        request?.abort();
        const controller = new AbortController();
        request = controller;
        selectedId = id;
        if (!dialog.open) {
            returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            dialog.showModal();
        }
        if (push) {
            const url = new URL(location.href);
            url.searchParams.delete('item');
            url.searchParams.set('work', id);
            history.pushState(null, '', url);
        }
        element('content').hidden = true;
        element('discussion').hidden = true;
        element('retry').hidden = true;
        element('title').textContent = 'Loading work record…';
        element('stage').textContent = '';
        element('category').textContent = '';
        element('message').textContent = 'Loading the latest school records…';
        element('history').replaceChildren();
        element('latest-body').textContent = 'Loading school update…';
        element('history-count').textContent = '';
        element('next').hidden = true;
        element('empty').hidden = true;
        element('latest-title').textContent = 'Latest school update';
        const item = items.find(item => item.id === id);
        element('skeleton').hidden = !!item;
        if (item)
            show(item);
        dialog.setAttribute('aria-busy', 'true');
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            if (!uuid.test(id))
                throw new Error('This link does not contain a valid idea ID.');
            const response = await fetch('/roadmap/idea/' + encodeURIComponent(id), { signal: controller.signal, headers: { Accept: 'application/json' } });
            const data = await response.json();
            if (!response.ok || !data.success)
                throw new Error(response.status === 404 ? 'This work record is no longer on the public roadmap.' : 'The work record could not load. Please try again.');
            if (request !== controller || !dialog.open)
                return;
            show(data.item);
            showHistory(Array.isArray(data.updates) ? data.updates : [], data.item);
            element('message').textContent = '';
        }
        catch (error) {
            if (request !== controller || !dialog.open)
                return;
            element('content').hidden = true;
            element('discussion').hidden = true;
            element('title').textContent = 'Work record unavailable';
            element('stage').textContent = '';
            element('category').textContent = '';
            element('message').textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Loading timed out. Please try again.';
            element('retry').hidden = false;
        }
        finally {
            clearTimeout(timer);
            if (request === controller) {
                dialog.setAttribute('aria-busy', 'false');
                element('skeleton').hidden = true;
            }
        }
    }
    document.addEventListener('click', event => {
        const button = event.target?.closest('[data-timeline-open]');
        if (button?.dataset.timelineOpen) {
            event.preventDefault();
            void open(button.dataset.timelineOpen);
        }
    });
    element('close').addEventListener('click', () => dialog.close());
    element('retry').addEventListener('click', () => void open(selectedId, false));
    dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom))
            dialog.close();
    });
    dialog.addEventListener('close', () => {
        request?.abort();
        request = undefined;
        returnFocus?.focus();
        if (!syncingHistory) {
            const url = new URL(location.href);
            url.searchParams.delete('work');
            history.replaceState(null, '', url);
        }
        syncingHistory = false;
    });
    window.addEventListener('popstate', () => {
        const id = new URL(location.href).searchParams.get('work');
        if (id)
            void open(id, false);
        else if (dialog.open) {
            syncingHistory = true;
            dialog.close();
        }
    });
    const initial = new URL(location.href).searchParams.get('work');
    if (initial)
        void open(initial, false);
})();
