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
    document.querySelectorAll('[data-submission-picker]').forEach(picker => {
        const input = picker.querySelector('[data-picker-search]'), value = picker.querySelector('[data-picker-value]'), selected = picker.querySelector('[data-picker-selected]'), results = picker.querySelector('[data-picker-results]');
        let controller, timer, generation = 0;
        const status = { pending: 'Needs review', approved: 'Planned', in_progress: 'In progress', resolved: 'Completed', rejected: 'Declined' };
        const choose = (item) => { value.value = item.id; selected.textContent = `${item.title} · ${item.category || item.categories?.name || 'Other'} · ${window.sfSchoolCustomization?.labels?.[item.status] || status[item.status] || item.status} · ${item.id.slice(0, 8)}`; input.setCustomValidity(''); results.replaceChildren(); };
        if (value.value)
            void sfSchoolFetch('/api/staff/submissions/' + encodeURIComponent(value.value), { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (generation !== 0)
                return; if (!response.ok || !data.item)
                throw new Error(); choose(data.item); }).catch(() => { if (generation === 0) {
                value.value = '';
                selected.textContent = 'Selected suggestion unavailable. Search again.';
            } });
        input.addEventListener('input', () => {
            clearTimeout(timer);
            controller?.abort();
            const current = ++generation;
            value.value = '';
            selected.textContent = 'Choose a result before sending.';
            results.replaceChildren();
            input.setCustomValidity('Choose a suggestion from the search results.');
            if (input.value.trim().length < 2)
                return;
            timer = setTimeout(async () => {
                controller = new AbortController();
                selected.textContent = 'Searching…';
                try {
                    const response = await sfSchoolFetch('/api/staff/submission-search?' + new URLSearchParams({ q: input.value.trim(), public: picker.dataset.publicScope || 'false' }), { signal: controller.signal, cache: 'no-store' });
                    const data = await response.json();
                    if (current !== generation)
                        return;
                    if (!response.ok)
                        throw new Error();
                    selected.textContent = data.items.length ? 'Choose a suggestion.' : 'No matching suggestions.';
                    for (const item of data.items) {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'workspace-button';
                        button.textContent = `${item.title} · ${item.categories?.name || 'Other'} · ${window.sfSchoolCustomization?.labels?.[item.status] || status[item.status]} · ${item.id.slice(0, 8)}`;
                        button.addEventListener('click', () => choose(item));
                        results.append(button);
                    }
                }
                catch (error) {
                    if (current === generation && error.name !== 'AbortError')
                        selected.textContent = 'Search failed or session expired. Edit the search to retry.';
                }
            }, 250);
        });
        picker.closest('form')?.addEventListener('submit', event => { if (!value.value) {
            event.preventDefault();
            input.setCustomValidity('Choose a suggestion before sending.');
            input.reportValidity();
            input.focus();
        } });
    });
    async function request(path, body) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await sfSchoolFetch('/api/community/' + path, { method: body === undefined ? 'GET' : 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
        reportTarget = button.dataset.reportComment ? { commentId: button.dataset.reportComment, textRevision: Number(button.dataset.commentTextRevision) } : { submissionId: button.dataset.reportIdea };
        reportFocus = button;
        reportForm.reset();
        const reason = reportForm.querySelector('textarea');
        if (reason) {
            reason.required = !!reportTarget.commentId;
            reason.minLength = reportTarget.commentId ? 10 : 0;
            reason.placeholder = reportTarget.commentId ? 'Tell staff what needs review.' : 'Reason (optional)';
        }
        document.getElementById('content-report-message').textContent = '';
        reportDialog.showModal();
    });
    document.getElementById('content-report-cancel')?.addEventListener('click', () => reportDialog.close());
    reportDialog?.addEventListener('close', () => { const target = reportFocus?.getClientRects().length ? reportFocus : reportFocus?.closest('details')?.querySelector('summary'); target?.focus(); });
    reportForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = reportForm.querySelector('[type=submit]');
        button.disabled = true;
        try {
            const result = await request('report', { ...reportTarget, body: new FormData(reportForm).get('body') });
            if (result.hidden && reportFocus) {
                const card = reportFocus.closest('.comment-card');
                if (card)
                    window.sfHoldComment?.(card);
            }
            reportDialog.close();
            notify(result.already_reported ? 'You have already reported this comment.' : 'Report sent privately. See decisions in School messages.');
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
    const inboxRetry = document.createElement('button');
    inboxRetry.type = 'button';
    inboxRetry.className = 'workspace-button';
    inboxRetry.textContent = 'Retry messages';
    inboxRetry.hidden = true;
    messages?.before(inboxRetry);
    inboxRetry.addEventListener('click', () => void loadInbox());
    async function loadInbox() {
        if (!messages)
            return;
        inboxRetry.hidden = true;
        const drafts = new Map(Array.from(messages.querySelectorAll('textarea[data-request-id]')).map(input => [input.dataset.requestId, input.value]));
        const inboxCode = privateCode;
        const version = ++inboxVersion;
        notify('Loading private messages…');
        try {
            const data = await request('inbox', inboxCode ? { trackingCode: inboxCode } : {});
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
                    textarea.dataset.requestId = entry.id;
                    textarea.value = drafts.get(entry.id) || '';
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
                            const reply = textarea.value;
                            await request('reply', { id: entry.id, body: reply, ...(inboxCode ? { trackingCode: inboxCode } : {}) });
                            const quote = document.createElement('blockquote');
                            quote.textContent = reply;
                            form.replaceWith(quote);
                            state.textContent = 'Reply sent privately to staff';
                            notify('Private reply sent.');
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
            if (!data.requests.length)
                messages.append(sfEmptyState({ icon: 'message', heading: 'No private questions right now', description: 'When staff need more detail about your submission, their question will appear here. Public updates are on the roadmap.', href: '/roadmap', label: 'Explore the roadmap' }));
            notify(data.requests.length ? `${data.requests.length} private requests shown.` : 'No clarification requests for these submissions.');
        }
        catch (error) {
            if (version === inboxVersion) {
                notify(fail(error));
                inboxRetry.hidden = false;
            }
        }
    }
    document.getElementById('private-code-form')?.addEventListener('submit', async (e) => { e.preventDefault(); if (Array.from(messages?.querySelectorAll('textarea') || []).some(el => el.value.trim()) && !await window.sfConfirm('Discard your unsent private reply and look up another submission?'))
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
        const loadMerges = async () => {
            container.textContent = 'Loading merge history…';
            try {
                const data = await request('merges/' + encodeURIComponent(container.dataset.mergeHistory || ''));
                container.replaceChildren();
                if (!data.merges.length)
                    container.append(sfEmptyState({ compact: true, icon: 'merge', heading: 'No merged ideas', description: 'Related ideas that staff merge into this one will be listed here, with the reason.' }));
                for (const merge of data.merges) {
                    const p = document.createElement('p');
                    p.textContent = `Merged idea: ${merge.source_title} · ${merge.reason}`;
                    container.append(p);
                }
            }
            catch {
                container.textContent = 'Merge history could not load. ';
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'workspace-button';
                retry.textContent = 'Retry history';
                retry.addEventListener('click', () => void loadMerges());
                container.append(retry);
            }
        };
        void loadMerges();
    });
    if (history) {
        if (!signedIn) {
            history.replaceChildren(sfEmptyState({ compact: true, icon: 'shield', heading: 'Your reports stay private', description: 'Sign in using the button in the header to see staff decisions on your reports.' }));
        }
        else {
            const loadReports = async () => {
                history.textContent = 'Loading report decisions…';
                try {
                    const data = await request('report-history');
                    history.replaceChildren();
                    if (!data.reports.length)
                        history.append(sfEmptyState({ compact: true, icon: 'shield', heading: 'No reports submitted', description: 'If you report inappropriate content on an idea or comment, the staff decision will appear here.' }));
                    for (const report of data.reports) {
                        const p = document.createElement('p');
                        p.textContent = `${report.resolution || 'Awaiting staff review'} · ${report.resolution_reason || report.reason}`;
                        history.append(p);
                    }
                }
                catch {
                    history.textContent = 'Report decisions could not load. ';
                    const retry = document.createElement('button');
                    retry.type = 'button';
                    retry.className = 'workspace-button';
                    retry.textContent = 'Retry decisions';
                    retry.addEventListener('click', () => void loadReports());
                    history.append(retry);
                }
            };
            void loadReports();
        }
    }
    document.addEventListener('submit', async (e) => {
        const form = e.target.closest('[data-care-action]');
        if (!form || e.defaultPrevented)
            return;
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
            if (action === 'comment-review') {
                body.version = Number(body.version);
                body.textRevision = Number(body.textRevision);
                confirmation = body.decision === 'delete' ? 'Delete this comment text? Replies and the moderation record are preserved.' : body.decision === 'hide' ? 'Hide this comment from public discussion?' : 'Approve this comment for public discussion?';
            }
            if (!await window.sfConfirm(confirmation))
                return;
            await request('staff/' + action, body);
            notify(action === 'comment-review' ? 'Decision saved. The author can see your reason in School updates.' : 'Saved. Refresh this page to see the updated queue.');
            form.reset();
            if (action === 'close' || action === 'resolve' || action === 'comment-review') {
                if (action === 'comment-review') {
                    location.reload();
                    return;
                }
                const card = form.closest('article'), section = card?.closest('section');
                card?.remove();
                if (section && !section.querySelector('.care-row'))
                    section.append(sfEmptyState({ compact: true, icon: action === 'close' ? 'message' : 'shield', heading: action === 'resolve' ? 'No open reports' : 'No open private questions', description: 'You’re all caught up. New follow-ups will appear here.' }));
            }
        }
        catch (error) {
            notify(fail(error));
        }
        finally {
            button.disabled = false;
        }
    });
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
                const data = await request('similar', { q: titleInput.value });
                if (version !== searchVersion || !similar)
                    return;
                similar.replaceChildren();
                if (!data.ideas.length)
                    return;
                const heading = document.createElement('h4');
                heading.textContent = 'Similar suggestions already exist';
                const help = document.createElement('p');
                help.textContent = 'These public suggestions may describe the same change. Support an existing idea instead, or keep writing your draft.';
                similar.append(heading, help);
                for (const idea of data.ideas) {
                    const link = document.createElement('a');
                    link.href = sfSchoolPath('/idea/' + encodeURIComponent(idea.id));
                    link.target = '_blank';
                    link.rel = 'noopener';
                    link.textContent = `${idea.title} · ${idea.vote_count} supporters ↗`;
                    link.setAttribute('aria-label', `${idea.title}, similar suggestion, opens in a new tab`);
                    similar.append(link);
                    const vote = document.createElement('button');
                    vote.type = 'button';
                    vote.className = 'workspace-button';
                    vote.textContent = 'Support instead';
                    vote.addEventListener('click', async () => { vote.disabled = true; try {
                        const response = await sfSchoolFetch('/api/vote/' + encodeURIComponent(idea.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'up' }) });
                        const result = await response.json();
                        if (!response.ok || !result.success)
                            throw Error();
                        vote.textContent = 'Supported';
                        notify('Your support was recorded. Your draft is still here.');
                    }
                    catch {
                        vote.disabled = false;
                        notify('Support could not be confirmed. Open the idea to check before retrying.');
                    } });
                    similar.append(vote);
                }
            }
            catch {
                if (version === searchVersion && similar)
                    similar.textContent = 'Related ideas are temporarily unavailable. You can still submit.';
            }
        }, 450);
    });
})();
