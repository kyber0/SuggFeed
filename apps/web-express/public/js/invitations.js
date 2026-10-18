"use strict";
(() => {
    const guide = document.querySelector('[data-invitation-guide]');
    if (guide)
        guide.open = matchMedia('(min-width:801px)').matches;
    const input = document.querySelector('[data-invitation-url]');
    const copy = document.querySelector('[data-invitation-copy]');
    const status = document.querySelector('[data-invitation-copy-status]');
    if (input)
        input.value = new URL(input.value, location.origin).href;
    copy?.addEventListener('click', async () => {
        if (!input || !status)
            return;
        try {
            await navigator.clipboard.writeText(input.value);
            status.textContent = 'Link copied. Share it only with the invited person.';
            copy.textContent = 'Copied';
        }
        catch {
            input.focus();
            input.select();
            status.textContent = 'Select and copy the link above. Automatic copying is unavailable.';
        }
    });
    const create = document.querySelector('form[data-invitation-form] input[name="delivery"]')?.form;
    const submit = create?.querySelector('[data-invitation-submit]');
    function label() { if (submit)
        submit.textContent = create?.querySelector('input[name="delivery"]:checked')?.value === 'email' ? 'Send invitation' : 'Create invitation link'; }
    create?.addEventListener('change', label);
    document.querySelectorAll('form[data-invitation-form]').forEach(form => {
        let busy = false;
        const buttons = Array.from(form.querySelectorAll('button[type="submit"]'));
        const labels = buttons.map(button => button.textContent);
        form.addEventListener('submit', event => {
            if (busy) {
                event.preventDefault();
                return;
            }
            if (event.defaultPrevented)
                return;
            busy = true;
            form.setAttribute('aria-busy', 'true');
            buttons.forEach(button => { button.disabled = true; button.textContent = 'Please wait…'; });
        });
        window.addEventListener('pageshow', () => { busy = false; form.removeAttribute('aria-busy'); buttons.forEach((button, index) => { button.disabled = false; button.textContent = labels[index]; }); if (form === create)
            label(); });
    });
})();
