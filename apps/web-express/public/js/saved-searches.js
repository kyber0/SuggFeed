"use strict";
(() => {
    const form = document.getElementById('saved-search-form');
    if (!form)
        return;
    const panel = document.getElementById('saved-search-panel');
    const list = document.getElementById('saved-search-list');
    const status = document.getElementById('saved-search-status');
    const add = document.getElementById('saved-search-add');
    const retry = document.getElementById('saved-search-retry');
    const nameInput = form.elements.namedItem('name');
    const account = !!document.getElementById('sf-auth-config')?.dataset.user;
    const key = 'sf:saved-searches:v1';
    let items = [], busy = false, loaded = false, editing = null;
    const clean = (value) => ({
        sort: ['all', 'latest', 'popular', 'top', 'oldest'].includes(value?.sort) ? value.sort : 'all',
        category: ['All', 'Facilities', 'Learning', 'Safety', 'Student life', 'Other'].includes(value?.category) ? value.category : 'All',
        search: typeof value?.search === 'string' ? value.search.trim().slice(0, 120) : '',
        scope: account && value?.scope === 'following' ? 'following' : 'all',
    });
    function normalize(value) {
        if (!value || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 40)
            return null;
        return { id: value.id, name: value.name, filters: clean(value.filters) };
    }
    const config = document.getElementById('sf-feed-config');
    const current = clean({ sort: config.dataset.sort, category: config.dataset.category, search: config.dataset.search, scope: new URLSearchParams(location.search).get('scope') });
    const sameView = (left, right) => {
        const canonical = (value) => { const result = clean(value); result.sort = result.sort === 'latest' ? 'all' : result.sort === 'top' ? 'popular' : result.sort; return JSON.stringify(result); };
        return canonical(left) === canonical(right);
    };
    const sortLabel = (sort) => ['top', 'popular'].includes(sort) ? 'Most supported' : sort === 'oldest' ? 'Oldest first' : 'Latest';
    function icon(kind) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', { bookmark: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', edit: 'M16 3l5 5M3 21l4-1 14-14-4-4L3 16z', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7', arrow: 'M5 12h14M13 6l6 6-6 6' }[kind]);
        svg.append(path);
        return svg;
    }
    function chips(filters) {
        const wrapper = document.createElement('div');
        wrapper.className = 'saved-search-chips';
        const values = [filters.category === 'All' ? 'All topics' : filters.category, sortLabel(filters.sort)];
        if (filters.scope === 'following')
            values.push('Following');
        if (filters.search)
            values.push('“' + filters.search + '”');
        for (const value of values) {
            const chip = document.createElement('span');
            chip.className = 'saved-search-chip';
            chip.textContent = value;
            wrapper.append(chip);
        }
        return wrapper;
    }
    document.getElementById('saved-search-current-filters').append(chips(current));
    document.getElementById('saved-search-storage').textContent = account ? 'Saved to your account' : 'Saved on this device';
    document.getElementById('saved-search-storage-note').textContent = account ? 'Your saved views follow your account. Saving a view does not enable email alerts.' : 'Only this browser remembers these views. Others using this device can see them; saving a view does not enable email alerts.';
    function store() { localStorage.setItem(key, JSON.stringify({ version: 1, items })); }
    async function request(path = '', method = 'GET', body) {
        const response = await fetch('/api/saved-searches' + path, { method, cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const data = await response.json();
        if (!response.ok || !data.success) {
            const error = new Error(typeof data.error === 'string' ? data.error : 'This change could not be confirmed. Reload searches before trying again.');
            Object.assign(error, { status: response.status });
            throw error;
        }
        return data;
    }
    function feedback(text, error = false) { status.textContent = text; status.classList.toggle('is-error', error); status.setAttribute('role', error ? 'alert' : 'status'); }
    function controls() {
        panel.querySelectorAll('input,button').forEach(el => el.disabled = busy || !loaded);
        retry.disabled = busy;
        const match = items.find(item => sameView(item.filters, current));
        add.disabled = busy || !loaded || !!match || items.length >= 10;
        add.textContent = match ? 'View already saved' : items.length >= 10 ? 'Ten searches saved' : 'Save this view';
        document.getElementById('saved-search-current-note').textContent = match ? 'Saved as “' + match.name + '”.' : items.length >= 10 ? 'Remove a saved search to make room for another.' : 'Save the filters applied above, starting at page one.';
        document.getElementById('saved-search-count').textContent = loaded ? items.length + ' / 10' : '— / 10';
        list.setAttribute('aria-busy', String(busy));
    }
    function closeCreate() { form.hidden = true; form.reset(); add.setAttribute('aria-expanded', 'false'); }
    function openCreate() {
        if (add.disabled)
            return;
        editing = null;
        render();
        form.hidden = false;
        add.setAttribute('aria-expanded', 'true');
        nameInput.value = (current.search || (current.category !== 'All' ? current.category + ' ideas' : current.scope === 'following' ? 'Ideas I follow' : sortLabel(current.sort) + ' ideas')).slice(0, 40);
        nameInput.focus();
        nameInput.select();
    }
    function actionButton(label, kind) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'saved-search-action';
        button.append(icon(kind), document.createTextNode(label));
        return button;
    }
    function render() {
        list.replaceChildren();
        for (const item of items) {
            const row = document.createElement('li');
            row.className = 'saved-search-item';
            row.dataset.searchId = item.id;
            const link = document.createElement('a');
            link.className = 'saved-search-link';
            link.href = '/feed?' + new URLSearchParams(clean(item.filters));
            const mark = document.createElement('span');
            mark.className = 'saved-search-mark';
            mark.append(icon('bookmark'));
            const title = document.createElement('span');
            title.className = 'saved-search-name';
            title.textContent = item.name;
            link.append(mark, title, icon('arrow'));
            row.append(link);
            if (sameView(item.filters, current)) {
                row.classList.add('is-current');
                const badge = document.createElement('span');
                badge.className = 'saved-search-current-badge';
                badge.textContent = 'Current view';
                row.append(badge);
            }
            row.append(chips(clean(item.filters)));
            if (editing === item.id) {
                const edit = document.createElement('form');
                edit.className = 'saved-search-rename';
                const label = document.createElement('label');
                label.textContent = 'New name';
                const input = document.createElement('input');
                input.className = 'saved-search-input';
                input.value = item.name;
                input.required = true;
                input.maxLength = 40;
                label.append(input);
                const save = document.createElement('button');
                save.type = 'submit';
                save.className = 'saved-search-primary';
                save.textContent = 'Save name';
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'saved-search-action';
                cancel.textContent = 'Cancel';
                edit.append(label, save, cancel);
                row.append(edit);
                const closeRename = () => { editing = null; render(); list.querySelector('[data-search-id="' + item.id + '"] [data-rename]')?.focus(); };
                cancel.addEventListener('click', closeRename);
                edit.addEventListener('keydown', e => { if (e.key === 'Escape') {
                    e.preventDefault();
                    closeRename();
                } });
                edit.addEventListener('submit', e => {
                    e.preventDefault();
                    const name = input.value.trim();
                    void act(async () => {
                        if (!name || name.length > 40)
                            throw new Error('Enter a name of 1–40 characters.');
                        if (items.some(x => x.id !== item.id && x.name === name))
                            throw new Error('A search already uses that name.');
                        if (account)
                            await request('/' + item.id, 'PATCH', { name });
                        const previous = item.name;
                        item.name = name;
                        if (!account)
                            try {
                                store();
                            }
                            catch (e) {
                                item.name = previous;
                                throw e;
                            }
                        editing = null;
                    }, 'Search renamed.', () => list.querySelector('[data-search-id="' + item.id + '"] [data-rename]'));
                });
            }
            else {
                const actions = document.createElement('div');
                actions.className = 'saved-search-actions';
                const rename = actionButton('Rename', 'edit');
                rename.dataset.rename = '';
                rename.setAttribute('aria-label', 'Rename ' + item.name);
                const remove = actionButton('Delete', 'trash');
                remove.classList.add('saved-search-delete');
                remove.setAttribute('aria-label', 'Delete ' + item.name);
                rename.addEventListener('click', () => { if (busy || !loaded)
                    return; closeCreate(); editing = item.id; render(); const input = list.querySelector('.saved-search-rename input'); input?.focus(); input?.select(); });
                remove.addEventListener('click', () => {
                    if (busy || !loaded || !confirm('Delete saved search “' + item.name + '”?'))
                        return;
                    const index = items.indexOf(item);
                    void act(async () => {
                        if (account)
                            await request('/' + item.id, 'DELETE');
                        const previous = items;
                        items = items.filter(x => x.id !== item.id);
                        if (!account)
                            try {
                                store();
                            }
                            catch (e) {
                                items = previous;
                                throw e;
                            }
                    }, 'Search deleted.', () => list.querySelectorAll('.saved-search-link')[Math.min(index, items.length - 1)] || add);
                });
                actions.append(rename, remove);
                row.append(actions);
            }
            list.append(row);
        }
        if (!items.length) {
            const empty = document.createElement('li');
            empty.className = 'saved-search-empty';
            const mark = document.createElement('span');
            mark.className = 'saved-search-empty-mark';
            mark.append(icon('bookmark'));
            const title = document.createElement('strong');
            title.textContent = 'Keep useful views close';
            const help = document.createElement('p');
            help.textContent = 'Save a topic, keyword or sort order and return to it with one click.';
            empty.append(mark, title, help);
            list.append(empty);
        }
        controls();
    }
    async function load() {
        if (busy)
            return;
        busy = true;
        retry.hidden = true;
        feedback('Loading saved searches…');
        controls();
        try {
            let values;
            if (account) {
                values = (await request()).searches;
                if (!Array.isArray(values))
                    throw new Error('Invalid search response.');
            }
            else {
                const data = JSON.parse(localStorage.getItem(key) || 'null');
                values = data?.version === 1 && Array.isArray(data.items) ? data.items : [];
            }
            items = values.map(normalize).filter((item) => !!item).slice(0, 10);
            loaded = true;
            editing = null;
            render();
            feedback('');
        }
        catch {
            loaded = false;
            retry.hidden = false;
            feedback('Saved searches could not load. Try again or check browser storage.', true);
        }
        finally {
            busy = false;
            controls();
        }
    }
    async function act(action, success, focus) {
        if (busy || !loaded)
            return;
        const previousFocus = document.activeElement;
        let successful = false;
        busy = true;
        feedback('Saving…');
        controls();
        try {
            await action();
            successful = true;
            render();
            retry.hidden = true;
            feedback(success);
        }
        catch (e) {
            const storageError = e?.name === 'QuotaExceededError' || e?.name === 'SecurityError';
            const uncertain = ['TimeoutError', 'TypeError', 'SyntaxError'].includes(e?.name) || e?.status >= 500 || /response was incomplete/.test(e?.message || '');
            if (uncertain)
                loaded = false;
            feedback(storageError ? 'Browser storage is unavailable. This change was not saved.' : uncertain ? 'This change could not be confirmed. Reload searches before trying again.' : e.message, true);
            retry.hidden = false;
        }
        finally {
            busy = false;
            controls();
            if (successful)
                focus?.()?.focus();
            else if (previousFocus?.isConnected)
                previousFocus.focus();
        }
    }
    add.addEventListener('click', openCreate);
    document.getElementById('saved-search-cancel').addEventListener('click', () => { closeCreate(); add.focus(); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') {
        e.preventDefault();
        closeCreate();
        add.focus();
    } });
    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim();
        void act(async () => {
            if (!name || name.length > 40)
                throw new Error('Enter a name of 1–40 characters.');
            if (items.length >= 10)
                throw new Error('You can save up to ten searches. Remove one first.');
            if (items.some(x => x.name === name))
                throw new Error('A search already uses that name.');
            if (items.some(item => sameView(item.filters, current)))
                throw new Error('This view is already saved.');
            if (account) {
                const data = await request('', 'POST', { name, filters: current });
                const item = normalize(data.search);
                if (!item)
                    throw new Error('The save response was incomplete. Reload searches to confirm.');
                items = [...items, item];
            }
            else {
                const previous = items;
                items = [...items, { id: crypto.randomUUID(), name, filters: current }];
                try {
                    store();
                }
                catch (e) {
                    items = previous;
                    throw e;
                }
            }
            closeCreate();
        }, 'Search saved.', () => list.querySelector('.saved-search-item:last-child .saved-search-link'));
    });
    retry.addEventListener('click', () => void load());
    void load();
})();
