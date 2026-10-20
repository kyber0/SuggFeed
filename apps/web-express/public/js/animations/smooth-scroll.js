"use strict";
var SfMotion;
(function (SfMotion) {
    let vendor;
    function loadLenis() {
        if (window.Lenis)
            return Promise.resolve();
        if (!vendor)
            vendor = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = '/js/vendor/lenis.js?v=1.3.23'; script.async = true; script.onload = () => { script.onload = script.onerror = null; resolve(); }; script.onerror = () => { script.onload = script.onerror = null; script.remove(); reject(new Error('Native scroll fallback')); }; document.head.append(script); }).catch(() => { vendor = undefined; });
        return vendor;
    }
    SfMotion.factories.push(context => {
        let disposed = false, paused = false, nativeOnly = false, frame = 0, instance;
        const stopFrame = () => { cancelAnimationFrame(frame); frame = 0; };
        const tick = (time) => { frame = 0; if (disposed || paused || !instance)
            return; instance.raf(time); if (instance.isScrolling)
            frame = requestAnimationFrame(tick); };
        const wake = () => { if (!frame && instance && !paused)
            frame = requestAnimationFrame(tick); };
        if (!SfMotion.editing() && !context.reduced.matches && context.fine.matches && !SfMotion.saveData())
            void loadLenis().then(() => {
                if (disposed || nativeOnly || context.reduced.matches || !context.fine.matches || !window.Lenis)
                    return;
                try {
                    instance = new window.Lenis({ autoRaf: false, duration: SfMotion.config.scroll / 1000, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true, syncTouch: false, anchors: false, allowNestedScroll: true, prevent: (node) => Boolean(node.closest('dialog,[role="dialog"],textarea,table,.studio-canvas,.roadmap-lane,[data-lenis-prevent],[data-sf-native-scroll]')) });
                    if (paused)
                        instance.stop();
                }
                catch {
                    instance?.destroy();
                    instance = undefined;
                }
            });
        context.on(window, 'wheel', wake, { passive: true });
        context.on(window, 'keydown', event => {
            const key = event;
            const find = (key.ctrlKey || key.metaKey) && key.key.toLowerCase() === 'f';
            const typing = event.target instanceof Element && Boolean(event.target.closest('input,textarea,select,[contenteditable]'));
            const scrolling = !typing && !key.ctrlKey && !key.metaKey && ['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' '].includes(key.key);
            if (!key.defaultPrevented && (find || scrolling)) {
                nativeOnly = true;
                stopFrame();
                instance?.destroy();
                instance = undefined;
            }
        });
        return { pause(value) { paused = value; stopFrame(); if (value)
                instance?.stop();
            else {
                instance?.start();
                instance?.resize();
            } }, destroy() { disposed = true; stopFrame(); instance?.destroy(); instance = undefined; } };
    });
})(SfMotion || (SfMotion = {}));
