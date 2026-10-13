"use strict";
(() => {
    const categories = ['Facilities', 'Learning', 'Safety', 'Student life', 'Other'];
    const lifetime = 7 * 86400000;
    let opening = null;
    function database() {
        if (!opening)
            opening = new Promise((resolve, reject) => {
                let request;
                try {
                    request = indexedDB.open('suggfeed-submissions', 1);
                }
                catch {
                    reject(new Error('Browser storage is unavailable. Your editable draft is still here.'));
                    return;
                }
                request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'key' });
                request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
                request.onerror = () => { opening = null; reject(new Error('Browser storage is unavailable. Your editable draft is still here.')); };
                request.onblocked = () => { opening = null; reject(new Error('Close other SuggFeed tabs and retry saving.')); };
            });
        return opening;
    }
    function validPayload(p) {
        return p && typeof p.title === 'string' && p.title.length <= 120 && typeof p.description === 'string' && p.description.length <= 2000 && (p.category === '' || categories.includes(p.category)) && typeof p.isAnonymous === 'boolean';
    }
    function valid(record) {
        return record?.version === 1 && ['draft', 'operation'].includes(record.kind) && typeof record.key === 'string' &&
            Number.isFinite(record.createdAt) && Number.isFinite(record.expiresAt) && record.expiresAt <= record.createdAt + lifetime && record.expiresAt > Date.now() && validPayload(record.payload) &&
            (record.kind === 'draft' || (categories.includes(record.payload.category) && /^[0-9a-f-]{36}$/i.test(record.key) && /^[a-f0-9]{64}$/.test(record.actor) && ['Waiting for connection', 'Ready to send', 'Sending', 'Needs attention'].includes(record.state)));
    }
    async function records(normalize = false) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records'), request = store.getAll();
            let result = [];
            request.onsuccess = () => { for (const row of request.result) {
                if (!valid(row)) {
                    store.delete(row.key);
                    continue;
                }
                if (normalize && row.state === 'Sending') {
                    row.state = 'Needs attention';
                    store.put(row);
                }
                result.push(row);
            } };
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(new Error('Saved drafts could not load.'));
            tx.onabort = () => reject(new Error('Saved drafts could not load.'));
        });
    }
    async function put(record) {
        if (!valid(record))
            throw new Error('This draft expired or contains unsupported fields.');
        // Reconstruct the record: unknown fields and capabilities never reach IndexedDB.
        const safe = { key: record.key, version: 1, kind: record.kind, createdAt: record.createdAt, expiresAt: record.expiresAt,
            payload: { title: record.payload.title, description: record.payload.description, category: record.payload.category, isAnonymous: record.payload.isAnonymous },
            ...(record.kind === 'operation' ? { actor: record.actor, state: record.state } : {}) };
        const db = await database();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records'), read = store.getAll();
            let full = false;
            read.onsuccess = () => {
                const active = read.result.filter(valid);
                if (safe.kind === 'operation' && !active.some(x => x.key === safe.key) && active.filter(x => x.kind === 'operation').length >= 10) {
                    full = true;
                    tx.abort();
                    return;
                }
                store.put(safe);
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error('Draft not saved. Browser storage may be full or unavailable.'));
            tx.onabort = () => reject(new Error(full ? 'Ten queued ideas maximum. Remove one first.' : 'Draft not saved. Browser storage may be full or unavailable.'));
        });
    }
    async function remove(key) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readwrite');
            tx.objectStore('records').delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error('This saved item could not be removed.'));
            tx.onabort = () => reject(new Error('This saved item could not be removed.'));
        });
    }
    Object.assign(window, { sfSubmissionStorage: { records, put, remove, lifetime } });
})();
