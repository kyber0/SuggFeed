"use strict";
(() => {
    for (const input of document.querySelectorAll('[data-away-until]')) {
        const value = new Date(input.dataset.awayUntil || '');
        if (Number.isFinite(value.getTime()))
            input.value = new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    const status = document.getElementById('assignment-message');
    const key = typeof sfSchoolKey === 'function' ? sfSchoolKey('assignment-message') : 'assignment-message';
    try {
        const saved = sessionStorage.getItem(key);
        if (status && saved) {
            status.textContent = saved;
            sessionStorage.removeItem(key);
        }
    }
    catch { /* Status storage is optional. */ }
    async function action(name, data) { const response = await sfSchoolFetch('/admin/assignments/action', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ action: name, data }), signal: AbortSignal.timeout(20000) }); const result = await response.json(); if (!response.ok || !result.success)
        throw new Error(result.error || 'The change could not be confirmed. Keep your entries and refresh before retrying.'); return result; }
    document.querySelectorAll('[data-assignment-form]').forEach(form => form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (form.dataset.saving || !form.reportValidity())
            return;
        const name = form.dataset.assignmentForm, values = new FormData(form), data = {};
        for (const [key, value] of values)
            if (typeof value === 'string')
                data[key] = value;
        for (const key of ['enabled', 'active', 'notifications', 'away', 'autoReassignAway', 'autoReassignOverdue'])
            if (form.querySelector('[name="' + key + '"]'))
                data[key] = values.has(key);
        if (name === 'rule') {
            const inputs = Array.from(form.querySelectorAll('[data-rule-sla] [data-sla-key]'));
            data.sla = inputs.some(input => input.value) ? Object.fromEntries(inputs.map(input => [input.dataset.slaKey, input.value ? Number(input.value) : null])) : null;
        }
        if (name === 'assignee')
            data.teams = values.getAll('teams');
        if (name === 'availability') {
            const value = values.get('awayUntil');
            data.awayUntil = data.away && typeof value === 'string' && value ? new Date(value).toISOString() : null;
        }
        if (name === 'settings') {
            const slas = {};
            for (const group of form.querySelectorAll('[data-assignment-priority]')) {
                const inputs = Array.from(group.querySelectorAll('[data-sla-key]'));
                if (inputs.some(input => input.value))
                    slas[group.dataset.assignmentPriority] = Object.fromEntries(inputs.map(input => [input.dataset.slaKey, input.value ? Number(input.value) : null]));
            }
            data.slas = slas;
        }
        form.dataset.saving = 'true';
        const buttons = Array.from(form.querySelectorAll('button'));
        buttons.forEach(button => button.disabled = true);
        form.setAttribute('aria-busy', 'true');
        let message = form.querySelector('[data-assignment-result]');
        if (!message) {
            message = document.createElement('p');
            message.dataset.assignmentResult = 'true';
            message.setAttribute('role', 'status');
            message.className = 'assignment-wide';
            form.append(message);
        }
        message.textContent = 'Saving…';
        try {
            const result = await action(name, data);
            const text = result.disabled ? 'Automatic routing is disabled. Use a manual assignment or complete school setup.' : result.reason === 'triage' ? 'No eligible owner is available. The item remains in triage.' : 'Saved. Assignment history has been updated.';
            message.textContent = text;
            try {
                sessionStorage.setItem(key, text);
            }
            catch { /* Keep the inline confirmation. */ }
            location.reload();
        }
        catch (error) {
            message.textContent = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The request timed out. Keep your entries and refresh before retrying.';
        }
        finally {
            delete form.dataset.saving;
            form.removeAttribute('aria-busy');
            buttons.forEach(button => button.disabled = false);
        }
    }));
    document.querySelectorAll('[data-assignment-history]').forEach(details => details.addEventListener('toggle', async () => {
        if (!details.open || details.dataset.loaded)
            return;
        const list = details.querySelector('ol');
        list.textContent = 'Loading history…';
        try {
            const result = await action('history', { kind: details.dataset.kind, id: details.dataset.id });
            list.replaceChildren();
            for (const entry of result.events || []) {
                const row = document.createElement('li'), title = document.createElement('strong'), text = document.createElement('p');
                title.textContent = entry.action + ' · ' + new Date(entry.created_at).toLocaleString();
                text.textContent = entry.reason;
                row.append(title, text);
                list.append(row);
            }
            if (!list.children.length)
                list.textContent = 'No assignment events yet.';
            details.dataset.loaded = 'true';
        }
        catch (error) {
            list.textContent = error instanceof Error ? error.message : 'History is unavailable. Close and reopen to retry.';
        }
    }));
})();
