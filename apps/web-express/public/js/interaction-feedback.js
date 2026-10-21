"use strict";
(() => {
    if (window.sfFeedback)
        return;
    const states = new Map();
    const progress = document.createElement('div');
    progress.className = 'sf-action-progress';
    progress.hidden = true;
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Working. Please wait.');
    document.body.append(progress);
    let initiator = null, interactionTimer = 0, held = null;
    const renderProgress = () => { progress.hidden = ![...states.values()].some(state => state.visible); };
    const restore = (element, state) => {
        clearTimeout(state.timer);
        element.removeAttribute('data-sf-pending');
        if (state.busy === null)
            element.removeAttribute('aria-busy');
        else
            element.setAttribute('aria-busy', state.busy);
        if (state.ink)
            element.style.setProperty('--sf-feedback-ink', state.ink);
        else
            element.style.removeProperty('--sf-feedback-ink');
        if (state.position !== null && element.style.position === 'relative') {
            if (state.position)
                element.style.position = state.position;
            else
                element.style.removeProperty('position');
        }
        states.delete(element);
        renderProgress();
    };
    const pending = (element) => {
        let state = states.get(element);
        if (state)
            state.count++;
        else {
            state = { count: 1, timer: 0, busy: element.getAttribute('aria-busy'), ink: element.style.getPropertyValue('--sf-feedback-ink'), position: null, visible: false };
            states.set(element, state);
            element.setAttribute('aria-busy', 'true');
            const current = state;
            state.timer = window.setTimeout(() => {
                if (!states.has(element))
                    return;
                current.visible = true;
                if (element.isConnected) {
                    if (getComputedStyle(element).position === 'static') {
                        current.position = element.style.position;
                        element.style.position = 'relative';
                    }
                    element.style.setProperty('--sf-feedback-ink', getComputedStyle(element).color);
                    element.setAttribute('data-sf-pending', '');
                }
                renderProgress();
            }, 120);
        }
        let done = false;
        const current = state;
        return () => { if (done)
            return; done = true; if (states.get(element) !== current)
            return; if (--current.count === 0)
            restore(element, current); };
    };
    const reset = () => { clearTimeout(interactionTimer); initiator = null; for (const [element, state] of states)
        restore(element, state); };
    window.sfFeedback = { pending, reset };
    const activate = (element) => { initiator = element; clearTimeout(interactionTimer); interactionTimer = window.setTimeout(() => { initiator = null; }, 0); };
    document.addEventListener('click', event => {
        const element = event.target instanceof Element ? event.target.closest('button,a[href],[role="button"],input[type="submit"],input[type="button"]') : null;
        if (!element || element.closest('[data-no-feedback]'))
            return;
        if (states.has(element)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        activate(element);
        if (!(element instanceof HTMLAnchorElement) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || element.hasAttribute('download') || (element.target && element.target !== '_self'))
            return;
        const url = new URL(element.href, location.href);
        if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search))
            return;
        queueMicrotask(() => { if (!event.defaultPrevented)
            pending(element); });
    }, true);
    document.addEventListener('change', event => { if (event.target instanceof HTMLSelectElement || (event.target instanceof HTMLInputElement && event.target.type === 'file'))
        activate(event.target); }, true);
    document.addEventListener('submit', event => {
        if (!(event.target instanceof HTMLFormElement))
            return;
        const form = event.target, element = event.submitter instanceof HTMLElement ? event.submitter : form.querySelector('button[type="submit"],button:not([type]),input[type="submit"]');
        if (!element || form.closest('[data-no-feedback]'))
            return;
        activate(element);
        const submitter = event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement ? event.submitter : null;
        const method = submitter?.getAttribute('formmethod') || form.method, target = submitter?.getAttribute('formtarget') || form.target;
        if (method.toLowerCase() === 'dialog' || (target && target !== '_self'))
            return;
        queueMicrotask(() => { if (!event.defaultPrevented)
            pending(element); });
    }, true);
    // Track only requests started by the current user event, never background polling.
    const request = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const done = initiator ? pending(initiator) : null;
        try {
            return request(input, init).then(response => { done?.(); return response; }, error => { done?.(); throw error; });
        }
        catch (error) {
            done?.();
            throw error;
        }
    };
    const release = () => { held?.removeAttribute('data-sf-held'); held = null; };
    document.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.pointerType !== 'mouse' || !(event.target instanceof Element) || event.target.closest('button,a,input,select,textarea,summary,[role="button"]'))
            return;
        held = event.target.closest('[draggable="true"]');
        held?.setAttribute('data-sf-held', '');
    }, true);
    for (const name of ['pointerup', 'pointercancel', 'dragend', 'drop'])
        window.addEventListener(name, release, true);
    window.addEventListener('blur', release);
    window.addEventListener('pageshow', reset);
    window.addEventListener('pagehide', () => { reset(); release(); });
    window.addEventListener('beforeunload', event => { queueMicrotask(() => { if (event.defaultPrevented)
        reset(); }); });
})();
