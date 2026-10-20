"use strict";
(() => {
    if (window.sfFileUpload) {
        window.sfFileUpload.refresh(document);
        return;
    }
    const timers = new Set();
    const afterEvent = (callback) => { const timer = setTimeout(() => { timers.delete(timer); if (!lifetime.signal.aborted)
        callback(); }, 0); timers.add(timer); };
    const records = new WeakMap(), lifetime = new AbortController();
    let sequence = 0;
    const disabled = (input) => input.matches(':disabled') || !!input.closest('[inert]');
    const imageOnly = (input) => !!input.accept && input.accept.split(',').every(type => type.trim().startsWith('image/') || /^\.(png|jpe?g|webp|gif|avif)$/i.test(type.trim()));
    function formats(input) { const names = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/avif': 'AVIF', 'application/pdf': 'PDF', 'text/csv': 'CSV', 'image/*': 'Images' }; return input.accept.split(',').map(type => { const value = type.trim(); return names[value] || (value.startsWith('.') ? value.slice(1).toUpperCase() : value); }).filter(Boolean).join(', '); }
    function sync(input) { const item = records.get(input); if (!item)
        return; const files = Array.from(input.files || []), off = disabled(input); item.root.setAttribute('aria-disabled', String(off)); item.root.classList.toggle('sf-upload--disabled', off); if (off) {
        item.depth = 0;
        item.root.classList.remove('sf-upload--over');
    } item.lead.textContent = files.length === 1 ? files[0].name : files.length ? files.length + ' files selected' : off ? 'File selection unavailable' : imageOnly(input) ? input.multiple ? 'Choose images' : 'Choose an image' : input.multiple ? 'Choose files' : 'Choose a file'; item.hint.textContent = files.length === 1 ? 'Selected from your device' : files.length ? files.slice(0, 2).map(file => file.name).join(', ') + (files.length > 2 ? ' and ' + (files.length - 2) + ' more' : '') : off ? 'See the upload requirements below.' : 'or drag and drop here'; if (item.root.dataset.error !== 'true')
        item.status.textContent = files.length ? Math.max(1, Math.round(files.reduce((size, file) => size + file.size, 0) / 1024)).toLocaleString() + ' KB selected' : formats(input); }
    function error(input, message) { const item = records.get(input); if (!item)
        return; item.root.dataset.error = 'true'; item.status.setAttribute('role', 'alert'); item.status.textContent = message; }
    function clearError(input) { const item = records.get(input); if (!item)
        return; delete item.root.dataset.error; item.status.setAttribute('role', 'status'); }
    function enhance(input) {
        if (records.has(input) || input.hidden || input.closest('[data-sf-upload-native]'))
            return;
        const root = document.createElement('span');
        root.className = 'sf-upload';
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '1.6');
        icon.setAttribute('aria-hidden', 'true');
        icon.classList.add('sf-upload-icon');
        const path = document.createElementNS(icon.namespaceURI, 'path');
        path.setAttribute('d', 'M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4');
        icon.append(path);
        const content = document.createElement('span');
        content.className = 'sf-upload-content';
        const lead = document.createElement('span');
        lead.className = 'sf-upload-lead';
        const hint = document.createElement('span');
        hint.className = 'sf-upload-hint';
        const status = document.createElement('span');
        status.className = 'sf-upload-status';
        status.id = 'sf-upload-status-' + Date.now().toString(36) + '-' + (++sequence);
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');
        content.append(lead, hint, status);
        const described = input.getAttribute('aria-describedby');
        input.before(root);
        root.append(icon, content, input);
        input.dataset.sfUploadReady = '';
        input.setAttribute('aria-describedby', [described, status.id].filter(Boolean).join(' '));
        records.set(input, { root, lead, hint, status, described, depth: 0 });
        sync(input);
    }
    function refresh(root = document) { if (root instanceof HTMLInputElement && root.type === 'file') {
        enhance(root);
        sync(root);
    } for (const input of root.querySelectorAll('input[type="file"]')) {
        enhance(input);
        sync(input);
    } }
    const zone = (event) => event.target instanceof Element ? event.target.closest('.sf-upload')?.querySelector('input[type="file"]') : null;
    const filesDragged = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
    const accepted = (file, input) => !input.accept || input.accept.split(',').some(rule => { rule = rule.trim().toLowerCase(); return rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule) : rule.endsWith('/*') ? file.type.toLowerCase().startsWith(rule.slice(0, -1)) : file.type.toLowerCase() === rule; });
    document.addEventListener('dragenter', event => { if (!filesDragged(event))
        return; const input = zone(event), item = input && records.get(input); if (!input || !item || disabled(input))
        return; event.preventDefault(); item.depth++; item.root.classList.add('sf-upload--over'); }, { signal: lifetime.signal });
    document.addEventListener('dragleave', event => { const input = zone(event), item = input && records.get(input); if (!item)
        return; item.depth = Math.max(0, item.depth - 1); if (!item.depth)
        item.root.classList.remove('sf-upload--over'); }, { signal: lifetime.signal });
    document.addEventListener('dragover', event => { if (!filesDragged(event) || !document.querySelector('.sf-upload'))
        return; event.preventDefault(); const input = zone(event); if (event.dataTransfer)
        event.dataTransfer.dropEffect = input && !disabled(input) ? 'copy' : 'none'; }, { signal: lifetime.signal });
    document.addEventListener('drop', event => {
        if (!filesDragged(event) || !document.querySelector('.sf-upload'))
            return;
        event.preventDefault();
        const input = zone(event), item = input && records.get(input);
        if (!input || !item || disabled(input))
            return;
        item.depth = 0;
        item.root.classList.remove('sf-upload--over');
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length)
            return;
        if (!input.multiple && files.length > 1) {
            error(input, 'Choose one file for this field.');
            return;
        }
        if (files.some(file => !accepted(file, input))) {
            error(input, 'Choose a supported file: ' + formats(input) + '.');
            return;
        }
        try {
            const transfer = new DataTransfer();
            for (const file of files)
                transfer.items.add(file);
            input.files = transfer.files;
        }
        catch {
            error(input, 'Use the file chooser to attach files in this browser.');
            return;
        }
        clearError(input);
        sync(input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { signal: lifetime.signal });
    document.addEventListener('dragend', () => { for (const root of document.querySelectorAll('.sf-upload--over')) {
        root.classList.remove('sf-upload--over');
        const input = root.querySelector('input[type="file"]'), item = input && records.get(input);
        if (item)
            item.depth = 0;
    } }, { signal: lifetime.signal });
    document.addEventListener('change', event => { const input = event.target; if (!(input instanceof HTMLInputElement) || input.type !== 'file')
        return; clearError(input); sync(input); afterEvent(() => sync(input)); }, { capture: true, signal: lifetime.signal });
    document.addEventListener('reset', event => { const form = event.target; if (form instanceof HTMLFormElement)
        afterEvent(() => { if (!event.defaultPrevented)
            for (const input of form.querySelectorAll('input[type="file"]'))
                clearError(input); refresh(form); }); }, { signal: lifetime.signal });
    const observer = new MutationObserver(changes => { for (const change of changes) {
        if (change.type === 'attributes') {
            if (change.target instanceof Element)
                refresh(change.target);
        }
        else
            for (const node of change.addedNodes)
                if (node instanceof Element)
                    refresh(node);
    } });
    function mount() { refresh(); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'accept', 'multiple', 'type', 'hidden', 'inert'] }); }
    function destroy() { lifetime.abort(); for (const timer of timers)
        clearTimeout(timer); timers.clear(); observer.disconnect(); for (const input of document.querySelectorAll('input[data-sf-upload-ready]')) {
        const item = records.get(input);
        if (!item)
            continue;
        if (item.described === null)
            input.removeAttribute('aria-describedby');
        else
            input.setAttribute('aria-describedby', item.described);
        delete input.dataset.sfUploadReady;
        item.root.replaceWith(input);
        records.delete(input);
    } delete window.sfFileUpload; }
    window.sfFileUpload = { refresh, destroy };
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', mount, { once: true, signal: lifetime.signal });
    else
        mount();
    window.addEventListener('pagehide', event => { if (!event.persisted)
        destroy(); }, { signal: lifetime.signal });
})();
