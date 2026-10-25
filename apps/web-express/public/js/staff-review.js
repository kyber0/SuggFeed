"use strict";
(() => {
    const queueData = document.getElementById('staff-queue-data');
    const isQueue = !!queueData;
    let items = JSON.parse(queueData?.textContent || '[]');
    const currentUser = JSON.parse(document.getElementById('staff-current-user').textContent || '{}').id;
    const dialog = document.getElementById('staff-review-dialog');
    const mode = dialog.dataset.detailMode || 'community';
    const resultPanel = document.getElementById('review-decision-result');
    const openWork = document.getElementById('review-open-work');
    let decisionSaved = false;
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
    const save = document.getElementById('review-save');
    const saveNext = document.getElementById('review-save-next');
    const message = document.getElementById('review-message');
    const pageMessage = (document.getElementById('staff-page-message') || document.getElementById('care-message') || document.getElementById('staff-tools-message'));
    const discardWarning = document.getElementById('review-discard-warning');
    const reviewed = new Set();
    let noteBusy = false, busy = false, saved = false, refreshing = false;
    let activityRequest;
    let detailRequest;
    let requestedId = '', requestedSection = 'decision';
    let active;
    let returnFocus = null;
    let group = null;
    const groupPanel = document.getElementById('review-group');
    const groupNext = document.getElementById('review-group-next');
    const groupSkip = document.getElementById('review-group-skip');
    function groupAction(item) { return { approved: { in_progress: 'start' }, in_progress: { resolved: 'complete' }, resolved: { in_progress: 'reopen' } }[item.status]?.[group?.stage || '']; }
    function paintGroup() {
        if (!groupPanel)
            return;
        groupPanel.hidden = !group;
        if (!group)
            return;
        const entry = group.entries[group.index], locked = busy || noteBusy || !!window.sfStaffProgress?.isBusy() || dialog.hasAttribute('aria-busy');
        document.getElementById('review-group-position').textContent = `Group · ${group.index + 1} / ${group.entries.length} · ${labels[group.stage]}${entry.result === 'saved' ? ' · Saved' : ''}`;
        document.getElementById('review-group-message').textContent = group.notice;
        if (/could not|cannot enter|has not reached/.test(group.notice))
            groupPanel.querySelector('details').open = true;
        groupNext.disabled = locked || entry.result === 'pending';
        groupSkip.disabled = locked || entry.result !== 'pending';
        groupNext.textContent = group.index === group.entries.length - 1 ? 'Finish' : 'Next';
        groupNext.setAttribute('aria-label', group.index === group.entries.length - 1 ? 'Finish group review' : 'Review next idea');
        const list = document.getElementById('review-group-results');
        list.replaceChildren();
        const names = { pending: 'Not moved', saved: 'Move saved', skipped: 'Skipped', already: 'Already in target stage' };
        for (const item of group.entries) {
            const row = document.createElement('li');
            row.textContent = item.title + ' · ' + names[item.result];
            if (item === entry)
                row.setAttribute('aria-current', 'step');
            list.append(row);
        }
    }
    async function openGroupItem(discard = false) {
        const current = group;
        if (!current)
            return;
        const index = current.index, entry = current.entries[index];
        current.notice = 'Loading current details…';
        paintGroup();
        await openReview(entry.id, undefined, 'progress', discard);
        if (group !== current || group.index !== index)
            return;
        if (active?.id !== entry.id) {
            current.notice = 'This idea could not load. Retry loading it or skip it; no move was saved.';
            paintGroup();
            return;
        }
        if (active.status === current.stage) {
            entry.result = 'already';
            current.notice = 'Already in this stage. No change was saved; continue to the next idea.';
        }
        else {
            const action = groupAction(active);
            current.notice = action ? 'Review this idea and save its work action before continuing. Each move is saved separately.' : 'This idea changed and cannot enter the selected stage. Skip it or stop to refresh the board.';
            if (action)
                window.sfStaffProgress?.prepareAction?.(action);
        }
        selectTab('progress');
        paintGroup();
    }
    async function advanceGroup(skip = false) {
        if (!group || busy || noteBusy || window.sfStaffProgress?.isBusy() || dialog.hasAttribute('aria-busy'))
            return;
        const current = group, entry = current.entries[current.index];
        if (!skip && entry.result === 'pending')
            return;
        let discard = false;
        if (hasUnsavedChanges()) {
            if (!await window.sfConfirm('Discard the unsaved changes for this idea and continue the group review?'))
                return;
            discard = true;
        }
        if (group !== current || busy || noteBusy || window.sfStaffProgress?.isBusy())
            return;
        if (skip)
            entry.result = 'skipped';
        if (current.index === current.entries.length - 1) {
            close(discard);
            return;
        }
        current.index++;
        await openGroupItem(discard);
    }
    groupNext?.addEventListener('click', () => void advanceGroup());
    groupSkip?.addEventListener('click', () => void advanceGroup(true));
    document.addEventListener('sf:review-group', event => {
        if (!groupPanel || !document.getElementById('staff-board-data'))
            return;
        if (group || busy || noteBusy || window.sfStaffProgress?.isBusy() || dialog.open) {
            pageMessage.textContent = 'Finish the current review before starting a selected group move.';
            return;
        }
        const detail = event.detail;
        if (!Array.isArray(detail?.items) || detail.items.length < 2 || detail.items.length > 25 || !['approved', 'in_progress', 'resolved'].includes(detail.stage))
            return;
        const ids = new Set();
        const entries = [];
        for (const item of detail.items) {
            if (typeof item?.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) || ids.has(item.id))
                return;
            ids.add(item.id);
            entries.push({ id: item.id, title: String(item.title || 'Idea'), result: 'pending' });
        }
        group = { entries, stage: detail.stage, index: 0, notice: '' };
        groupPanel.querySelector('details').open = false;
        returnFocus = detail.trigger instanceof HTMLElement ? detail.trigger : null;
        void openGroupItem();
    });
    let repairRetry;
    const repairForm = document.getElementById('work-date-repair-form');
    function hasRepairDraft() { return !!repairForm && !repairForm.hidden && ['repair-source', 'repair-reason', 'repair-start', 'repair-end'].some(id => { const input = document.getElementById(id); return input && input.value !== input.defaultValue; }); }
    function paintWorkflow(context) {
        if (!context || !active)
            return;
        active.workflow = context;
        const state = document.getElementById('workflow-state'), actions = document.getElementById('workflow-actions');
        if (!state || !actions)
            return;
        state.textContent = context.paused ? 'Work changes are temporarily paused.' : context.issues.length ? 'Work changes require verified historical dates. Reading, assignment and private follow-ups remain available.' : context.mode === 'preview' ? 'Choose an action. Nothing changes until you save.' : 'Choose the next action. Saving assignment does not publish an update.';
        if (mode === 'review' && !context.paused && !context.issues.length)
            state.textContent = active.status === 'pending' ? 'Read the idea, then approve, request clarification or decline.' : 'This decision has been recorded. Approved delivery work is managed on the Work board.';
        if (mode === 'work' && ['pending', 'rejected'].includes(active.status))
            state.textContent = 'This idea is not active delivery work. Open Review ideas to read its decision.';
        actions.replaceChildren();
        if (mode === 'review' && ['approved', 'in_progress', 'resolved'].includes(active.status) || mode === 'work' && ['pending', 'rejected'].includes(active.status)) {
            const link = document.createElement('a');
            link.className = 'workspace-button workspace-button--primary';
            link.textContent = mode === 'review' ? 'Open in Work' : 'Open Review ideas';
            link.href = sfSchoolPath((mode === 'review' ? '/admin/work?presentation=board&' : '/admin/reviews?') + 'idea=' + encodeURIComponent(active.id));
            actions.append(link);
        }
        const names = { approve: 'Approve', decline: 'Decline', start: 'Start work', update: 'Publish update', milestone: 'Record milestone', pause: 'Pause work', resume: 'Resume work', complete: 'Complete with evidence', correction: 'Correct an update', reopen: 'Reopen work', withdraw: 'Withdraw public idea' };
        const more = document.createElement('details'), caption = document.createElement('summary');
        caption.textContent = 'Other actions';
        more.className = 'workflow-secondary';
        more.append(caption);
        const primary = active.status === 'pending' ? ['approve', 'decline'] : active.status === 'approved' ? ['start'] : context.allowedActions.includes('resume') ? ['resume', 'complete'] : active.status === 'in_progress' ? ['update', 'complete'] : ['reopen', 'correction'];
        for (const action of context.allowedActions) {
            if (mode === 'review' && (active.status !== 'pending' || !['approve', 'decline'].includes(action)) || mode === 'work' && ['approve', 'decline'].includes(action))
                continue;
            if (group && action !== groupAction(active))
                continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'workspace-button';
            if (action === primary[0] || group)
                button.classList.add('workspace-button--primary');
            if (action === 'decline')
                button.classList.add('staff-action-decline');
            button.textContent = names[action];
            button.dataset.workflowAction = action;
            (primary.includes(action) ? actions : more).append(button);
        }
        if (mode !== 'review' && !group && context.allowedActions.includes('withdraw')) {
            const merge = document.createElement('a');
            merge.className = 'workspace-button';
            merge.textContent = 'Merge duplicate';
            merge.href = sfSchoolPath('/admin/community?section=clarifications&task=merge&idea=' + encodeURIComponent(active.id));
            more.append(merge);
        }
        if (mode === 'review' && active.status === 'pending') {
            const clarify = document.createElement('a');
            clarify.className = 'workspace-button';
            clarify.textContent = 'Request clarification';
            clarify.href = sfSchoolPath('/admin/community?section=clarifications&idea=' + encodeURIComponent(active.id));
            actions.append(clarify);
        }
        if (more.children.length > 1)
            actions.append(more);
        if (repairForm)
            repairForm.hidden = !context.canRepair;
    }
    document.addEventListener('sf:workflow-context', event => paintWorkflow(event.detail));
    document.addEventListener('click', event => { const button = event.target.closest('[data-workflow-action]'); if (button) {
        selectTab('progress');
        window.sfStaffProgress?.prepareAction?.(button.dataset.workflowAction);
    } });
    document.addEventListener('sf:review-action', event => { if (group) {
        pageMessage.textContent = 'Finish the selected group review first.';
        return;
    } const { id, action, trigger } = event.detail || {}; if (typeof id !== 'string')
        return; void openReview(id, trigger).then(() => { if (active?.id === id) {
        selectTab('progress');
        window.sfStaffProgress?.prepareAction?.(action);
    } }); });
    const labels = { pending: 'Needs review', approved: 'Planned', in_progress: 'In progress', resolved: 'Completed', rejected: 'Declined' };
    const hints = {
        pending: 'Keep this suggestion in the private review queue.',
        approved: 'Publish this idea to the community feed and Planned roadmap stage.',
        in_progress: 'Show the community that work on this idea is underway.',
        resolved: 'Mark the idea as completed on the public roadmap.',
        rejected: 'Remove this idea from public views. Explain the decision for the submitter.'
    };
    function selectTab(key, focus = false) {
        if (mode === 'review' && key === 'progress') {
            const tab = dialog.querySelector('[data-review-tab="progress"]');
            if (tab)
                tab.hidden = false;
        }
        dialog.querySelectorAll('[data-review-tab]').forEach(button => {
            const selected = button.dataset.reviewTab === key;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            if (selected && focus)
                button.focus();
        });
        const changed = dialog.dataset.activePanel !== key;
        dialog.dataset.activePanel = key;
        dialog.querySelectorAll('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.id !== 'review-panel-' + key; });
        const progressFooter = document.getElementById('staff-progress-footer');
        if (progressFooter)
            progressFooter.hidden = key !== 'progress';
        if (changed) {
            const scroll = dialog.querySelector('.staff-review-scroll');
            if (scroll)
                scroll.scrollTop = 0;
            const panel = document.getElementById('review-panel-' + key);
            if (panel && typeof panel.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                (panel.getAnimations?.() || []).forEach(animation => animation.cancel());
                panel.animate([{ opacity: .65, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' });
            }
        }
        updateDraft();
    }
    const tabs = Array.from(dialog.querySelectorAll('[data-review-tab]'));
    tabs.forEach(button => {
        button.addEventListener('click', () => selectTab(button.dataset.reviewTab));
        button.addEventListener('keydown', event => {
            const available = tabs.filter(tab => !tab.hidden), position = available.indexOf(button);
            const next = event.key === 'ArrowRight' ? (position + 1) % available.length : event.key === 'ArrowLeft' ? (position + available.length - 1) % available.length : event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : -1;
            if (next >= 0) {
                event.preventDefault();
                selectTab(available[next].dataset.reviewTab, true);
            }
        });
    });
    function hasReviewDraft() { return Boolean(active && !saved && (status.value !== active.status || note.value !== active.staff_note || assignee.value !== active.assignee_id || priority.value !== active.priority || targetDate.value !== active.target_date)); }
    function hasUnsavedChanges() { return Boolean(internalNote.value.trim() || hasReviewDraft() || hasRepairDraft() || window.sfStaffProgress?.hasDraft()); }
    function updateDraft() {
        document.getElementById('review-draft-state').textContent = hasUnsavedChanges() ? 'Unsaved changes' : saved ? 'Changes saved' : 'No unsaved changes';
        const coordination = dialog.querySelector('[data-review-tab="decision"]')?.getAttribute('aria-selected') === 'true';
        save.hidden = saved || !coordination || !hasReviewDraft();
        saveNext.hidden = save.hidden || !isQueue;
    }
    function updateHint() { document.getElementById('review-status-hint').textContent = hints[status.value] || ''; }
    function updateCount() { document.getElementById('review-note-count').textContent = note.value.length.toLocaleString() + ' / 2,000'; updateDraft(); }
    function close(discard = false) {
        if (busy || noteBusy || window.sfStaffProgress?.isBusy())
            return;
        if (!discard && hasUnsavedChanges()) {
            discardWarning.hidden = false;
            document.getElementById('review-keep-editing').focus();
            return;
        }
        dialog.close();
    }
    function paintWorkFacts(item) {
        if (mode !== 'work')
            return;
        const date = (value) => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Not recorded';
        for (const [id, text] of [['owner', assignee.selectedOptions[0]?.textContent || 'Unassigned'], ['target', item.target_date ? date(item.target_date) : 'Not set'], ['started', date(item.started_at)], ['completed', date(item.resolved_at)]])
            document.getElementById('work-fact-' + id).textContent = text;
    }
    function populateReview(item, section = 'decision') {
        active = item;
        decisionSaved = false;
        resultPanel.hidden = true;
        if (mode === 'review') {
            const tab = dialog.querySelector('[data-review-tab="progress"]');
            if (tab)
                tab.hidden = true;
        }
        const index = items.findIndex(i => i.id === item.id);
        if (index >= 0)
            items[index] = item;
        saved = false;
        fields.disabled = false;
        save.disabled = false;
        save.hidden = false;
        saveNext.hidden = false;
        saveNext.disabled = false;
        save.textContent = 'Save planning';
        discardWarning.hidden = true;
        message.textContent = '';
        message.classList.remove('is-success');
        document.getElementById('review-dismiss').textContent = 'Close';
        document.getElementById('review-title').textContent = item.title;
        const ownership = document.getElementById('review-assignment-link');
        if (ownership)
            ownership.href = sfSchoolPath('/admin/assignments?view=history&kind=suggestion&id=' + encodeURIComponent(item.id));
        document.getElementById('review-description').textContent = item.description;
        const categoryLabel = document.getElementById('review-category');
        if (categoryLabel)
            categoryLabel.textContent = item.category;
        const received = document.getElementById('review-received');
        const receivedDate = new Date(item.created_at);
        if (received) {
            received.textContent = Number.isFinite(receivedDate.getTime()) ? 'Received ' + receivedDate.toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Date unavailable';
            if (Number.isFinite(receivedDate.getTime()))
                received.dateTime = receivedDate.toISOString();
            else
                received.removeAttribute('datetime');
        }
        document.getElementById('review-meta').textContent = item.category + ' · ' + (received?.textContent || 'Date unavailable') + ' · Submission ID: ' + item.id;
        let clarification = document.getElementById('review-clarification-link');
        if (!clarification) {
            clarification = document.createElement('a');
            clarification.id = 'review-clarification-link';
            clarification.textContent = 'Request private clarification →';
            document.getElementById('review-meta').after(clarification);
        }
        clarification.href = sfSchoolPath('/admin/community?idea=' + encodeURIComponent(item.id));
        document.getElementById('review-position').textContent = isQueue && index >= 0 ? 'Item ' + (index + 1) + ' of ' + items.length + ' on this page' : isQueue ? 'Opened from a direct link' : document.getElementById('staff-board-data') ? 'Work board' : 'Community care';
        const badge = document.getElementById('review-current-status');
        badge.textContent = labels[item.status];
        badge.dataset.status = item.status;
        status.value = item.status;
        note.value = item.staff_note;
        priority.value = item.priority;
        targetDate.value = item.target_date;
        assignee.querySelector('[data-former-staff]')?.remove();
        if (item.assignee_id && !Array.from(assignee.options).some(o => o.value === item.assignee_id)) {
            const option = new Option('Former staff — choose an active assignee', item.assignee_id);
            option.dataset.formerStaff = 'true';
            assignee.add(option);
        }
        assignee.value = item.assignee_id;
        paintWorkFacts(item);
        internalNote.value = '';
        internalMessage.textContent = '';
        targetDate.removeAttribute('aria-invalid');
        document.getElementById('review-date-error').textContent = '';
        updateHint();
        updateCount();
        selectTab(section);
        if (!dialog.open)
            dialog.showModal();
        else
            tabs[0].focus();
        dialog.querySelector('.staff-review-scroll').scrollTop = 0;
        void loadActivity();
        window.sfStaffProgress?.open(item);
        repairRetry = undefined;
        if (repairForm) {
            for (const [id, value] of [['repair-start', item.started_at], ['repair-end', item.resolved_at], ['repair-source', ''], ['repair-reason', '']]) {
                const input = document.getElementById(id);
                input.value = value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10) : '';
                input.defaultValue = input.value;
            }
            document.getElementById('repair-end-wrap').hidden = item.status !== 'resolved';
            document.getElementById('repair-end').required = item.status === 'resolved';
        }
        paintWorkflow(item.workflow);
    }
    repairForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!active || busy || noteBusy || window.sfStaffProgress?.isBusy() || !repairForm.reportValidity())
            return;
        const value = (id) => document.getElementById(id).value;
        const payload = JSON.stringify({ updatedAt: active.updated_at, startedOn: value('repair-start'), completedOn: value('repair-end'), source: value('repair-source'), reason: value('repair-reason') });
        if (!repairRetry || repairRetry.payload !== payload)
            repairRetry = { payload, id: crypto.randomUUID() };
        const state = document.getElementById('repair-message');
        busy = true;
        const button = repairForm.querySelector('button[type="submit"]');
        button.disabled = true;
        state.textContent = 'Saving verified dates…';
        try {
            const data = await request('/api/staff/submissions/' + active.id + '/work-dates', 'POST', { ...JSON.parse(payload), requestId: repairRetry.id });
            for (const id of ['repair-source', 'repair-reason', 'repair-start', 'repair-end']) {
                const input = document.getElementById(id);
                input.defaultValue = input.value;
            }
            Object.assign(active, data.submission);
            paintWorkflow(data.workflow);
            state.textContent = 'Verified dates saved.';
            repairRetry = undefined;
            busy = false;
            try {
                await refreshQueue();
                await window.sfStaffProgress?.refresh();
            }
            catch {
                state.textContent = 'Verified dates saved, but the workspace could not refresh.';
            }
        }
        catch (error) {
            state.textContent = error.message || 'Could not confirm the repair. Keep your draft and retry the same request.';
        }
        finally {
            busy = false;
            button.disabled = false;
            updateDraft();
        }
    });
    async function openReview(id, trigger, section = 'decision', discard = false) {
        if (busy || noteBusy || window.sfStaffProgress?.isBusy())
            return;
        if (!discard && dialog.open && hasUnsavedChanges()) {
            discardWarning.hidden = false;
            document.getElementById('review-keep-editing').focus();
            return;
        }
        detailRequest?.abort();
        activityRequest?.abort();
        window.sfStaffProgress?.close();
        requestedId = id;
        requestedSection = section === 'progress' ? 'progress' : 'decision';
        if (!dialog.open && !group)
            returnFocus = trigger || document.activeElement;
        active = undefined;
        internalNote.value = '';
        saved = false;
        discardWarning.hidden = true;
        dialog.dataset.unavailable = 'true';
        dialog.setAttribute('aria-busy', 'true');
        fields.disabled = true;
        save.hidden = true;
        saveNext.hidden = true;
        document.getElementById('review-title').textContent = 'Loading submission…';
        document.getElementById('review-position').textContent = '';
        message.textContent = 'Loading fresh details…';
        message.classList.remove('is-success');
        const retry = document.getElementById('review-retry-detail');
        retry.hidden = true;
        if (!dialog.open)
            dialog.showModal();
        const controller = new AbortController();
        detailRequest = controller;
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
                throw new Error('This link contains an invalid submission ID.');
            const response = await sfSchoolFetch('/api/staff/submissions/' + encodeURIComponent(id), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.success)
                throw new Error(response.status === 401 || response.status === 403 ? 'Your staff session expired or access changed. Sign in again.' : response.status === 404 ? 'This submission is no longer available.' : 'Submission details could not load. Please retry.');
            if (!dialog.open || detailRequest !== controller)
                return;
            if (body.item?.id !== id || !labels[body.item?.status])
                throw new Error('Submission details were incomplete. Please retry.');
            delete dialog.dataset.unavailable;
            populateReview(body.item, requestedSection);
            if (isQueue || mode === 'work') {
                const url = new URL(window.location.href);
                url.searchParams.set('idea', id);
                history.replaceState(history.state, '', url);
            }
        }
        catch (error) {
            if (dialog.open && detailRequest === controller) {
                document.getElementById('review-title').textContent = 'Submission unavailable';
                message.textContent = error.name === 'AbortError' ? 'Loading timed out. Retry loading this submission.' : error.message;
                retry.hidden = false;
            }
        }
        finally {
            clearTimeout(timer);
            if (detailRequest === controller)
                dialog.removeAttribute('aria-busy');
            paintGroup();
        }
    }
    document.addEventListener('click', event => {
        const target = event.target;
        const card = target.closest('[data-board-id]');
        if (card && (Date.now() - Number(card.dataset.draggedAt || 0) < 400 || card.dataset.dragging === 'true')) {
            event.preventDefault();
            return;
        }
        const button = target.closest('[data-review]');
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
            return;
        if (button) {
            event.preventDefault();
            void openReview(button.dataset.review, button, button.dataset.reviewSection);
        }
        else if (card && !target.closest('input,select,button,a,label,summary,details') && !window.getSelection()?.toString()) {
            const title = card.querySelector('[data-review]');
            if (title)
                void openReview(card.dataset.boardId, title);
        }
    });
    document.getElementById('review-retry-detail').addEventListener('click', () => { if (group)
        void openGroupItem();
    else
        void openReview(requestedId, undefined, requestedSection); });
    document.querySelectorAll('[data-close-review]').forEach(button => button.addEventListener('click', () => close()));
    document.getElementById('review-keep-editing').addEventListener('click', () => { discardWarning.hidden = true; if (window.sfStaffProgress?.hasDraft()) {
        selectTab('progress');
        window.sfStaffProgress.focusDraft();
    }
    else {
        selectTab(internalNote.value.trim() ? 'notes' : 'decision');
        (internalNote.value.trim() ? internalNote : note).focus();
    } });
    document.getElementById('review-discard-confirm').addEventListener('click', () => close(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left)
        close(); });
    const sourceWork = new URL(location.href).searchParams;
    const sourceWorkView = sourceWork.get('workView'), sourceWorkPage = sourceWork.get('workPage');
    if (sourceWorkView && ['mine', 'triage', 'all', 'overdue'].includes(sourceWorkView)) {
        dialog.querySelectorAll('[data-close-review]').forEach(button => button.setAttribute('aria-label', 'Close detail and return to Work tasks'));
        dialog.addEventListener('close', () => { const query = new URLSearchParams({ view: sourceWorkView, page: sourceWorkPage && /^\d{1,6}$/.test(sourceWorkPage) ? sourceWorkPage : '1' }); location.replace(sfSchoolPath('/admin/work?' + query.toString())); });
    }
    dialog.addEventListener('close', () => { if (isQueue || mode === 'work') {
        const url = new URL(location.href);
        url.searchParams.delete('idea');
        history.replaceState(history.state, '', url);
    } if (group) {
        const counts = { saved: 0, skipped: 0, already: 0, pending: 0 };
        for (const item of group.entries)
            counts[item.result]++;
        pageMessage.textContent = `Group review ended: ${counts.saved} moves saved, ${counts.skipped} skipped, ${counts.already} already in target stage, ${counts.pending} not moved. Saved changes remain; other selections are retained.`;
        group = null;
        paintGroup();
    } detailRequest?.abort(); activityRequest?.abort(); window.sfStaffProgress?.close(); if (returnFocus?.isConnected)
        returnFocus.focus();
    else
        document.querySelector('#staff-queue-title,.workspace-heading h1')?.focus(); });
    window.addEventListener('beforeunload', event => { if (dialog.open && (busy || noteBusy || window.sfStaffProgress?.isBusy() || hasUnsavedChanges())) {
        event.preventDefault();
        event.returnValue = '';
    } });
    status.addEventListener('change', () => { updateHint(); updateDraft(); });
    note.addEventListener('input', updateCount);
    [assignee, priority, targetDate, internalNote].forEach(input => input.addEventListener('input', updateDraft));
    targetDate.addEventListener('input', () => { targetDate.removeAttribute('aria-invalid'); document.getElementById('review-date-error').textContent = ''; });
    document.getElementById('review-assign-me').addEventListener('click', () => {
        if (Array.from(assignee.options).some(o => o.value === currentUser)) {
            assignee.value = currentUser;
            updateDraft();
        }
    });
    async function refreshCare() {
        const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null, scrollY = window.scrollY;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await sfSchoolFetch(window.location.href, { headers: { Accept: 'text/html' }, cache: 'no-store', signal: controller.signal });
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const ids = ['care-reminders', 'care-reports', 'care-clarification', 'care-merges'];
            if (!response.ok || ids.some(id => !doc.getElementById(id)))
                throw new Error('Community care could not refresh. Check your staff session.');
            // Preserve the actual form nodes (values, focus, and in-flight state), not
            // just serialized values. Never replace an unrelated care draft.
            const key = (form) => (form.closest('[data-care-row]')?.dataset.careRow || '') + ':' + form.dataset.careAction;
            const existing = new Map(Array.from(document.querySelectorAll('.community-care-page [data-care-action]')).map(form => [key(form), form]));
            for (const fresh of doc.querySelectorAll('[data-care-action]')) {
                const old = existing.get(key(fresh));
                if (old)
                    fresh.replaceWith(old);
            }
            for (const id of ids) {
                const old = document.getElementById(id), fresh = doc.getElementById(id);
                for (const row of old.querySelectorAll('[data-care-row]')) {
                    if (!fresh.querySelector(`[data-care-row="${row.dataset.careRow}"]`) && Array.from(row.querySelectorAll('input,textarea')).some(input => input.value !== input.defaultValue))
                        fresh.append(row);
                }
                old.replaceChildren(...Array.from(fresh.childNodes));
            }
            const nav = document.querySelector('.care-section-nav'), freshNav = doc.querySelector('.care-section-nav');
            if (nav && freshNav)
                nav.replaceChildren(...Array.from(freshNav.childNodes));
            const pager = document.querySelector('.care-pagination'), freshPager = doc.querySelector('.care-pagination');
            if (pager && freshPager)
                pager.replaceChildren(...Array.from(freshPager.childNodes));
            if (focused?.isConnected)
                focused.focus({ preventScroll: true });
            window.scrollTo({ top: scrollY });
        }
        finally {
            clearTimeout(timer);
        }
    }
    async function refreshQueue() {
        if (!isQueue) {
            if (document.getElementById('staff-board-data')) {
                if (!await window.sfStaffBoardRefresh?.())
                    throw new Error('Work board refresh failed.');
                return;
            }
            await refreshCare();
            return;
        }
        if (refreshing)
            throw new Error('A queue refresh is already running.');
        refreshing = true;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const refreshButton = document.getElementById('staff-refresh');
        refreshButton.disabled = true;
        const queue = document.querySelector('.staff-queue');
        queue.setAttribute('aria-busy', 'true');
        try {
            const listUrl = new URL(location.href);
            listUrl.searchParams.delete('idea');
            const response = await sfSchoolFetch(listUrl.href, { headers: { Accept: 'text/html' }, cache: 'no-store', signal: controller.signal });
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const data = doc.getElementById('staff-queue-data');
            if (!response.ok || !data)
                throw new Error('The queue could not be refreshed. Your staff session may have expired.');
            const fresh = JSON.parse(data.textContent || '[]');
            // Keep the delegated row container and current form drafts intact.
            document.querySelector('.staff-rows').replaceChildren(...Array.from(doc.querySelector('.staff-rows').children));
            for (const selector of ['.staff-metrics', '.staff-status-tabs', '.staff-pagination', '#staff-result-count', '#staff-pending-count', '#staff-saved-views']) {
                const target = document.querySelector(selector);
                const source = doc.querySelector(selector);
                if (target && source)
                    target.replaceChildren(...Array.from(source.childNodes));
            }
            items = fresh;
            document.getElementById('staff-queue-data').textContent = JSON.stringify(items);
            document.getElementById('staff-export').disabled = !items.length;
            const canonical = new URL(response.url);
            if (dialog.open && active)
                canonical.searchParams.set('idea', active.id);
            window.history.replaceState(history.state, '', canonical);
            pageMessage.textContent = 'Queue updated.';
            pageMessage.classList.add('is-success');
        }
        finally {
            clearTimeout(timer);
            refreshing = false;
            refreshButton.disabled = false;
            queue.removeAttribute('aria-busy');
        }
    }
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!active || busy || noteBusy || saved || window.sfStaffProgress?.isBusy())
            return;
        const moveNext = event.submitter === saveNext;
        if (moveNext && window.sfStaffProgress?.hasDraft()) {
            selectTab('progress');
            message.textContent = 'Post or clear your progress draft before moving to the next suggestion.';
            window.sfStaffProgress.focusDraft();
            return;
        }
        if (moveNext && internalNote.value.trim()) {
            selectTab('notes');
            internalMessage.textContent = 'Save or clear your private-note draft before moving to the next suggestion.';
            internalNote.focus();
            return;
        }
        selectTab('decision');
        if (!targetDate.validity.valid) {
            targetDate.setAttribute('aria-invalid', 'true');
            document.getElementById('review-date-error').textContent = 'Choose a valid date between 2000 and 2100.';
        }
        if (!form.reportValidity())
            return;
        if (/\[(explain the decision|provide a helpful option)\]/i.test(note.value)) {
            message.textContent = 'Replace the template placeholders with your actual decision and next step.';
            note.focus();
            return;
        }
        busy = true;
        discardWarning.hidden = true;
        fields.disabled = true;
        save.disabled = true;
        saveNext.disabled = true;
        save.textContent = 'Saving…';
        form.setAttribute('aria-busy', 'true');
        dialog.querySelectorAll('[data-close-review]').forEach(b => { b.disabled = true; });
        message.classList.remove('is-success');
        message.textContent = '';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const savedId = active.id;
        let nextId;
        const index = items.findIndex(i => i.id === active?.id);
        const candidates = [...items.slice(index + 1), ...items.slice(0, index)].map(i => i.id);
        try {
            const response = await sfSchoolFetch('/api/staff/submissions/' + encodeURIComponent(savedId) + '/review', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
                body: JSON.stringify({ status: status.value, note: note.value.trim(), assignee: assignee.value || null, priority: priority.value, targetDate: targetDate.value || null, updatedAt: active.updated_at })
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || body?.success !== true)
                throw new Error(response.status === 409 ? 'Someone changed this suggestion. Copy your draft, then refresh the queue before saving again.' : response.status === 401 || response.status === 403 ? 'Your staff session expired or access changed. Sign in again before retrying.' : response.status === 400 ? body?.error || 'Check your review values.' : 'The update was not saved. Try again; your draft is still here.');
            saved = true;
            reviewed.add(savedId);
            save.hidden = true;
            saveNext.hidden = true;
            document.getElementById('review-dismiss').textContent = 'Done';
            message.classList.add('is-success');
            message.textContent = 'Review saved. Updating this workspace…';
            updateDraft();
            void loadActivity();
            try {
                await refreshQueue();
                nextId = moveNext ? candidates.find(id => !reviewed.has(id) && items.some(i => i.id === id)) || items.find(i => i.id !== savedId && !reviewed.has(i.id))?.id : undefined;
                message.textContent = moveNext && !nextId ? 'Saved. You have reviewed every available suggestion on this page.' : 'Review saved. This workspace is up to date.';
            }
            catch {
                message.textContent = 'Review saved, but this workspace could not refresh. Your changes were saved; refresh the page to see the latest cards.';
            }
        }
        catch (error) {
            message.textContent = error instanceof Error && error.name !== 'AbortError' && !(error instanceof TypeError) ? error.message : 'We could not confirm the save. Your draft is still here. Refresh the queue before retrying.';
        }
        finally {
            clearTimeout(timer);
            busy = false;
            fields.disabled = saved;
            save.disabled = saved;
            saveNext.disabled = saved;
            save.textContent = 'Save planning';
            form.removeAttribute('aria-busy');
            dialog.querySelectorAll('[data-close-review]').forEach(b => { b.disabled = false; });
            if (nextId)
                openReview(nextId);
            else {
                if (saved)
                    void window.sfStaffProgress?.refresh();
                message.focus();
            }
        }
    });
    async function request(url, method, payload) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await sfSchoolFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: controller.signal });
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
        document.getElementById('review-notes-state').textContent = 'Loading private notes…';
        try {
            const response = await sfSchoolFetch('/api/staff/submissions/' + encodeURIComponent(active.id) + '/activity', { signal: controller.signal });
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
                history.append(sfEmptyState({ compact: true, icon: 'clock', heading: 'No review changes yet', description: 'Saved assignments and review decisions will create a record here.' }));
            if (!data.notes?.length)
                notes.append(sfEmptyState({ compact: true, icon: 'message', heading: 'A space for staff context', description: 'Add a private note above to help other staff. These notes never appear in the community feed.' }));
            activityMessage.textContent = '';
            document.getElementById('review-notes-state').textContent = '';
        }
        catch (error) {
            if (activityRequest === controller && dialog.open) {
                activityMessage.textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'History request timed out. Refresh to retry.';
                document.getElementById('review-notes-state').textContent = 'Private notes could not load. Open History and choose Refresh to retry.';
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    document.getElementById('review-retry-activity').addEventListener('click', () => void loadActivity());
    internalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!active || busy || noteBusy || window.sfStaffProgress?.isBusy() || !internalForm.reportValidity())
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
            updateDraft();
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
    window.sfStaffProgress?.bind({
        canPost: () => !busy && !noteBusy && !hasReviewDraft() && !hasRepairDraft(),
        applySnapshot(submission) {
            if (!active || active.id !== submission.id || busy)
                return false;
            if (hasReviewDraft())
                return active.updated_at === submission.updated_at;
            const normalized = { ...submission, staff_note: submission.staff_note || '', assignee_id: submission.assignee_id || '', priority: submission.priority || 'normal', target_date: submission.target_date || '' };
            const previousStatus = active.status;
            Object.assign(active, normalized);
            if (mode === 'review' && previousStatus === 'pending' && ['approved', 'rejected'].includes(normalized.status))
                decisionSaved = true;
            const queued = items.find(item => item.id === submission.id);
            if (queued)
                Object.assign(queued, normalized);
            status.value = active.status;
            note.value = active.staff_note;
            priority.value = active.priority;
            targetDate.value = active.target_date;
            if (active.assignee_id && !Array.from(assignee.options).some(option => option.value === active.assignee_id)) {
                const option = new Option('Former staff — choose an active assignee', active.assignee_id);
                option.dataset.formerStaff = 'true';
                assignee.add(option);
            }
            assignee.value = active.assignee_id;
            paintWorkFacts(active);
            paintWorkflow(active.workflow);
            const badge = document.getElementById('review-current-status');
            badge.textContent = labels[active.status] || active.status;
            badge.dataset.status = active.status;
            saved = false;
            const posting = window.sfStaffProgress?.isBusy() || false;
            fields.disabled = posting;
            save.disabled = posting;
            saveNext.disabled = posting;
            const onProgress = dialog.querySelector('[data-review-tab="progress"]')?.getAttribute('aria-selected') === 'true';
            save.hidden = onProgress;
            saveNext.hidden = !isQueue || !items.some(i => i.id === active?.id) || onProgress;
            document.getElementById('review-dismiss').textContent = 'Close';
            updateHint();
            updateCount();
            return true;
        },
        confirmed(submission) {
            if (group) {
                const entry = group.entries[group.index];
                if (entry.id === submission.id) {
                    entry.result = submission.status === group.stage ? 'saved' : 'pending';
                    group.notice = entry.result === 'saved' ? 'Move saved. Continue to the next idea when ready.' : 'Update saved, but this idea has not reached the selected stage.';
                    if (entry.result === 'saved')
                        document.dispatchEvent(new CustomEvent('sf:board-group-saved', { detail: { id: entry.id } }));
                    paintGroup();
                }
            }
        },
        async afterPost() {
            try {
                await refreshQueue();
                void loadActivity();
            }
            finally {
                if (mode === 'review' && decisionSaved && active) {
                    resultPanel.hidden = false;
                    document.getElementById('review-decision-label').textContent = active.status === 'approved' ? 'Approved · Added to Planned' : 'Declined · Decision recorded';
                    openWork.hidden = active.status !== 'approved';
                    openWork.href = sfSchoolPath('/admin/work?presentation=board&idea=' + encodeURIComponent(active.id));
                    const next = document.getElementById('review-next-idea');
                    next.disabled = false;
                    selectTab('decision');
                    const tab = dialog.querySelector('[data-review-tab="progress"]');
                    if (tab)
                        tab.hidden = true;
                }
            }
        },
        changed() { updateDraft(); paintGroup(); },
        posting(value) {
            fields.disabled = value || saved;
            save.disabled = value || saved;
            saveNext.disabled = value || saved;
            document.getElementById('review-add-note').disabled = value;
            dialog.querySelectorAll('[data-close-review]').forEach(button => { button.disabled = value; });
            updateDraft();
            paintGroup();
        }
    });
    document.getElementById('review-next-idea')?.addEventListener('click', () => { const next = items.find(item => item.status === 'pending' && item.id !== active?.id); if (next)
        void openReview(next.id);
    else
        window.location.assign(sfSchoolPath('/admin/reviews')); });
    const initial = new URL(window.location.href).searchParams.get('idea');
    if (initial && ['/admin', '/admin/reviews', '/admin/work'].includes(sfSchoolRoute(window.location.pathname)))
        void openReview(initial);
    if (!isQueue)
        return;
    const viewDialog = document.getElementById('staff-save-view-dialog');
    const viewMessage = document.getElementById('staff-view-message');
    document.getElementById('staff-open-save-view').addEventListener('click', () => { viewMessage.textContent = ''; viewDialog.showModal(); });
    document.getElementById('staff-close-save-view').addEventListener('click', () => viewDialog.close());
    viewDialog.addEventListener('close', () => document.getElementById('staff-open-save-view').focus());
    document.getElementById('staff-save-view').addEventListener('submit', async (event) => {
        event.preventDefault();
        const viewForm = event.currentTarget;
        if (!viewForm.reportValidity())
            return;
        const button = viewForm.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            await request('/api/staff/views', 'POST', { name: document.getElementById('staff-view-name').value, filters: JSON.parse(document.getElementById('staff-filter-data').textContent || '{}') });
            viewDialog.close();
            try {
                await refreshQueue();
            }
            catch {
                pageMessage.textContent = 'View saved. Use Refresh to update your sidebar.';
            }
        }
        catch (error) {
            viewMessage.textContent = error instanceof Error ? error.message : 'Could not save view.';
        }
        finally {
            button.disabled = false;
        }
    });
    document.getElementById('staff-saved-views').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-delete-view]');
        if (!button)
            return;
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
            pageMessage.classList.remove('is-success');
            pageMessage.textContent = 'Could not remove the saved view. Try again.';
            button.disabled = false;
        }
    });
    document.getElementById('staff-refresh').addEventListener('click', async () => {
        try {
            await refreshQueue();
        }
        catch {
            pageMessage.classList.remove('is-success');
            pageMessage.textContent = 'The queue could not refresh. Check your connection and staff session, then try again.';
        }
    });
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
