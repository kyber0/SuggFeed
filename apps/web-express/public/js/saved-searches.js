"use strict";
(() => {
    const form = document.getElementById('saved-search-form');
    if (!form)
        return;
    const list = document.getElementById('saved-search-list'), status = document.getElementById('saved-search-status');
    const account = !!document.getElementById('sf-auth-config')?.dataset.user;
    const key = 'sf:saved-searches:v1';
    let items = [], busy = false, loaded = false;
    const clean = (value) => ({
        sort: ['all', 'latest', 'popular', 'top', 'oldest'].includes(value?.sort) ? value.sort : 'all',
        category: ['All', 'Facilities', 'Learning', 'Safety', 'Student life', 'Other'].includes(value?.category) ? value.category : 'All',
        search: typeof value?.search === 'string' ? value.search.trim().slice(0, 120) : '',
        scope: account && value?.scope === 'following' ? 'following' : 'all',
    });
    function store() { localStorage.setItem(key, JSON.stringify({ version: 1, items })); }
    async function request(path = '', method = 'GET', body) {
        const response = await fetch('/api/saved-searches' + path, { method, cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const data = await response.json();
        if (!response.ok || !data.success)
            throw new Error(data.error || 'Searches could not be saved. Refresh to check before retrying.');
        return data;
    }
    function render() {
        list.replaceChildren();
        for (const item of items) {
            const row = document.createElement('li'), link = document.createElement('a');
            link.href = '/feed?' + new URLSearchParams(clean(item.filters));
            link.textContent = item.name;
            row.append(link);
            const edit = document.createElement('form');
            edit.className = 'workspace-actions';
            const label = document.createElement('label');
            label.textContent = 'Rename ' + item.name;
            const input = document.createElement('input');
            input.value = item.name;
            input.required = true;
            input.maxLength = 40;
            input.className = 'workspace-input';
            label.append(input);
            const rename = document.createElement('button');
            rename.type = 'submit';
            rename.className = 'workspace-button';
            rename.textContent = 'Rename';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'workspace-button';
            remove.textContent = 'Delete';
            remove.setAttribute('aria-label', 'Delete ' + item.name);
            edit.append(label, rename, remove);
            row.append(edit);
            list.append(row);
            edit.addEventListener('submit', e => {
                e.preventDefault();
                void act(async () => {
                    const name = input.value.trim();
                    if (!name || name.length > 40)
                        throw new Error('Enter a name of 1–40 characters.');
                    if (items.some(x => x.id !== item.id && x.name === name))
                        throw new Error('A search already uses that name.');
                    if (account)
                        await request('/' + item.id, 'PATCH', { name });
                    else {
                        const previous = item.name;
                        item.name = name;
                        try {
                            store();
                        }
                        catch (e) {
                            item.name = previous;
                            throw e;
                        }
                    }
                }, 'Search renamed.');
            });
            remove.addEventListener('click', () => {
                if (!confirm('Delete saved search “' + item.name + '”?'))
                    return;
                void act(async () => {
                    if (account)
                        await request('/' + item.id, 'DELETE');
                    else {
                        const previous = items;
                        items = items.filter(x => x.id !== item.id);
                        try {
                            store();
                        }
                        catch (e) {
                            items = previous;
                            throw e;
                        }
                    }
                }, 'Search deleted.');
            });
        }
        if (!items.length) {
            const empty = document.createElement('li');
            empty.textContent = 'No saved searches yet.';
            list.append(empty);
        }
    }
    async function load() {
        if (account)
            items = (await request()).searches;
        else {
            const data = JSON.parse(localStorage.getItem(key) || 'null');
            items = data?.version === 1 && Array.isArray(data.items) ? data.items.filter(x => typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id) && typeof x.name === 'string' && x.name.length <= 40).slice(0, 10).map(x => ({ ...x, filters: clean(x.filters) })) : [];
        }
        loaded = true;
        render();
    }
    async function act(action, success) {
        if (busy || !loaded)
            return;
        const shouldFocus = form.parentElement?.contains(document.activeElement);
        busy = true;
        form.parentElement?.querySelectorAll('input,button').forEach(el => el.disabled = true);
        status.textContent = 'Saving…';
        form.parentElement?.setAttribute('aria-busy', 'true');
        try {
            await action();
            if (account)
                await load();
            else
                render();
            status.textContent = success;
        }
        catch (e) {
            status.textContent = e instanceof Error && e.name !== 'QuotaExceededError' && e.name !== 'SecurityError' ? e.message : 'Browser storage is unavailable. This change was not saved.';
        }
        finally {
            busy = false;
            form.parentElement?.querySelectorAll('input,button').forEach(el => el.disabled = false);
            form.parentElement?.removeAttribute('aria-busy');
            if (shouldFocus)
                form.querySelector('input[name=name]')?.focus();
        }
    }
    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = String(new FormData(form).get('name') || '').trim();
        void act(async () => {
            if (!name || name.length > 40)
                throw new Error('Enter a name of 1–40 characters.');
            if (items.length >= 10)
                throw new Error('You can save up to ten searches. Remove one first.');
            if (items.some(x => x.name === name))
                throw new Error('A search already uses that name.');
            const config = document.getElementById('sf-feed-config'), filters = clean({ sort: config.dataset.sort, category: config.dataset.category, search: config.dataset.search, scope: new URLSearchParams(location.search).get('scope') });
            if (account)
                await request('', 'POST', { name, filters });
            else {
                const previous = items;
                items = [...items, { id: crypto.randomUUID(), name, filters }];
                try {
                    store();
                }
                catch (e) {
                    items = previous;
                    throw e;
                }
            }
            form.reset();
        }, 'Applied filters saved. This does not enable email alerts.');
    });
    document.getElementById('saved-search-retry')?.addEventListener('click', () => { void load().then(() => status.textContent = 'Searches loaded.').catch(() => status.textContent = 'Searches could not load. Try again.'); });
    void load().then(() => status.textContent = account ? 'Saved to your account.' : 'Saved only on this device; others using this browser can see them.').catch(() => status.textContent = 'Searches could not load. Retry or enable browser storage.');
})();
