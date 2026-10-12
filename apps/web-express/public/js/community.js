"use strict";
(() => {
    if (window.__communityReady)
        return;
    window.__communityReady = true;
    const signedIn = !!document.getElementById('sf-auth-config')?.dataset.user;
    const message = document.getElementById('care-message');
    const notify = (text) => { if (message)
        message.textContent = text;
    else
        window.sfToast?.(text, 'info'); };
    async function request(path, body) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('/api/community/' + path, { method: body === undefined ? 'GET' : 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            const data = await response.json();
            if (!response.ok || !data.success)
                throw new Error(data.error || 'This request could not be completed.');
            return data;
        }
        finally {
            clearTimeout(timer);
        }
    }
    const fail = (e) => e.name === 'AbortError' ? 'The request timed out. Refresh before retrying a change.' : e.message;
    const reportDialog = document.getElementById('content-report-dialog');
    const reportForm = document.getElementById('content-report-form');
    let reportTarget = {};
    let reportFocus = null;
    document.addEventListener('click', e => {
        const button = e.target.closest('[data-report-idea],[data-report-comment]');
        if (!button)
            return;
        if (!signedIn) {
            window.openAuthModal?.();
            notify('Sign in to send a private report.');
            return;
        }
        reportTarget = button.dataset.reportComment ? { commentId: button.dataset.reportComment } : { submissionId: button.dataset.reportIdea };
        reportFocus = button;
        reportForm.reset();
        document.getElementById('content-report-message').textContent = '';
        reportDialog.showModal();
    });
    document.getElementById('content-report-cancel')?.addEventListener('click', () => reportDialog.close());
    reportDialog?.addEventListener('close', () => reportFocus?.focus());
    reportForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = reportForm.querySelector('[type=submit]');
        button.disabled = true;
        try {
            await request('report', { ...reportTarget, body: new FormData(reportForm).get('body') });
            reportDialog.close();
            notify('Report sent privately. See decisions in School messages.');
        }
        catch (error) {
            document.getElementById('content-report-message').textContent = fail(error);
        }
        finally {
            button.disabled = false;
        }
    });
    // No code or private message is put in a URL, analytics event, or local storage.
    let privateCode = '';
    let inboxVersion = 0;
    const messages = document.getElementById('private-messages');
    async function loadInbox() {
        if (!messages)
            return;
        const version = ++inboxVersion;
        notify('Loading private messages…');
        try {
            const data = await request('inbox', privateCode ? { trackingCode: privateCode } : {});
            if (version !== inboxVersion)
                return;
            messages.replaceChildren();
            for (const entry of data.requests) {
                const card = document.createElement('article');
                card.className = 'care-card';
                const title = document.createElement('h2');
                title.textContent = entry.title;
                const prompt = document.createElement('p');
                prompt.textContent = entry.prompt;
                const state = document.createElement('p');
                state.textContent = entry.closed_at ? 'Request closed' : entry.reply ? 'Reply sent privately to staff' : 'Your school needs a little more detail';
                card.append(title, prompt, state);
                if (entry.reply) {
                    const reply = document.createElement('blockquote');
                    reply.textContent = entry.reply;
                    card.append(reply);
                }
                else if (!entry.closed_at) {
                    const form = document.createElement('form');
                    form.className = 'care-form';
                    const label = document.createElement('label');
                    label.textContent = 'Your private reply';
                    const textarea = document.createElement('textarea');
                    textarea.className = 'workspace-input';
                    textarea.required = true;
                    textarea.minLength = 10;
                    textarea.maxLength = 2000;
                    label.append(textarea);
                    const button = document.createElement('button');
                    button.type = 'submit';
                    button.className = 'workspace-button';
                    button.textContent = 'Send private reply';
                    form.append(label, button);
                    form.addEventListener('submit', async (event) => {
                        event.preventDefault();
                        button.disabled = true;
                        try {
                            await request('reply', { id: entry.id, body: textarea.value, ...(privateCode ? { trackingCode: privateCode } : {}) });
                            await loadInbox();
                        }
                        catch (error) {
                            notify(fail(error));
                            button.disabled = false;
                        }
                    });
                    card.append(form);
                }
                messages.append(card);
            }
            notify(data.requests.length ? `${data.requests.length} private requests shown.` : 'No clarification requests for these submissions.');
        }
        catch (error) {
            if (version === inboxVersion)
                notify(fail(error));
        }
    }
    document.getElementById('private-code-form')?.addEventListener('submit', e => { e.preventDefault(); if (Array.from(messages?.querySelectorAll('textarea') || []).some(el => el.value.trim()) && !window.confirm('Discard your unsent private reply and look up another submission?'))
        return; privateCode = String(new FormData(e.target).get('trackingCode') || '').trim(); void loadInbox(); });
    if (messages)
        window.addEventListener('beforeunload', e => { if (Array.from(messages.querySelectorAll('textarea')).some(el => el.value.trim())) {
            e.preventDefault();
            e.returnValue = '';
        } });
    if (messages && signedIn)
        void loadInbox();
    const history = document.getElementById('my-report-history');
    document.querySelectorAll('[data-merge-history]').forEach(container => {
        void request('merges/' + encodeURIComponent(container.dataset.mergeHistory || '')).then(data => {
            for (const merge of data.merges) {
                const p = document.createElement('p');
                p.textContent = `Merged idea: ${merge.source_title} · ${merge.reason}`;
                container.append(p);
            }
        }).catch(() => { container.textContent = 'Merge history could not load.'; });
    });
    if (history) {
        if (!signedIn)
            history.textContent = 'Sign in to see decisions on your reports.';
        else
            void request('report-history').then(data => {
                history.textContent = data.reports.length ? '' : 'No reports submitted.';
                for (const report of data.reports) {
                    const p = document.createElement('p');
                    p.textContent = `${report.resolution || 'Awaiting staff review'} · ${report.resolution_reason || report.reason}`;
                    history.append(p);
                }
            }).catch(() => { history.textContent = 'Report decisions could not load. Refresh to retry.'; });
    }
    document.querySelectorAll('[data-care-action]').forEach(form => form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = form.querySelector('[type=submit],button');
        button.disabled = true;
        const body = Object.fromEntries(new FormData(form));
        const action = form.dataset.careAction;
        try {
            let confirmation = 'Save this private clarification change?';
            if (action === 'merge') {
                const [source, target] = await Promise.all([request('staff/idea/' + encodeURIComponent(body.submissionId)), request('staff/idea/' + encodeURIComponent(body.targetId))]);
                body.updatedAt = source.idea.updated_at;
                body.targetUpdatedAt = target.idea.updated_at;
                confirmation = `Merge “${source.idea.title}” into “${target.idea.title}”? The source leaves public lists, followers move, and votes stay separate. This publishes your merge reason. This cannot be undone here.`;
            }
            else if (action === 'resolve')
                confirmation = `${body.resolution === 'removed' ? 'Remove content from public view' : 'Keep the reported content'}? Your reason is shown privately to the reporter.`;
            if (!window.confirm(confirmation))
                return;
            await request('staff/' + action, body);
            notify('Saved. Refresh this page to see the updated queue.');
            form.reset();
            if (action === 'close' || action === 'resolve')
                form.closest('article')?.remove();
        }
        catch (error) {
            notify(fail(error));
        }
        finally {
            button.disabled = false;
        }
    }));
    // Similar public ideas: debounce, abort stale lookups, retain the draft.
    const titleInput = document.getElementById('sip-title');
    const similar = document.getElementById('similar-public-ideas');
    let searchTimer, searchVersion = 0;
    document.getElementById('submit-idea-form')?.addEventListener('reset', () => { clearTimeout(searchTimer); searchVersion++; similar?.replaceChildren(); });
    titleInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const version = ++searchVersion;
        if (titleInput.value.trim().length < 10) {
            similar?.replaceChildren();
            return;
        }
        searchTimer = window.setTimeout(async () => {
            try {
                const data = await request('similar?q=' + encodeURIComponent(titleInput.value));
                if (version !== searchVersion || !similar)
                    return;
                similar.replaceChildren();
                if (!data.ideas.length)
                    return;
                const heading = document.createElement('h4');
                heading.textContent = 'Related public ideas';
                const help = document.createElement('p');
                help.textContent = 'Support an existing idea if it describes the same change. Links open a new tab so your draft stays here.';
                similar.append(heading, help);
                for (const idea of data.ideas) {
                    const link = document.createElement('a');
                    link.href = '/idea/' + encodeURIComponent(idea.id);
                    link.target = '_blank';
                    link.rel = 'noopener';
                    link.textContent = `${idea.title} · ${idea.vote_count} supporters ↗`;
                    similar.append(link);
                }
            }
            catch {
                if (version === searchVersion && similar)
                    similar.textContent = 'Related ideas are temporarily unavailable. You can still submit.';
            }
        }, 450);
    });
})();
