"use strict";
var SfMotion;
(function (SfMotion) {
    function transitionEligible(href, origin) {
        try {
            const url = new URL(href, origin), path = url.pathname.replace(/^\/s\/[^/]+(?=\/|$)/, '') || '/';
            return url.origin === origin && /^https?:$/.test(url.protocol) && !/^\/(auth|api|digest|account\/security|staff-login|staff\/workspace)(\/|$)/.test(path) && !path.includes('/customization');
        }
        catch {
            return false;
        }
    }
    SfMotion.transitionEligible = transitionEligible;
    SfMotion.factories.push(context => {
        let pending = false;
        const eligible = () => !context.reduced.matches && !SfMotion.editing() && transitionEligible(location.href, location.origin);
        document.documentElement.toggleAttribute('data-sf-transitions', eligible());
        context.on(document, 'click', event => { const click = event; const link = event.target instanceof Element ? event.target.closest('a[href]') : null; pending = false; if (!link || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey || link.download || link.hasAttribute('download') || (link.target && link.target !== '_self'))
            return; queueMicrotask(() => { pending = !event.defaultPrevented && transitionEligible(link.href, location.origin); }); });
        context.on(document, 'submit', event => { const form = event.target, submitter = event.submitter; queueMicrotask(() => { pending = !event.defaultPrevented && (submitter?.formMethod || form.method).toLowerCase() === 'get' && transitionEligible(submitter?.formAction || form.action, location.origin); }); });
        context.on(window, 'pageswap', event => { const swap = event; if (!eligible() || (!pending && swap.activation?.navigationType !== 'traverse') || !transitionEligible(swap.activation?.entry?.url || '', location.origin))
            swap.viewTransition?.skipTransition(); pending = false; });
        context.on(window, 'pagereveal', event => { if (!eligible())
            event.viewTransition?.skipTransition(); });
        return { destroy() { document.documentElement.removeAttribute('data-sf-transitions'); } };
    });
})(SfMotion || (SfMotion = {}));
