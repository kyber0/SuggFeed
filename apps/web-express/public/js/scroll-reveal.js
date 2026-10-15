"use strict";
(() => {
    const container = document.getElementById('page-content');
    if (!container || !('IntersectionObserver' in window) || !('animate' in Element.prototype))
        return;
    const root = container;
    const motion = matchMedia('(prefers-reduced-motion:reduce)');
    const selector = '.post-card,.sf-idea-card,.prof-activity-card-wrap,.staff-flow-card,.roadmap-idea,.roadmap-completion-card,.analytics-card,.notification-item,.staff-row,.staff-member-card';
    let cleanup = () => { };
    function configure() {
        cleanup();
        if (motion.matches)
            return;
        const tracked = new WeakSet(), waiting = new WeakSet(), initial = new WeakSet();
        const active = new Map();
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const card = entry.target;
                if (!entry.isIntersecting) {
                    waiting.add(card);
                    continue;
                }
                observer.unobserve(card);
                // Initially visible cards already have the screen-render entrance.
                if ((initial.has(card) && !waiting.has(card)) || card.matches(':focus-within,[data-dragging="true"]') || card.closest('.is-dragging'))
                    continue;
                const animation = card.animate([{ opacity: .8, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
                active.set(card, animation);
                animation.onfinish = animation.oncancel = () => { if (active.get(card) === animation)
                    active.delete(card); };
            }
        }, { rootMargin: '0px 0px -16px 0px' });
        const visit = (node, callback) => {
            if (!(node instanceof Element))
                return;
            if (node.matches(selector))
                callback(node);
            node.querySelectorAll(selector).forEach(callback);
        };
        const watch = (card) => { if (!tracked.has(card)) {
            tracked.add(card);
            observer.observe(card);
        } };
        const forget = (card) => { observer.unobserve(card); tracked.delete(card); waiting.delete(card); active.get(card)?.cancel(); };
        visit(root, card => { initial.add(card); watch(card); });
        const mutations = new MutationObserver(records => {
            for (const record of records) {
                record.removedNodes.forEach(node => visit(node, forget));
                record.addedNodes.forEach(node => visit(node, watch));
            }
        });
        mutations.observe(root, { childList: true, subtree: true });
        const cancel = (event) => {
            if (!(event.target instanceof Element))
                return;
            const card = event.target.closest(selector);
            if (card)
                active.get(card)?.cancel();
        };
        root.addEventListener('pointerdown', cancel);
        root.addEventListener('focusin', cancel);
        cleanup = () => {
            observer.disconnect();
            mutations.disconnect();
            active.forEach(animation => animation.cancel());
            active.clear();
            root.removeEventListener('pointerdown', cancel);
            root.removeEventListener('focusin', cancel);
        };
    }
    configure();
    motion.addEventListener('change', configure);
})();
