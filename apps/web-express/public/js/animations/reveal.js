"use strict";
var SfMotion;
(function (SfMotion) {
    SfMotion.revealSelector = '[data-sf-reveal],.post-card,.sf-idea-card,.prof-activity-card-wrap,.staff-flow-card,.roadmap-idea,.roadmap-completion-card,.analytics-card,.notification-item,.staff-member-card,.school-card,.platform-card,.account-panel,.account-flow-card,.platform-panel,.school-settings-section,.invites-composer,.sf-legal-header,.system-empty-state,.sf-empty,.error-shell,.account-security-card,.workspace-heading,.feed-heading-group,.roadmap-heading,.prof-hero-info,.sf-hero-subtitle,.sf-hero-actions,.care-card';
    SfMotion.factories.push(context => {
        const tracked = new Set(), active = new Map();
        let paused = false;
        const cancel = (el) => { active.get(el)?.forEach(animation => animation.cancel()); active.delete(el); };
        const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
            const groups = new Map();
            for (const entry of entries) {
                const el = entry.target;
                if (!entry.isIntersecting || paused)
                    continue;
                observer?.unobserve(el);
                if (context.seen.has(el) || SfMotion.blocked(el) || el.matches(':focus-within'))
                    continue;
                context.seen.add(el);
                const parent = el.closest('[data-sf-stagger]') || el.parentElement, index = groups.get(parent) || 0;
                groups.set(parent, index + 1);
                const restrained = el.matches('.account-flow-card,.sf-empty,.sf-legal-header') || Boolean(el.querySelector('form,input,textarea,select,table'));
                const options = { duration: restrained ? SfMotion.config.page : SfMotion.config.reveal, delay: SfMotion.staggerDelay(index), easing: SfMotion.config.ease };
                const animations = [el.animate([{ opacity: .85 }, { opacity: 1 }], options)];
                if (!context.reduced.matches && !restrained)
                    animations.push(el.animate([{ transform: `translateY(${innerWidth < 768 ? SfMotion.config.mobileDistance : SfMotion.config.distance}px)` }, { transform: 'translateY(0)' }], { ...options, composite: 'add' }));
                active.set(el, animations);
                animations[0].onfinish = () => active.delete(el);
            }
        }, { threshold: SfMotion.config.threshold, rootMargin: '0px 0px -12px 0px' }) : undefined;
        const remove = (root) => { for (const el of tracked)
            if (root === el || (root instanceof Node && root.contains(el))) {
                observer?.unobserve(el);
                cancel(el);
                el.removeAttribute('data-sf-motion-item');
                tracked.delete(el);
            } };
        const refresh = (root) => { if (!Element.prototype.animate)
            return; for (const el of SfMotion.elements(root, SfMotion.revealSelector)) {
            if (tracked.has(el) || SfMotion.blocked(el) || el.closest('thead,tbody,tfoot') || el.parentElement?.closest(SfMotion.revealSelector))
                continue;
            tracked.add(el);
            el.setAttribute('data-sf-motion-item', '');
            if (!context.seen.has(el))
                observer?.observe(el);
        } };
        const interrupt = (event) => { if (!(event.target instanceof Element))
            return; const el = event.target.closest('[data-sf-motion-item]'); if (el) {
            context.seen.add(el);
            observer?.unobserve(el);
            cancel(el);
        } };
        for (const type of ['pointerdown', 'focusin', 'dragstart'])
            context.on(document, type, interrupt, { capture: true });
        return { refresh, remove, pause(value) { paused = value; if (value)
                active.forEach((_animations, el) => cancel(el));
            else
                for (const el of tracked)
                    if (!context.seen.has(el))
                        observer?.observe(el); }, destroy() { observer?.disconnect(); active.forEach((_animations, el) => cancel(el)); tracked.forEach(el => el.removeAttribute('data-sf-motion-item')); tracked.clear(); } };
    });
})(SfMotion || (SfMotion = {}));
