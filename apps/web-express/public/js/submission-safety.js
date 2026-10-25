"use strict";
(() => {
    document.querySelectorAll('[data-owner-submission]').forEach(form => form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type=submit]'), message = form.querySelector('[data-safety-message]');
        button.disabled = true;
        message.textContent = 'Saving…';
        try {
            const response = await sfSchoolFetch('/api/safety/submissions/' + encodeURIComponent(form.dataset.ownerSubmission) + '/edit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify(Object.fromEntries(new FormData(form))) });
            const data = await response.json();
            if (!response.ok || !data.success)
                throw new Error(data.error || 'Your changes could not be confirmed.');
            form.elements.namedItem('version').value = String(data.version);
            message.textContent = 'Changes saved. Staff review rules still apply.';
        }
        catch (error) {
            message.textContent = error instanceof Error ? error.message : 'Could not save. Your text is still here.';
        }
        finally {
            button.disabled = false;
        }
    }));
})();
(() => {
    const request = async (path, body) => { const response = await sfSchoolFetch(path, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(20000) }); const data = await response.json(); if (!response.ok || !data.success)
        throw new Error(data.error || 'The action could not finish. Please try again.'); return data; };
    document.querySelectorAll('[data-safety-review]').forEach(form => form.addEventListener('submit', async (event) => { event.preventDefault(); const button = form.querySelector('button[type=submit]'), message = form.querySelector('[data-safety-message]'); button.disabled = true; message.textContent = 'Saving review…'; try {
        await request(form.getAttribute('action'), Object.fromEntries(new FormData(form)));
        message.textContent = 'Review saved.';
        location.reload();
    }
    catch (error) {
        message.textContent = error instanceof Error ? error.message : 'Review could not be saved. Your reason is still here.';
        button.disabled = false;
    } }));
    document.querySelectorAll('[data-safety-read]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; try {
        await request('/api/safety/notices/' + encodeURIComponent(button.dataset.safetyRead) + '/read', {});
        button.textContent = 'Read';
    }
    catch {
        button.disabled = false;
        button.textContent = 'Try marking read again';
    } }));
    const root = document.querySelector('[data-safety-notices]');
    if (!root || document.documentElement.dataset.sfRenderMode === 'studio')
        return;
    const message = root.querySelector('[data-safety-status]'), list = root.querySelector('[data-safety-notice-list]'), retry = root.querySelector('[data-safety-retry]');
    const load = async () => { retry.hidden = true; message.textContent = 'Loading submission updates…'; try {
        const data = await request('/api/safety/notices');
        list.replaceChildren();
        for (const item of data.items) {
            const row = document.createElement('article');
            row.className = 'care-row';
            const link = document.createElement('a');
            link.href = sfSchoolPath(item.kind === 'urgent' ? '/admin/safety' : item.submission_id ? '/submission/' + encodeURIComponent(item.submission_id) : '/profile');
            const labels = { pending: 'Submitted', approved: 'Planned', in_progress: 'In progress', resolved: 'Completed', rejected: 'Not proceeding' };
            link.textContent = item.kind === 'urgent' ? 'A private submission needs administrator review.' : 'Your submission is now ' + (labels[item.workflow_status] || 'updated') + '.';
            row.append(link);
            if (!item.read_at) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'workspace-button';
                button.textContent = 'Mark read';
                button.addEventListener('click', async () => { button.disabled = true; try {
                    await request('/api/safety/notices/' + encodeURIComponent(item.id) + '/read', {});
                    button.textContent = 'Read';
                }
                catch {
                    button.disabled = false;
                    button.textContent = 'Try again';
                } });
                row.append(button);
            }
            list.append(row);
        }
        message.textContent = data.items.length ? 'Latest submission updates.' : 'No submission updates yet.';
    }
    catch {
        message.textContent = 'Submission updates could not load.';
        retry.hidden = false;
    } };
    retry.addEventListener('click', () => void load());
    void load();
})();
