"use strict";
(() => {
    const container = document.getElementById('toast-container');
    if (!container)
        return;
    const pending = [];
    const visible = new Map();
    const icons = {
        success: 'M20 6 9 17l-5-5',
        error: 'm8 8 8 8m0-8-8 8',
        warning: 'M12 8v5m0 3h.01M12 3 2 21h20Z',
        info: 'M12 11v6m0-10h.01',
    };
    function svg(path) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }))
            el.setAttribute(key, value);
        const line = document.createElementNS(el.namespaceURI, 'path');
        line.setAttribute('d', path);
        el.append(line);
        return el;
    }
    function drain() {
        while (visible.size < 3 && pending.length)
            show(pending.shift());
    }
    function show(notice) {
        const toast = document.createElement('div');
        toast.className = 'sf-toast sf-toast--' + notice.kind;
        const progress = document.createElement('div');
        progress.className = 'sf-toast__progress';
        const icon = document.createElement('span');
        icon.className = 'sf-toast__icon';
        icon.append(svg(icons[notice.kind]));
        const body = document.createElement('div');
        body.className = 'sf-toast__body';
        // Only the content is live: dismissing a notice must not announce its button.
        body.setAttribute('role', notice.kind === 'error' ? 'alert' : 'status');
        body.setAttribute('aria-atomic', 'true');
        const title = document.createElement('div');
        title.className = 'sf-toast__title';
        title.textContent = notice.title || { info: 'Information', success: 'Done', warning: 'Please check', error: 'Something went wrong' }[notice.kind];
        const message = document.createElement('div');
        message.className = 'sf-toast__message';
        message.textContent = notice.message;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'sf-toast__close';
        close.setAttribute('aria-label', 'Dismiss notification');
        close.append(svg('m6 6 12 12M18 6 6 18'));
        body.append(title, message);
        toast.append(icon, body, close);
        const duration = notice.kind === 'error' ? 0 : notice.kind === 'warning' ? 9000 : 6000;
        let remaining = duration, started = 0, timer, leaving = false;
        let hovered = false, focused = false;
        let returnFocus = document.activeElement;
        if (duration) {
            toast.append(progress);
            progress.style.animationDuration = duration + 'ms';
        }
        visible.set(toast, notice);
        container.append(toast);
        function pause() {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
                remaining = Math.max(0, remaining - (performance.now() - started));
            }
            progress.style.animationPlayState = 'paused';
        }
        function resume() {
            if (!duration || leaving || hovered || focused || document.hidden || timer !== undefined)
                return;
            started = performance.now();
            progress.style.animationPlayState = 'running';
            timer = window.setTimeout(dismiss, remaining);
        }
        function visibility() { if (document.hidden)
            pause();
        else
            resume(); }
        function dismiss() {
            if (leaving)
                return;
            leaving = true;
            pause();
            document.removeEventListener('visibilitychange', visibility);
            // Keep keyboard focus in the stack when another notice is available.
            const hadFocus = toast.contains(document.activeElement);
            toast.classList.add('sf-toast--leaving');
            window.setTimeout(() => {
                visible.delete(toast);
                toast.remove();
                drain();
                if (hadFocus) {
                    const next = container.querySelector('.sf-toast__close');
                    if (next)
                        next.focus();
                    else if (returnFocus?.isConnected)
                        returnFocus.focus();
                }
            }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
        }
        close.addEventListener('click', dismiss);
        toast.addEventListener('pointerenter', () => { hovered = true; pause(); });
        toast.addEventListener('pointerleave', () => { hovered = false; resume(); });
        toast.addEventListener('focusin', event => {
            const previous = event.relatedTarget;
            if (previous?.isConnected && !container.contains(previous))
                returnFocus = previous;
            focused = true;
            pause();
        });
        toast.addEventListener('focusout', event => { focused = toast.contains(event.relatedTarget); resume(); });
        document.addEventListener('visibilitychange', visibility);
        // Append content after creating the live region so screen readers announce it.
        const content = message.textContent;
        message.textContent = '';
        window.setTimeout(() => { if (!leaving)
            message.textContent = content; }, 50);
        resume();
    }
    window.sfToast = (message, type = 'info', title = '') => {
        if (!message)
            return;
        const kind = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';
        const notice = { message: String(message), title: String(title), kind };
        const duplicate = [...visible.values(), ...pending].some(item => item.message === notice.message && item.title === notice.title && item.kind === kind);
        if (duplicate)
            return;
        pending.push(notice);
        drain();
    };
})();
