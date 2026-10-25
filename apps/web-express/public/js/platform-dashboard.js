"use strict";
(() => {
    const root = document.querySelector('[data-platform-workspace]');
    if (!root)
        return;
    let submitting = new WeakSet();
    const resetForms = () => { submitting = new WeakSet(); for (const form of root.querySelectorAll('[data-platform-submitting]')) {
        delete form.dataset.platformSubmitting;
        form.removeAttribute('aria-busy');
        for (const button of form.querySelectorAll('[data-platform-busy-control]')) {
            delete button.dataset.platformBusyControl;
            button.removeAttribute('aria-disabled');
        }
    } };
    document.addEventListener('submit', event => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !root.contains(form) || form.method.toLowerCase() !== 'post')
            return;
        if (submitting.has(form)) {
            event.preventDefault();
            return;
        }
        submitting.add(form);
        queueMicrotask(() => { if (event.defaultPrevented) {
            submitting.delete(form);
            return;
        } form.dataset.platformSubmitting = ''; form.setAttribute('aria-busy', 'true'); for (const button of form.querySelectorAll('button[type=submit]'))
            if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') {
                button.dataset.platformBusyControl = '';
                button.setAttribute('aria-disabled', 'true');
            } });
    });
    window.addEventListener('pageshow', resetForms);
    // Fragment-only bookmarks predate server-addressable sections.
    const hash = location.hash.slice(1), legacy = { overview: 'overview', schools: 'schools', applications: 'reviews', policies: 'reviews', assistant: 'reviews', 'editor-access': 'editor-access', setup: 'setup' };
    if (hash && !new URLSearchParams(location.search).has('section')) {
        const target = new URL('/platform/schools', location.origin);
        if (legacy[hash]) {
            target.searchParams.set('section', legacy[hash]);
            if (['applications', 'policies', 'assistant'].includes(hash))
                target.searchParams.set('reviewType', hash === 'assistant' ? 'sugi' : hash);
            const old = new URLSearchParams(location.search);
            for (const key of hash === 'schools' ? ['q', 'status'] : hash === 'overview' ? ['overviewDays'] : [])
                if (old.has(key))
                    target.searchParams.set(key, old.get(key));
            const page = old.get(hash === 'applications' ? 'applicationPage' : hash === 'editor-access' ? 'editorPage' : 'page');
            if (page)
                target.searchParams.set('page', page);
            location.replace(target.pathname + target.search);
        }
        else if (/^(?:school|policy)-[a-f0-9-]{36}$/.test(hash)) {
            const id = hash.slice(hash.indexOf('-') + 1);
            location.replace(hash.startsWith('school-') ? '/platform/schools/' + id : '/platform/schools?section=reviews&reviewType=policies&item=' + id);
        }
    }
})();
