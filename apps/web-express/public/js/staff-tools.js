"use strict";
(() => {
    const boardData = document.getElementById('staff-board-data');
    const queueData = document.getElementById('staff-queue-data');
    if (!boardData && !queueData && !document.querySelector('.community-care-page'))
        return;
    const message = document.getElementById('staff-tools-message') || document.getElementById('staff-page-message');
    const tell = (text) => { if (message)
        message.textContent = text; };
    let busy = false, dragging = null;
    async function save(url, data, method = 'POST') {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, { method, signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
            const payload = await response.json();
            if (!response.ok || !payload.success)
                throw new Error(payload.error || 'Change not saved. Refresh and try again.');
            return payload;
        }
        finally {
            clearTimeout(timer);
        }
    }
    if (boardData) {
        const board = document.getElementById('staff-flow-board');
        const metaData = document.getElementById('staff-board-meta');
        let meta = JSON.parse(metaData.textContent || '{}');
        let items = new Map(JSON.parse(boardData.textContent || '[]').map(item => [item.id, item]));
        const selected = new Map();
        const labels = Object.fromEntries(meta.lanes.map(lane => [lane.status, lane.label]));
        const retry = document.getElementById('staff-board-retry');
        let loading = false, failedPage = null;
        const urlFor = (stage, page) => {
            const url = new URL('/admin/board', window.location.origin);
            url.searchParams.set('sort', meta.filters.sort);
            url.searchParams.set('pageSize', String(meta.filters.pageSize));
            if (meta.filters.search)
                url.searchParams.set('search', meta.filters.search);
            for (const [key, number] of Object.entries(meta.filters.pages)) {
                const value = key === stage ? page : number;
                if (value && value > 1)
                    url.searchParams.set(key + 'Page', String(value));
            }
            if (stage)
                url.hash = 'board-lane-' + stage;
            return url;
        };
        const controls = () => {
            const locked = busy || loading;
            document.querySelectorAll('.staff-flow-board input,.staff-flow-board select,.staff-flow-board button,#staff-bulk-assign,#staff-bulk-assignee,#staff-clear-selection,#staff-board-filters input,#staff-board-filters select,#staff-board-filters button').forEach(el => { el.disabled = locked; });
            board.querySelectorAll('[data-board-page]').forEach(link => { link.setAttribute('aria-disabled', String(locked)); link.tabIndex = locked ? -1 : 0; });
            retry.disabled = locked;
        };
        function selectionState() {
            let visible = 0;
            board.querySelectorAll('[data-bulk-id]').forEach(input => { input.checked = selected.has(input.dataset.bulkId); if (input.checked)
                visible++; });
            document.getElementById('staff-selection-tools').hidden = !selected.size;
            document.querySelector('.staff-board-main')?.classList.toggle('is-selecting', selected.size > 0);
            document.getElementById('staff-selection-count').textContent = `${selected.size} selected${selected.size > visible ? ' · ' + (selected.size - visible) + ' on other pages' : ''} · maximum 25`;
        }
        async function navigate(stage, rawUrl, push = true, internal = false) {
            if (loading || (busy && !internal))
                return false;
            const target = new URL(rawUrl, window.location.origin);
            if (target.origin !== window.location.origin || target.pathname !== '/admin/board')
                return false;
            loading = true;
            failedPage = null;
            retry.hidden = true;
            controls();
            tell(stage ? `Loading ${labels[stage]} page…` : 'Refreshing the work board…');
            const ownLane = stage ? board.querySelector(`[data-drop-stage="${stage}"]`) : board;
            ownLane?.setAttribute('aria-busy', 'true');
            const request = new AbortController(), timer = setTimeout(() => request.abort(), 15000);
            try {
                const response = await fetch(target.pathname + target.search, { headers: { Accept: 'text/html' }, cache: 'no-store', signal: request.signal });
                if (!response.ok)
                    throw new Error(response.status === 401 || response.status === 403 ? 'Sign in again to continue using the staff board.' : 'The page could not load. Your current cards and selection are unchanged.');
                const fresh = new DOMParser().parseFromString(await response.text(), 'text/html');
                const freshData = fresh.getElementById('staff-board-data'), freshMeta = fresh.getElementById('staff-board-meta');
                if (!freshData || !freshMeta)
                    throw new Error('Your staff session may have expired. Sign in again; your current board has not been replaced.');
                const snapshot = JSON.parse(freshMeta.textContent || '{}');
                const nextItems = JSON.parse(freshData.textContent || '[]');
                const replacementStages = Object.keys(labels).filter(key => !stage || key === stage || snapshot.filters.pages[key] !== meta.filters.pages[key]);
                // Validate every replacement before touching the existing board. A failed
                // response cannot partially erase cards or silently discard bulk selection.
                for (const key of Object.keys(labels))
                    if (!fresh.querySelector(`[data-drop-stage="${key}"]`))
                        throw new Error('The page was incomplete. Retry loading; your current cards are still here.');
                for (const key of Object.keys(labels)) {
                    const oldLane = board.querySelector(`[data-drop-stage="${key}"]`), newLane = fresh.querySelector(`[data-drop-stage="${key}"]`);
                    if (replacementStages.includes(key)) {
                        const oldScroll = oldLane?.querySelector('.staff-lane-cards')?.scrollTop || 0;
                        oldLane?.replaceWith(newLane);
                        const scroll = newLane.querySelector('.staff-lane-cards');
                        if (scroll)
                            scroll.scrollTop = key === stage ? 0 : oldScroll;
                    }
                    else {
                        for (const selector of ['.staff-lane-heading', '.staff-lane-pagination']) {
                            const old = oldLane?.querySelector(selector), current = newLane.querySelector(selector);
                            if (old && current)
                                old.replaceChildren(...Array.from(current.childNodes));
                        }
                    }
                }
                const changedStages = new Set(replacementStages);
                items = new Map([...Array.from(items.values()).filter(item => !changedStages.has(item.status)), ...nextItems.filter(item => changedStages.has(item.status))].map(item => [item.id, item]));
                meta = snapshot;
                boardData.textContent = JSON.stringify(Array.from(items.values()));
                metaData.textContent = JSON.stringify(meta);
                document.getElementById('staff-board-summary').textContent = `${items.size} shown · ${meta.totalCount.toLocaleString()} matching submissions`;
                selectionState();
                const canonical = urlFor(stage, stage ? meta.filters.pages[stage] : undefined);
                if (push)
                    window.history.pushState(null, '', canonical.href);
                else
                    window.history.replaceState(null, '', canonical.href);
                if (stage) {
                    const heading = board.querySelector(`#board-title-${stage}`);
                    heading?.focus({ preventScroll: true });
                    const lane = meta.lanes.find(l => l.status === stage);
                    tell(`${lane.label}: ${lane.from}–${lane.to} of ${lane.count}. Page ${lane.page} of ${lane.pageCount}. Selection retained.`);
                }
                else
                    tell('Work board refreshed.');
                return true;
            }
            catch (e) {
                failedPage = { stage, url: target.href, push };
                retry.hidden = false;
                tell(e.name === 'AbortError' ? 'Loading timed out. Your current cards and selection are unchanged. Retry loading.' : e.message);
                return false;
            }
            finally {
                clearTimeout(timer);
                ownLane?.removeAttribute('aria-busy');
                loading = false;
                controls();
            }
        }
        async function move(id, stage) {
            const item = items.get(id);
            if (!item || item.status === stage || busy || loading)
                return;
            const action = stage === 'in_progress' ? (item.status === 'resolved' ? 'reopen' : 'start') : stage === 'resolved' ? 'complete' : stage === 'approved' && item.status === 'pending' ? 'approve' : stage === 'rejected' ? (item.status === 'pending' ? 'decline' : 'withdraw') : null;
            const select = board.querySelector(`[data-stage-select="${id}"]`);
            if (select)
                select.value = item.status;
            if (!action) {
                tell('Use Review submissions for review decisions. Work moves forward through guided actions.');
                return;
            }
            document.dispatchEvent(new CustomEvent('sf:review-action', { detail: { id, action, trigger: board.querySelector(`[data-review="${id}"]`) } }));
        }
        board.addEventListener('click', e => {
            const link = e.target.closest('[data-board-page]');
            if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                return;
            e.preventDefault();
            if (busy || loading)
                return;
            const stage = link.dataset.boardPage;
            if (!labels[stage])
                return;
            const page = Number(new URL(link.href).searchParams.get(stage + 'Page') || 1);
            void navigate(stage, urlFor(stage, page).href);
        });
        board.addEventListener('submit', e => { const form = e.target.closest('[data-board-jump]'); if (!form)
            return; e.preventDefault(); if (busy || loading || !form.reportValidity())
            return; const stage = form.dataset.boardJump; if (!labels[stage])
            return; const input = form.querySelector('.staff-page-input'); void navigate(stage, urlFor(stage, Number(input.value)).href); });
        board.addEventListener('change', e => {
            const input = e.target;
            if (input.matches('[data-bulk-id]')) {
                if (busy || loading) {
                    input.checked = selected.has(input.dataset.bulkId);
                    return;
                }
                const id = input.dataset.bulkId, item = items.get(id);
                if (!item)
                    return;
                if (input.checked && !selected.has(id) && selected.size >= 25) {
                    input.checked = false;
                    tell('Select no more than 25 ideas for one assignment.');
                    return;
                }
                if (input.checked)
                    selected.set(id, { ...item });
                else
                    selected.delete(id);
                selectionState();
            }
            else if (input.matches('[data-stage-select]'))
                void move(input.dataset.stageSelect, input.value);
        });
        board.addEventListener('dragstart', e => { const card = e.target.closest('[data-board-id]'); if (!card)
            return; if (busy || loading || e.target.closest('input,select,a,button,summary')) {
            e.preventDefault();
            return;
        } card.dataset.dragging = 'true'; dragging = card.dataset.boardId; e.dataTransfer?.setData('text/plain', dragging); });
        board.addEventListener('dragend', () => { board.querySelectorAll('[data-dragging]').forEach(card => { delete card.dataset.dragging; card.dataset.draggedAt = String(Date.now()); }); dragging = null; board.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target')); });
        board.addEventListener('dragover', e => { const lane = e.target.closest('[data-drop-stage]'); if (lane && dragging && !busy && !loading) {
            e.preventDefault();
            lane.classList.add('is-drop-target');
        } });
        board.addEventListener('dragleave', e => { const lane = e.target.closest('[data-drop-stage]'); if (lane && !lane.contains(e.relatedTarget))
            lane.classList.remove('is-drop-target'); });
        board.addEventListener('drop', e => { const lane = e.target.closest('[data-drop-stage]'); if (!lane)
            return; e.preventDefault(); lane.classList.remove('is-drop-target'); if (dragging)
            void move(dragging, lane.dataset.dropStage); dragging = null; });
        retry.addEventListener('click', () => { if (failedPage)
            void navigate(failedPage.stage, failedPage.url, failedPage.push); });
        document.getElementById('staff-clear-selection')?.addEventListener('click', () => { if (busy || loading)
            return; selected.clear(); selectionState(); tell('Selection cleared.'); });
        document.getElementById('staff-bulk-assign')?.addEventListener('click', async () => {
            if (busy || loading)
                return;
            if (!selected.size) {
                tell('Select at least one idea.');
                return;
            }
            const assignee = document.getElementById('staff-bulk-assignee');
            const assignment = { assigneeId: assignee.value || null, items: Array.from(selected.values()).map(x => ({ id: x.id, updatedAt: x.updated_at })) };
            if (!await window.sfConfirm(`Assign ${selected.size} selected ideas, including selections on other pages, to ${assignee.selectedOptions[0].textContent}? No statuses or public responses will change. If any selected idea changed, nothing is saved.`))
                return;
            if (busy || loading || assignment.assigneeId !== (assignee.value || null) || JSON.stringify(assignment.items) !== JSON.stringify(Array.from(selected.values()).map(x => ({ id: x.id, updatedAt: x.updated_at }))))
                return;
            busy = true;
            controls();
            tell('Saving assignments…');
            try {
                await save('/api/community/staff/bulk_assign', assignment);
                selected.clear();
                selectionState();
                if (!await navigate(null, urlFor(null).href, false, true))
                    tell('Assignments saved, but the board could not refresh. Retry loading.');
            }
            catch (e) {
                tell(e.name === 'AbortError' ? 'Request timed out. Refresh to confirm assignments before retrying.' : e.message);
            }
            finally {
                busy = false;
                controls();
            }
        });
        let filterConfirmed = false, confirmingFilter = false;
        document.getElementById('staff-board-filters')?.addEventListener('submit', async (e) => {
            if (busy || loading) {
                e.preventDefault();
                return;
            }
            if (filterConfirmed) {
                filterConfirmed = false;
                return;
            }
            if (!selected.size)
                return;
            e.preventDefault();
            if (confirmingFilter)
                return;
            confirmingFilter = true;
            try {
                if (!await window.sfConfirm('Changing the search, order or page size clears your selection. Continue?'))
                    return;
                if (busy || loading)
                    return;
                filterConfirmed = true;
                const form = e.target, submitter = e.submitter;
                if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement)
                    form.requestSubmit(submitter);
                else
                    form.requestSubmit();
                filterConfirmed = false;
            }
            finally {
                confirmingFilter = false;
            }
        });
        document.querySelector('[data-board-reset]')?.addEventListener('click', async (e) => {
            if (busy || loading) {
                e.preventDefault();
                return;
            }
            if (!selected.size)
                return;
            e.preventDefault();
            if (confirmingFilter)
                return;
            confirmingFilter = true;
            const href = e.currentTarget.href;
            try {
                if (await window.sfConfirm('Reset filters and clear your selection?') && !busy && !loading)
                    window.location.assign(href);
            }
            finally {
                confirmingFilter = false;
            }
        });
        window.addEventListener('popstate', () => { if (busy || loading) {
            window.history.pushState(null, '', urlFor(null).href);
            tell('Wait for the current request before changing pages.');
            return;
        } void navigate(null, window.location.href, false); });
        selectionState();
        window.sfStaffBoardRefresh = () => navigate(null, urlFor(null).href, false);
    }
    document.getElementById('staff-response-template')?.addEventListener('change', async (e) => {
        const select = e.target, note = document.getElementById('review-note');
        if (!select.value || !note)
            return;
        const templates = { planned: 'Thank you for raising this idea. We have approved it for planning. We will publish an update when the next step is confirmed.', clarify: 'Thank you for your feedback. We need more detail before making a decision. Please check your private School messages for our question.', declined: 'Thank you for this suggestion. We are unable to proceed at this time. Reason: [explain the decision]. Alternative or next step: [provide a helpful option].' };
        const priorText = note.value, template = select.value;
        if (note.value && !await window.sfConfirm('Replace the current draft response with this template?')) {
            select.value = '';
            return;
        }
        if (note.value !== priorText || select.value !== template)
            return;
        note.value = templates[template] || '';
        note.dispatchEvent(new Event('input', { bubbles: true }));
        note.focus();
        select.value = '';
    });
    document.addEventListener('keydown', e => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]'))
            return;
        if (e.key === '/') {
            const search = document.querySelector('.staff-search-form input[type=search]');
            if (search) {
                e.preventDefault();
                search.focus();
            }
        }
        if (e.key === 'j' || e.key === 'k') {
            const buttons = Array.from(document.querySelectorAll('.staff-review-button'));
            const current = buttons.indexOf(document.activeElement);
            const next = e.key === 'j' ? current + 1 : current - 1;
            if (buttons.length) {
                e.preventDefault();
                buttons[Math.max(0, Math.min(buttons.length - 1, next))].focus();
            }
        }
    });
})();
