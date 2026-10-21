"use strict";
(() => {
    const importer = document.querySelector('[data-enrollment-import]');
    if (importer)
        importer.addEventListener('change', async () => {
            const file = importer.files?.[0], field = document.getElementById('enrollment-emails'), status = document.querySelector('[data-enrollment-import-status]');
            if (!file || !field || !status)
                return;
            try {
                if (file.size > 260000)
                    throw new Error('Choose a CSV or text file no larger than 260 KB, with up to 1,000 email addresses.');
                if (field.value.trim()) {
                    const message = 'Replace the email list in this editor with the imported file? The saved roster changes only when you save enrollment settings.';
                    const agreed = window.sfConfirm ? await window.sfConfirm(message, { title: 'Import approved email list', confirmLabel: 'Replace editor list' }) : window.confirm(message);
                    if (!agreed)
                        return;
                }
                const text = await file.text();
                if (text.includes('\0'))
                    throw new Error('Choose a plain-text CSV or text file with one email column.');
                field.value = text;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                status.textContent = 'Imported ' + file.name + '. Review the complete list below, then save enrollment settings. This will replace the saved roster.';
                field.focus();
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : 'This file could not be imported. Paste the email column into the editor instead.';
            }
            finally {
                importer.value = '';
                importer.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    const form = document.querySelector('.student-request-review');
    if (!form)
        return;
    const all = form.querySelector('[data-student-select-all]'), count = form.querySelector('[data-student-selection-count]'), items = Array.from(form.querySelectorAll('input[name="requests"]'));
    const sync = () => { const selected = items.filter(item => item.checked).length; if (all) {
        all.checked = selected === items.length && selected > 0;
        all.indeterminate = selected > 0 && selected < items.length;
    } if (count)
        count.textContent = selected + ' of ' + items.length + ' requests selected'; };
    all?.addEventListener('change', () => { for (const item of items)
        item.checked = all.checked; sync(); });
    for (const item of items)
        item.addEventListener('change', sync);
    sync();
})();
