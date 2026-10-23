"use strict";
(() => {
    const host = document.querySelector('[data-studio]');
    if (!host)
        return;
    const base = host.dataset.base, initial = JSON.parse(document.getElementById('studio-initial').textContent || '{}');
    const api = window.sfSchoolStudioModel, model = api.create({ configuration: initial.configuration, serverRevision: initial.revision });
    const frame = document.getElementById('studio-frame'), board = document.getElementById('studio-board'), space = document.getElementById('studio-board-space'), canvas = document.getElementById('studio-canvas-scroll'), loading = document.getElementById('studio-frame-loading');
    const page = document.getElementById('studio-page'), scenario = document.getElementById('studio-scenario'), theme = document.getElementById('studio-theme'), width = document.getElementById('studio-width'), zoom = document.getElementById('studio-zoom');
    if (innerWidth >= 1024)
        width.value = '1440';
    const preferences = new URLSearchParams(location.search);
    if (['320', '375', '768', '1440'].includes(preferences.get('width') || ''))
        width.value = preferences.get('width');
    if (['light', 'dark'].includes(preferences.get('theme') || ''))
        theme.value = preferences.get('theme');
    const search = document.getElementById('studio-search'), tree = document.getElementById('studio-tree'), status = document.getElementById('studio-status');
    let presentComponents = null;
    let uploading = false;
    let instance = '', sequence = 0, incoming = 0, ready = false, busy = false, allowed = true, mode = new URLSearchParams(location.search).get('mode') === 'preview' ? 'preview' : 'edit', view = '', renderTimer, renderController = null, renderVersion = 0, renderedKey = '', lastConfiguration = JSON.stringify(model.getState().configuration), lastSelection = '', changes = initial.changes || [], latest = null, returnFocus = null;
    const controls = window.sfSchoolStudioControls.mount(host, { endGroup: () => model.endGroup(), beginGroup: () => model.beginGroup() });
    const pill = document.getElementById('studio-save-state');
    const say = (text, error = false) => { status.textContent = text; status.parentElement.dataset.error = String(error); pill.dataset.state = error ? 'error' : model.getState().dirty ? 'dirty' : 'saved'; pill.textContent = error ? 'Needs attention' : text.startsWith('Saving') ? 'Saving…' : text.startsWith('Uploading') ? 'Uploading…' : text.startsWith('Published') ? 'Published' : model.getState().dirty ? 'Unsaved changes' : 'Draft saved'; };
    function syncActions() { const state = model.getState(), blocked = busy || !allowed || uploading; const saveButton = document.getElementById('studio-save'), reviewButton = document.getElementById('studio-review'), publishButton = document.getElementById('studio-publish'); saveButton.disabled = blocked || !state.dirty; reviewButton.disabled = blocked || state.dirty; const reason = !allowed ? 'Editor access is unavailable.' : uploading ? 'Wait for the image upload to finish.' : busy ? 'Your change is being processed.' : state.dirty ? 'Save your draft before reviewing publication.' : 'Review saved changes before publishing.'; reviewButton.title = reason; document.getElementById('studio-review-help').textContent = reason; saveButton.title = state.dirty ? 'Save privately · Ctrl/⌘ S' : 'Your draft is saved'; publishButton.disabled = blocked || state.dirty || !document.getElementById('studio-publish-confirm').checked; document.getElementById('studio-request-review').disabled = blocked || state.dirty; controls.schedule(); }
    async function confirmChange(message, label) { controls.close(); const dialog = document.createElement('dialog'); dialog.className = 'studio-dialog'; const title = document.createElement('h2'), heading = document.createElement('header'), body = document.createElement('p'), actions = document.createElement('div'), cancel = document.createElement('button'), confirm = document.createElement('button'); title.id = 'studio-confirm-title'; title.textContent = 'Reset workspace settings?'; heading.append(title); dialog.setAttribute('aria-labelledby', title.id); body.textContent = message; actions.className = 'studio-dialog-actions'; cancel.type = confirm.type = 'button'; cancel.textContent = 'Cancel'; confirm.textContent = label; confirm.className = 'studio-primary'; actions.append(cancel, confirm); dialog.append(heading, body, actions); document.body.append(dialog); return new Promise(resolve => { cancel.addEventListener('click', () => dialog.close('cancel')); confirm.addEventListener('click', () => dialog.close('confirm')); dialog.addEventListener('close', () => { resolve(dialog.returnValue === 'confirm'); dialog.remove(); }, { once: true }); dialog.showModal(); cancel.focus(); }); }
    function revoked(message) { allowed = false; controls.close(); renderController?.abort(); clearTimeout(renderTimer); for (const control of host.querySelectorAll('input,select,textarea,button'))
        control.disabled = true; document.getElementById('studio-copy')?.removeAttribute('disabled'); say(message + ' Your unsaved changes remain in memory. Copy them before leaving.', true); const dialog = document.getElementById('studio-conflict-dialog'); document.getElementById('studio-conflict-sections').textContent = 'Workspace access changed. Further saves and previews are blocked.'; const load = document.getElementById('studio-load-latest'); load.disabled = true; if (!dialog.open)
        dialog.showModal(); }
    async function request(action, body) { const response = await fetch(base + '/' + action, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); if ([401, 403].includes(response.status) || response.redirected) {
        revoked('Your editor access changed.');
        throw Object.assign(new Error('Editor access is no longer available.'), { status: response.status });
    } let result; try {
        result = await response.json();
    }
    catch {
        throw new Error('The request could not finish. Your edits are still here.');
    } if (!response.ok || !result.success) {
        if ([401, 403].includes(response.status) || result.code === 'STUDIO_DISABLED')
            revoked(result.error || 'Your editor access changed.');
        const error = new Error(result.error || 'This change could not be confirmed.');
        Object.assign(error, { status: response.status, code: result.code });
        throw error;
    } return result; }
    const inspector = window.sfSchoolStudioInspector.mount(document.getElementById('studio-inspector'), model, { ...initial, base, controls, confirm: confirmChange, select: (id) => select(id), say, request, uploading: (value) => { uploading = value; syncActions(); } });
    const registry = () => api.registry(model.getState().configuration, page.value);
    function find(id) { return registry().find((n) => n.id === id) || Object.keys(SfSchoolDesign.pages).flatMap(p => api.registry(model.getState().configuration, p)).find((n) => n.id === id); }
    function send(type, payload = {}) { if (ready && frame.contentWindow)
        frame.contentWindow.postMessage({ protocol: 1, instanceId: instance, sequence: ++sequence, type, payload }, location.origin); }
    function layout() { const viewport = Number(width.value), padding = getComputedStyle(canvas), available = Math.max(220, canvas.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight)); const scale = zoom.value === 'fit' ? Math.min(1, available / viewport) : Number(zoom.value); const height = Math.max(740, (canvas.clientHeight - 40) / scale); frame.style.width = viewport + 'px'; frame.style.height = height + 'px'; board.style.width = viewport + 'px'; board.style.height = height + 'px'; board.style.transform = 'scale(' + scale + ')'; space.style.width = viewport * scale + 'px'; space.style.height = height * scale + 'px'; document.getElementById('studio-canvas-title').textContent = page.selectedOptions[0].text + ' · ' + viewport + ' px'; }
    function openPanel(panel, opener) { controls.close(); if (innerWidth < 1024) {
        returnFocus = opener || document.activeElement;
        host.dataset.sheet = panel;
        const target = document.getElementById('studio-' + panel);
        target.setAttribute('role', 'dialog');
        target.setAttribute('aria-modal', 'true');
        document.getElementById('studio-sheet-backdrop').hidden = false;
        target.querySelector('button,input,select,textarea')?.focus();
    }
    else {
        host.dataset[panel + 'Collapsed'] = 'false';
        if (innerWidth < 1280)
            host.dataset[(panel === 'pages' ? 'properties' : 'pages') + 'Collapsed'] = 'true';
        layout();
    } }
    function closePanel(panel) { controls.close(); if (host.dataset.sheet) {
        const name = host.dataset.sheet;
        delete host.dataset.sheet;
        const target = document.getElementById('studio-' + name);
        target.removeAttribute('role');
        target.removeAttribute('aria-modal');
        document.getElementById('studio-sheet-backdrop').hidden = true;
        const fallback = host.querySelector('[data-open-panel="' + name + '"]');
        if (returnFocus?.getClientRects().length)
            returnFocus.focus();
        else
            fallback?.focus();
    }
    else if (panel) {
        host.dataset[panel + 'Collapsed'] = 'true';
        layout();
    } }
    function drawTree() { const query = search.value.toLowerCase(); tree.replaceChildren(); let group = ''; for (const n of registry().filter((n) => n.label.toLowerCase().includes(query))) {
        const scope = n.group === 'workspace' ? 'Workspace · all screens' : 'This screen';
        if (scope !== group) {
            const heading = document.createElement('h3');
            heading.textContent = scope;
            heading.className = 'studio-tree-group';
            tree.append(heading);
            group = scope;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = n.label;
        button.dataset.component = n.id;
        button.setAttribute('aria-pressed', String(model.getState().selection?.componentId === n.id));
        const absent = (n.id.startsWith('section.') || n.id.startsWith('page.')) && presentComponents && !presentComponents.has(n.id);
        button.disabled = !allowed || !!absent;
        if (absent) {
            button.title = 'Not present in this screen, viewport or example.';
            button.textContent += ' · unavailable';
        }
        button.addEventListener('click', () => { select(n.id); if (innerWidth < 1024)
            closePanel(); });
        tree.append(button);
    } if (!tree.children.length) {
        const p = document.createElement('p');
        p.textContent = 'No matching components.';
        tree.append(p);
    } }
    function select(id, fromFrame = false) {
        if (!allowed)
            return;
        if (!id)
            id = 'school.theme';
        const component = find(id);
        if (!component)
            return;
        if (component.pages.length && !component.pages.includes(page.value)) {
            page.value = component.pages[0];
            navigate(false);
        }
        model.select({ componentId: id });
        document.getElementById('studio-selection-title').textContent = component.label;
        document.getElementById('studio-breadcrumb').textContent = page.selectedOptions[0].text + ' / ' + component.group;
        document.getElementById('studio-mobile-selection').textContent = component.label;
        inspector.render();
        if (innerWidth >= 1024)
            openPanel('properties');
        controls.refresh();
        send('select', { componentId: id, scroll: !fromFrame });
    }
    const structure = (p) => JSON.stringify({ categories: p.categories.map((c) => [c.id, c.active, c.icon, c.description]), questions: p.form.questions.map((q) => [q.id, q.type, q.required, q.options, !!q.help]), attachments: p.form.attachments, links: p.welcome.links.length, identity: !!(p.displayName || p.logo), message: !!p.welcome.message, help: !!p.welcome.help, instructions: !!p.form.instructions, example: !!p.form.example, logo: p.logo, cover: p.cover, roadmap: p.features.roadmap, roadmapView: p.design?.pages.roadmap?.view, labels: p.labels, stageDescriptions: p.stageDescriptions });
    async function render() {
        if (!ready || !allowed)
            return;
        const version = ++renderVersion;
        renderController?.abort();
        renderController = new AbortController();
        const configuration = structuredClone(model.getState().configuration), key = structure(configuration), requestPage = page.value, requestInstance = instance;
        try {
            const response = await fetch(base + '/preview/render', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: renderController.signal, body: JSON.stringify({ configuration, page: requestPage, scenario: scenario.value, theme: theme.value, view: page.value === 'roadmap' ? (view || configuration.design?.pages.roadmap?.view || 'board') : 'board' }) });
            if ([401, 403].includes(response.status) || response.redirected) {
                revoked('Your editor access changed.');
                return;
            }
            const data = await response.json();
            if (version !== renderVersion || instance !== requestInstance)
                return;
            if (!response.ok || !data.success) {
                if ([401, 403].includes(response.status) || data.code === 'STUDIO_DISABLED')
                    revoked(data.error || 'Editor access changed.');
                throw new Error(data.error || 'Complete the property fields to refresh the preview.');
            }
            renderedKey = key;
            send('replace-fragment', { html: data.html, configuration: model.getState().configuration, renderedConfiguration: configuration });
            loading.hidden = true;
        }
        catch (error) {
            if (error.name !== 'AbortError')
                say(error instanceof Error ? error.message : 'Preview unavailable. Your changes remain here.', true);
        }
    }
    function navigate(resetSelection = true) { if (!allowed)
        return; controls.close(); controls.schedule(); presentComponents = null; ready = false; incoming = 0; sequence = 0; instance = crypto.randomUUID(); renderVersion++; renderController?.abort(); clearTimeout(renderTimer); loading.hidden = false; frame.src = base + '/preview/content?' + new URLSearchParams({ page: page.value, scenario: scenario.value, theme: theme.value, view: view || model.getState().configuration.design?.pages.roadmap?.view || 'board', instance }); if (resetSelection) {
        model.setPage(page.value);
        document.getElementById('studio-selection-title').textContent = 'Select a component';
        document.getElementById('studio-breadcrumb').textContent = page.selectedOptions[0].text;
        inspector.render();
    } drawTree(); layout(); }
    let pendingPatch = false;
    model.subscribe((state) => {
        document.getElementById('studio-undo').toggleAttribute('disabled', !state.canUndo || !allowed);
        document.getElementById('studio-redo').toggleAttribute('disabled', !state.canRedo || !allowed);
        document.getElementById('studio-revision').textContent = 'Revision ' + state.serverRevision;
        const json = JSON.stringify(state.configuration);
        if (json !== lastConfiguration) {
            lastConfiguration = json;
            drawTree();
            if (!pendingPatch) {
                pendingPatch = true;
                requestAnimationFrame(() => { pendingPatch = false; send('patch', { configuration: model.getState().configuration }); });
            }
            clearTimeout(renderTimer);
            if (structure(state.configuration) !== renderedKey)
                renderTimer = setTimeout(() => void render(), 250);
            say(state.dirty ? 'Unsaved changes · save privately before publishing.' : 'Draft saved · preview matches the saved configuration.');
        }
        syncActions();
        if (state.selection?.componentId !== lastSelection) {
            lastSelection = state.selection?.componentId || '';
            drawTree();
        }
    });
    async function showConflict() { say('A newer draft is available. Your edits are preserved; compare before loading.', true); try {
        latest = await request('state');
        const list = document.getElementById('studio-conflict-sections');
        list.replaceChildren();
        for (const key of ['displayName', 'palette', 'logo', 'cover', 'welcome', 'categories', 'features', 'form', 'labels', 'stageDescriptions', 'email', 'design'])
            if (JSON.stringify(model.getState().configuration[key]) !== JSON.stringify(latest.draft[key])) {
                const item = document.createElement('li');
                item.textContent = { displayName: 'School name', stageDescriptions: 'Progress explanations' }[key] || key;
                list.append(item);
            }
        if (!document.getElementById('studio-conflict-dialog').open)
            document.getElementById('studio-conflict-dialog').showModal();
    }
    catch (error) {
        say(error.message, true);
    } }
    let finishBusy;
    function busyState(value) { if (value && !busy) {
        const current = document.activeElement;
        const button = current instanceof HTMLButtonElement && current.closest('[data-studio],.studio-dialog') ? current : document.getElementById('studio-save');
        if (button)
            finishBusy = window.sfFeedback?.pending(button);
    }
    else if (!value) {
        finishBusy?.();
        finishBusy = undefined;
    } busy = value; for (const id of ['studio-save', 'studio-publish', 'studio-request-review', 'studio-review']) {
        const button = document.getElementById(id);
        button.disabled = value || !allowed;
    } host.setAttribute('aria-busy', String(value)); syncActions(); }
    async function save() { if (busy || !allowed)
        return; if (!model.getState().dirty) {
        say('Your draft is already saved.');
        return;
    } if (uploading)
        return say('Wait for the image upload to finish before saving.', true); const form = document.getElementById('studio-properties-form'); if (!form.reportValidity()) {
        openPanel('properties');
        return;
    } const sent = structuredClone(model.getState().configuration); busyState(true); say('Saving your private draft…'); try {
        const result = await request('save', { revision: model.getState().serverRevision, configuration: sent });
        changes = result.changes;
        model.markSaved(result.configuration || sent, result.revision, sent);
        say(model.getState().dirty ? 'Draft saved. Your newer edits are still unsaved.' : 'Draft saved privately. Review changes before publication.');
    }
    catch (error) {
        if (error.status === 409)
            await showConflict();
        else
            say(error.message, true);
    }
    finally {
        busyState(false);
    } }
    async function perform(action, extra = {}) { if (busy || !allowed)
        return; if (uploading)
        return say('Wait for the image upload to finish.', true); if (model.getState().dirty) {
        say('Save your draft before ' + action + '. Your changes remain in this workspace.', true);
        return;
    } const sent = structuredClone(model.getState().configuration); busyState(true); try {
        const result = await request(action, { revision: model.getState().serverRevision, ...extra });
        if (action === 'request-review') {
            say('Form review requested. The live workspace is unchanged.');
            document.getElementById('studio-review-dialog').close();
        }
        else {
            const current = await request('state');
            if (JSON.stringify(model.getState().configuration) === JSON.stringify(sent))
                model.replaceDraft(current.draft, current.revision);
            else
                model.markSaved(current.draft, current.revision, sent);
            changes = current.history?.[0]?.change_summary || [];
            inspector.render();
            navigate(false);
            say((action === 'publish' ? 'Published. Your school website uses this version.' : 'Historical version restored into a private draft. Review before publication.') + (model.getState().dirty ? ' Your newer local edits remain unsaved.' : ''));
            for (const d of document.querySelectorAll('dialog[open]'))
                d.close();
        }
    }
    catch (error) {
        if (error.status === 409 && error.code === '40001')
            await showConflict();
        else
            say(error.message, true);
    }
    finally {
        busyState(false);
    } }
    window.addEventListener('message', event => {
        const data = event.data;
        if (event.origin !== location.origin || event.source !== frame.contentWindow || data?.protocol !== 1 || data.instanceId !== instance || !Number.isSafeInteger(data.sequence) || data.sequence <= incoming || JSON.stringify(data).length > 2000)
            return;
        if (!['ready', 'select', 'navigate', 'render-complete', 'render-error', 'shortcut', 'components'].includes(data.type))
            return;
        incoming = data.sequence;
        const payload = data.payload || {};
        if (data.type === 'components' && Array.isArray(payload.ids)) {
            presentComponents = new Set(payload.ids.filter((id) => typeof id === 'string'));
            drawTree();
        }
        if (data.type === 'ready') {
            ready = true;
            loading.hidden = true;
            send('initialize', { configuration: model.getState().configuration });
            send('set-mode', { mode });
            send('set-theme', { theme: theme.value });
            if (model.getState().selection)
                send('select', { componentId: model.getState().selection.componentId });
            if (payload.revision === model.getState().serverRevision && !model.getState().dirty)
                renderedKey = structure(model.getState().configuration);
            else
                void render();
        }
        if (data.type === 'render-error') {
            renderedKey = '';
            say('Preview styles could not load. Your edits are safe; use Reload preview to retry.', true);
        }
        if (data.type === 'select' && typeof payload.componentId === 'string')
            select(payload.componentId, true);
        if (data.type === 'navigate' && Object.keys(SfSchoolDesign.pages).includes(payload.page)) {
            page.value = payload.page;
            view = ['board', 'tree', 'timeline', 'done'].includes(payload.view) ? payload.view : '';
            navigate();
        }
        if (data.type === 'shortcut' && allowed) {
            if (payload.command === 'save')
                void save();
            else if (payload.command === 'undo') {
                controls.close();
                model.undo();
                inspector.render();
            }
            else if (payload.command === 'redo') {
                controls.close();
                model.redo();
                inspector.render();
            }
        }
    });
    document.getElementById('studio-refresh').addEventListener('click', () => navigate(false));
    for (const control of [page, scenario])
        control.addEventListener('change', () => { view = ''; navigate(); });
    theme.addEventListener('change', () => send('set-theme', { theme: theme.value }));
    for (const control of [width, zoom])
        control.addEventListener('change', layout);
    new ResizeObserver(layout).observe(canvas);
    search.addEventListener('input', drawTree);
    host.querySelectorAll('[data-open-panel]').forEach(button => button.addEventListener('click', () => openPanel(button.dataset.openPanel, button)));
    host.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', () => closePanel(button.dataset.closePanel)));
    document.getElementById('studio-sheet-backdrop').addEventListener('click', () => closePanel());
    document.getElementById('studio-save').addEventListener('click', () => void save());
    document.getElementById('studio-undo').addEventListener('click', () => { controls.close(); model.undo(); inspector.render(); });
    document.getElementById('studio-redo').addEventListener('click', () => { controls.close(); model.redo(); inspector.render(); });
    const modeButton = document.getElementById('studio-mode'), editButton = document.getElementById('studio-edit');
    function setMode(value) { mode = value; modeButton.setAttribute('aria-pressed', String(mode === 'preview')); editButton.setAttribute('aria-pressed', String(mode === 'edit')); modeButton.tabIndex = mode === 'preview' ? 0 : -1; editButton.tabIndex = mode === 'edit' ? 0 : -1; send('set-mode', { mode }); document.getElementById('studio-canvas-hint').textContent = mode === 'edit' ? 'Select a component in the preview or choose it from the list.' : 'Preview · fictional content only. Real actions stay disabled.'; }
    modeButton.addEventListener('click', () => setMode('preview'));
    editButton.addEventListener('click', () => setMode('edit'));
    modeButton.parentElement.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return; event.preventDefault(); const next = event.key === 'Home' ? 'edit' : event.key === 'End' ? 'preview' : mode === 'edit' ? 'preview' : 'edit'; setMode(next); (next === 'edit' ? editButton : modeButton).focus(); });
    document.getElementById('studio-review').addEventListener('click', () => { if (model.getState().dirty)
        return say('Save your draft before reviewing publication.', true); const list = document.getElementById('studio-changes'); list.replaceChildren(); for (const text of changes.length ? changes : ['No changes from the published version.']) {
        const li = document.createElement('li');
        li.textContent = text;
        list.append(li);
    } document.getElementById('studio-publish-confirm').checked = false; syncActions(); controls.close(); document.getElementById('studio-review-dialog').showModal(); });
    document.getElementById('studio-publish-confirm').addEventListener('change', syncActions);
    document.getElementById('studio-publish').addEventListener('click', () => { if (!document.getElementById('studio-publish-confirm').checked)
        return say('Confirm that you reviewed the publication effects.', true); void perform('publish', { confirmed: true }); });
    document.getElementById('studio-request-review').addEventListener('click', () => void perform('request-review'));
    document.getElementById('studio-history').addEventListener('click', async () => { closePanel(); const dialog = document.getElementById('studio-history-dialog'); try {
        const current = await request('state');
        for (const node of dialog.querySelectorAll('.studio-history-row,[data-history-empty]'))
            node.remove();
        if (!current.history.length) {
            const empty = document.createElement('p');
            empty.dataset.historyEmpty = '';
            empty.textContent = 'No published customization versions yet.';
            dialog.append(empty);
        }
        for (const version of current.history) {
            const row = document.createElement('div');
            row.className = 'studio-history-row';
            const title = document.createElement('strong');
            title.textContent = 'Version ' + version.version;
            const detail = document.createElement('p');
            detail.textContent = (version.actor_name || 'School administrator') + ' · ' + new Date(version.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
            const summary = document.createElement('small');
            summary.textContent = (version.change_summary || []).join(', ');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.studioRestore = String(version.version);
            button.textContent = 'Restore to draft';
            row.append(title, detail, summary, button);
            dialog.append(row);
        }
        dialog.showModal();
    }
    catch (error) {
        say(error.message, true);
    } });
    document.getElementById('studio-history-dialog').addEventListener('click', event => { const button = event.target.closest('[data-studio-restore]'); if (!button)
        return; if (model.getState().dirty)
        return say('Save or undo your changes before restoring a version.', true); void perform('restore', { version: Number(button.dataset.studioRestore) }); });
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
    document.getElementById('studio-copy').addEventListener('click', async () => { const text = JSON.stringify(model.getState().configuration, null, 2); try {
        await navigator.clipboard.writeText(text);
        say('Unsaved configuration copied. Keep it private.');
    }
    catch {
        const fallback = document.getElementById('studio-copy-fallback');
        fallback.hidden = false;
        fallback.value = text;
        fallback.focus();
        fallback.select();
    } });
    document.getElementById('studio-load-latest').addEventListener('click', () => { if (!latest)
        return; model.replaceDraft(latest.draft, latest.revision); inspector.render(); navigate(false); document.getElementById('studio-conflict-dialog').close(); say('Latest saved draft loaded. Your copied changes can be compared manually.'); });
    window.addEventListener('beforeunload', event => { if (model.getState().dirty) {
        event.preventDefault();
        event.returnValue = '';
    } });
    document.addEventListener('keydown', event => { const typing = event.target.matches('input,textarea,select,[contenteditable=true]'); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
    } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing && allowed) {
        event.preventDefault();
        controls.close();
        event.shiftKey ? model.redo() : model.undo();
        inspector.render();
    } if (event.key === 'Escape') {
        if (controls.isOpen())
            return;
        closePanel();
    } if (event.key === 'Tab' && host.dataset.sheet) {
        const panel = document.getElementById('studio-' + host.dataset.sheet);
        const controls = Array.from(panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')).filter(el => el.getAttribute('aria-hidden') !== 'true' && !!el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    } });
    async function capability() { if (!allowed || document.hidden)
        return; try {
        await request('capability');
    }
    catch (error) {
        if (allowed)
            say('Editor access could not be refreshed. Save will recheck permissions.', true);
    } }
    window.addEventListener('focus', () => void capability());
    setInterval(() => void capability(), 60000);
    window.addEventListener('resize', () => { if (innerWidth >= 1024 && host.dataset.sheet)
        closePanel(); layout(); });
    const undoGroup = document.querySelector('.studio-undo-group'), toolbarActions = document.querySelector('.studio-toolbar-actions'), more = document.querySelector('.studio-more'), moreContent = document.querySelector('.studio-more-content');
    function compactTools() { if (innerWidth < 640) {
        if (undoGroup.parentElement !== moreContent)
            moreContent.prepend(undoGroup);
    }
    else if (undoGroup.parentElement !== toolbarActions)
        toolbarActions.prepend(undoGroup); }
    const chromeButton = document.getElementById('studio-chrome-theme');
    function chrome(value) { document.documentElement.dataset.studioChrome = value; chromeButton.textContent = value === 'dark' ? 'Light editor appearance' : 'Dark editor appearance'; }
    try {
        chrome(localStorage.getItem('sf:studio:chrome') === 'dark' ? 'dark' : 'light');
    }
    catch {
        chrome('light');
    }
    chromeButton.addEventListener('click', () => { const value = document.documentElement.dataset.studioChrome === 'dark' ? 'light' : 'dark'; chrome(value); try {
        localStorage.setItem('sf:studio:chrome', value);
    }
    catch { } });
    document.addEventListener('click', event => { if (more.open && event.target instanceof Node && !more.contains(event.target) && !controls.isOpen())
        more.open = false; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && more.open && !controls.isOpen()) {
        more.open = false;
        more.querySelector('summary')?.focus();
    } });
    window.addEventListener('resize', compactTools);
    document.getElementById('studio-refresh').addEventListener('click', () => more.open = false);
    compactTools();
    inspector.render();
    drawTree();
    navigate(false);
    setMode(mode);
    syncActions();
})();
