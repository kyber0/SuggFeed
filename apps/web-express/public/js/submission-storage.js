"use strict";
(() => {
    const validCategory = (value) => typeof value === 'string' && value.length <= 80;
    const lifetime = 7 * 86400000;
    let opening = null;
    function database() {
        if (!opening)
            opening = new Promise((resolve, reject) => {
                let request;
                try {
                    request = indexedDB.open(sfSchoolKey('suggfeed-submissions'), 1);
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
        return p && (p.previousAnswers === undefined || Array.isArray(p.previousAnswers) && p.previousAnswers.length <= 64 && p.previousAnswers.every((row) => typeof row?.label === 'string' && row.label.length <= 240 && typeof row?.answer === 'string' && row.answer.length <= 1000)) && typeof p.title === 'string' && p.title.length <= 120 && typeof p.description === 'string' && p.description.length <= 2000 && (p.category === '' || validCategory(p.category)) && typeof p.isAnonymous === 'boolean' && (p.schemaVersion === undefined || p.schemaVersion === 2 && (p.formVersion === null || typeof p.formVersion === 'string' && /^[a-f0-9-]{36}$/i.test(p.formVersion)) && p.answers && typeof p.answers === 'object' && !Array.isArray(p.answers) && Object.keys(p.answers).length <= 8 && Object.entries(p.answers).every(([key, value]) => /^[a-f0-9-]{36}$/i.test(key) && typeof value === 'string' && value.length <= 1000) && Array.isArray(p.fileIds) && p.fileIds.length <= 3 && p.fileIds.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)));
    }
    function valid(record) {
        return record?.version === 1 && ['draft', 'operation'].includes(record.kind) && typeof record.key === 'string' &&
            Number.isFinite(record.createdAt) && Number.isFinite(record.expiresAt) && record.expiresAt <= record.createdAt + lifetime && record.expiresAt > Date.now() && validPayload(record.payload) &&
            (record.kind === 'draft' || (!!record.payload.category && validCategory(record.payload.category) && /^[0-9a-f-]{36}$/i.test(record.key) && /^[a-f0-9]{64}$/.test(record.actor) && ['Waiting for connection', 'Ready to send', 'Sending', 'Needs attention'].includes(record.state)));
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
            payload: { title: record.payload.title, description: record.payload.description, category: record.payload.category, isAnonymous: record.payload.isAnonymous, ...(record.payload.schemaVersion === 2 ? { schemaVersion: 2, formVersion: record.payload.formVersion || null, answers: record.payload.answers || {}, fileIds: record.payload.fileIds || [], ...(record.kind === 'draft' && record.payload.previousAnswers ? { previousAnswers: record.payload.previousAnswers.map(row => ({ label: row.label, answer: row.answer })) } : {}) } : {}) },
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
