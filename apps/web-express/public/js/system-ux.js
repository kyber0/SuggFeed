"use strict";
(() => {
    const connection = document.getElementById('connection-status');
    let restoredTimer;
    function updateConnection() {
        if (!connection)
            return;
        clearTimeout(restoredTimer);
        connection.hidden = false;
        connection.dataset.online = String(navigator.onLine);
        connection.textContent = navigator.onLine ? 'Connection restored. You can retry the action that failed.' : 'You’re offline. Network actions may fail. Keep this page open to retain unsaved work.';
        if (navigator.onLine)
            restoredTimer = window.setTimeout(() => { connection.hidden = true; }, 5000);
    }
    if (!navigator.onLine)
        updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    const forms = Array.from(document.querySelectorAll('form[data-preserve-form]'));
    const snapshot = (form) => JSON.stringify(Array.from(new FormData(form).entries()));
    const initial = new Map(forms.map(form => [form, snapshot(form)]));
    const submitted = new Set();
    function dirty(form) { return form.dataset.unsaved === 'true' || snapshot(form) !== initial.get(form); }
    for (const form of forms) {
        const status = document.createElement('p');
        status.className = 'form-change-status';
        status.setAttribute('role', 'status');
        form.append(status);
        const describe = () => { submitted.delete(form); status.textContent = dirty(form) ? 'You have unsaved changes. Save before leaving.' : ''; };
        form.addEventListener('input', describe);
        form.addEventListener('change', describe);
        form.addEventListener('submit', event => {
            if (!navigator.onLine) {
                event.preventDefault();
                submitted.delete(form);
                updateConnection();
                status.textContent = 'Reconnect before saving. Your unsaved edits are still on this page.';
                return;
            }
            queueMicrotask(() => { if (!event.defaultPrevented)
                submitted.add(form); });
        });
        describe();
    }
    window.addEventListener('pageshow', () => submitted.clear());
    window.addEventListener('beforeunload', event => { if (forms.some(form => !submitted.has(form) && dirty(form))) {
        event.preventDefault();
        event.returnValue = '';
    } });
})();
