"use strict";
(() => {
    const items = JSON.parse(document.getElementById('staff-queue-data').textContent || '[]');
    const dialog = document.getElementById('staff-review-dialog');
    const form = document.getElementById('staff-review-form');
    const fields = document.getElementById('staff-review-fields');
    const status = document.getElementById('review-status');
    const note = document.getElementById('review-note');
    const assignee = document.getElementById('review-assignee');
    const priority = document.getElementById('review-priority');
    const targetDate = document.getElementById('review-target-date');
    const internalNote = document.getElementById('review-internal-note');
    const internalForm = document.getElementById('staff-internal-note-form');
    const internalMessage = document.getElementById('review-internal-message');
    const activityMessage = document.getElementById('review-activity-message');
    let noteBusy = false;
    let activityRequest;
    const save = document.getElementById('review-save');
    const message = document.getElementById('review-message');
    const labels = { pending: 'Needs review', approved: 'Planned', in_progress: 'In progress', resolved: 'Completed', rejected: 'Declined' };
    const hints = {
        pending: 'Keep this suggestion in the private review queue.',
        approved: 'Publish this idea to the community feed and Planned roadmap stage.',
        in_progress: 'Show the community that work on this idea is underway.',
        resolved: 'Mark the idea as completed on the public roadmap.',
        rejected: 'Remove this idea from public views. Explain the decision for the submitter.',
    };
    let active;
    let busy = false;
    let saved = false;
    let returnFocus = null;
    function updateHint() { document.getElementById('review-status-hint').textContent = hints[status.value] || ''; }
    function updateCount() { document.getElementById('review-note-count').textContent = note.value.length.toLocaleString() + ' / 2,000'; }
    function hasUnsavedChanges() { return internalNote.value.trim() || (active && !saved && (status.value !== active.status || note.value !== active.staff_note || assignee.value !== active.assignee_id || priority.value !== active.priority || targetDate.value !== active.target_date)); }
    const discardWarning = document.getElementById('review-discard-warning');
    function close(discard = false) {
        if (busy || noteBusy)
            return;
        if (!discard && hasUnsavedChanges()) {
            discardWarning.hidden = false;
            document.getElementById('review-keep-editing').focus();
            return;
        }
        dialog.close();
    }
    document.querySelectorAll('[data-review]').forEach(button => {
        button.addEventListener('click', () => {
            active = items.find(item => item.id === button.dataset.review);
            if (!active)
                return;
            returnFocus = button;
            saved = false;
            discardWarning.hidden = true;
            fields.disabled = false;
            save.disabled = false;
            save.hidden = false;
            save.textContent = 'Save update';
            document.getElementById('review-dismiss').textContent = 'Cancel';
            message.textContent = '';
            message.classList.remove('is-success');
            document.getElementById('review-title').textContent = active.title;
            document.getElementById('review-description').textContent = active.description;
            document.getElementById('review-meta').textContent = active.category + ' · Received ' + new Date(active.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' });
            const badge = document.getElementById('review-current-status');
            badge.textContent = labels[active.status] || active.status;
            badge.dataset.status = active.status;
            status.value = active.status;
            note.value = active.staff_note;
            assignee.value = active.assignee_id;
            priority.value = active.priority;
            targetDate.value = active.target_date;
            internalNote.value = '';
            internalMessage.textContent = '';
            updateHint();
            updateCount();
            dialog.showModal();
            void loadActivity();
        });
    });
    document.querySelectorAll('[data-close-review]').forEach(button => button.addEventListener('click', () => close()));
    document.getElementById('review-keep-editing').addEventListener('click', () => {
        discardWarning.hidden = true;
        note.focus();
    });
    document.getElementById('review-discard-confirm').addEventListener('click', () => close(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    window.addEventListener('beforeunload', event => {
        if (dialog.open && (busy || noteBusy || hasUnsavedChanges())) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
    dialog.addEventListener('click', event => { if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left)
        close(); });
    dialog.addEventListener('close', () => {
        activityRequest?.abort();
        returnFocus?.focus();
        if (saved)
            window.location.reload();
    });
    status.addEventListener('change', updateHint);
    note.addEventListener('input', updateCount);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!active || busy || noteBusy || saved || !form.reportValidity())
            return;
        busy = true;
        discardWarning.hidden = true;
        fields.disabled = true;
        save.disabled = true;
        save.textContent = 'Saving…';
        form.setAttribute('aria-busy', 'true');
        dialog.querySelectorAll('[data-close-review]').forEach(button => { button.disabled = true; });
        message.textContent = '';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch('/api/staff/submissions/' + encodeURIComponent(active.id) + '/review', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status.value, note: note.value.trim(), assignee: assignee.value || null, priority: priority.value, targetDate: targetDate.value || null, updatedAt: active.updated_at }), signal: controller.signal,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.success !== true) {
                throw new Error(response.status === 409 ? 'Someone changed this submission. Copy your draft and refresh the queue before saving again.' : response.status === 401 || response.status === 403 ? 'Your staff session has expired or access has changed. Sign in again before retrying.' : 'The update was not saved. Please try again. Your response is still here.');
            }
            saved = true;
            save.hidden = true;
            message.classList.add('is-success');
            message.textContent = 'Saved as ' + labels[status.value] + '. Close this panel to return to the updated queue.';
            document.getElementById('review-dismiss').textContent = 'Back to queue';
            void loadActivity();
        }
        catch (error) {
            message.textContent = error instanceof Error && error.name !== 'AbortError' && !(error instanceof TypeError)
                ? error.message : 'We could not confirm the save. Check your connection and refresh the queue before retrying. Your response is still here.';
        }
        finally {
            clearTimeout(timeout);
            busy = false;
            fields.disabled = saved;
            save.disabled = saved;
            save.textContent = 'Save update';
            form.removeAttribute('aria-busy');
            dialog.querySelectorAll('[data-close-review]').forEach(button => { button.disabled = false; });
            message.focus();
        }
    });
    async function request(url, method, payload) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: controller.signal });
            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.success)
                throw new Error(body?.error || 'Request failed. Try again.');
            return body;
        }
        finally {
            clearTimeout(timer);
        }
    }
    function activityCard(container, heading, body, timestamp) {
        const article = document.createElement('article');
        const title = document.createElement('strong');
        title.textContent = heading;
        const time = document.createElement('time');
        time.dateTime = timestamp;
        time.textContent = new Date(timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
        const text = document.createElement('p');
        text.textContent = body;
        article.append(title, time, text);
        container.append(article);
    }
    async function loadActivity() {
        if (!active)
            return;
        activityRequest?.abort();
        const controller = new AbortController();
        activityRequest = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        const history = document.getElementById('review-history');
        const notes = document.getElementById('review-internal-notes');
        history.replaceChildren();
        notes.replaceChildren();
        activityMessage.textContent = 'Loading history and private notes…';
        try {
            const response = await fetch('/api/staff/submissions/' + encodeURIComponent(active.id) + '/activity', { signal: controller.signal });
            const data = await response.json();
            if (!response.ok || !data.success)
                throw new Error('History could not be loaded. Your review draft is safe; use Refresh history & notes to retry.');
            if (activityRequest !== controller || !dialog.open)
                return;
            const events = [];
            const knownTransitions = new Set();
            for (const entry of data.history || []) {
                const changes = [];
                const before = entry.previous;
                const after = entry.current;
                if (before.status !== after.status) {
                    changes.push('Status: ' + labels[before.status] + ' → ' + labels[after.status]);
                    knownTransitions.add([before.status, after.status, entry.created_at, after.response || ''].join('|'));
                }
                if (before.assignee_id !== after.assignee_id)
                    changes.push('Assigned staff: ' + (after.assignee_id ? assignee.querySelector('option[value="' + after.assignee_id + '"]')?.textContent || 'Staff member' : 'Unassigned'));
                if (before.priority !== after.priority)
                    changes.push('Priority: ' + before.priority + ' → ' + after.priority);
                if (before.target_date !== after.target_date)
                    changes.push('Target date: ' + (after.target_date || 'Cleared'));
                if (before.response !== after.response)
                    changes.push('Public response: ' + (after.response || 'Cleared'));
                events.push({ heading: entry.actor?.display_name || 'Staff member', body: changes.join('\n') || 'Review confirmed; no fields changed.', created_at: entry.created_at });
            }
            for (const entry of data.transitions || []) {
                if (knownTransitions.has([entry.old_status, entry.new_status, entry.created_at, entry.note || ''].join('|')))
                    continue;
                events.push({ heading: 'Status update', body: (labels[entry.old_status] || 'Received') + ' → ' + labels[entry.new_status] + (entry.note ? '\nPublic response: ' + entry.note : ''), created_at: entry.created_at });
            }
            events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).forEach(e => activityCard(history, e.heading, e.body, e.created_at));
            for (const entry of data.notes || [])
                activityCard(notes, entry.actor?.display_name || 'Staff member', entry.body, entry.created_at);
            if (!events.length)
                history.textContent = 'No review changes recorded yet.';
            if (!data.notes?.length)
                notes.textContent = 'No internal notes yet.';
            activityMessage.textContent = '';
        }
        catch (error) {
            if (activityRequest === controller && dialog.open)
                activityMessage.textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'History request timed out. Refresh history & notes to retry.';
        }
        finally {
            clearTimeout(timer);
        }
    }
    document.getElementById('review-retry-activity').addEventListener('click', () => void loadActivity());
    internalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!active || busy || noteBusy || !internalForm.reportValidity())
            return;
        noteBusy = true;
        const button = document.getElementById('review-add-note');
        button.disabled = true;
        internalNote.disabled = true;
        internalMessage.textContent = 'Saving private note…';
        try {
            await request('/api/staff/submissions/' + encodeURIComponent(active.id) + '/notes', 'POST', { body: internalNote.value.trim() });
            internalNote.value = '';
            internalMessage.textContent = 'Private note saved.';
            void loadActivity();
        }
        catch {
            internalMessage.textContent = 'Could not confirm the note was saved. Refresh notes before retrying to avoid a duplicate. Your draft is still here.';
        }
        finally {
            noteBusy = false;
            button.disabled = false;
            internalNote.disabled = false;
        }
    });
    const viewMessage = document.getElementById('staff-view-message');
    document.getElementById('staff-save-view').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity())
            return;
        const button = form.querySelector('button');
        button.disabled = true;
        try {
            await request('/api/staff/views', 'POST', { name: document.getElementById('staff-view-name').value, filters: JSON.parse(document.getElementById('staff-filter-data').textContent || '{}') });
            window.location.reload();
        }
        catch (error) {
            viewMessage.textContent = error instanceof Error ? error.message : 'Could not save view.';
            button.disabled = false;
        }
    });
    document.querySelectorAll('[data-delete-view]').forEach(button => button.addEventListener('click', async () => {
        if (button.dataset.confirm !== 'true') {
            button.dataset.confirm = 'true';
            button.textContent = 'Remove?';
            return;
        }
        button.disabled = true;
        try {
            await request('/api/staff/views/' + encodeURIComponent(button.dataset.deleteView), 'DELETE');
            button.parentElement.remove();
        }
        catch {
            viewMessage.textContent = 'Could not remove the saved view. Try again.';
            button.disabled = false;
        }
    }));
    document.getElementById('staff-refresh').addEventListener('click', () => window.location.reload());
    document.getElementById('staff-export').addEventListener('click', () => {
        // Quote every cell and neutralize spreadsheet formulas in user-written content.
        const cell = (value) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
        const rows = [['ID', 'Title', 'Category', 'Status', 'Received'], ...items.map(item => [item.id, item.title, item.category, labels[item.status], item.created_at])];
        const csv = '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'suggfeed-review-page.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
})();
