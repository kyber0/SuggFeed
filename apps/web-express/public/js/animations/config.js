"use strict";
var SfMotion;
(function (SfMotion) {
    SfMotion.config = Object.freeze({ interaction: 200, page: 240, story: 600, storyOverlap: 100, storyPerspective: 1100, storyAngle: 78, reveal: 400, word: 400, headline: 720, stagger: 40, maxDelay: 160, scroll: 650, distance: 12, mobileDistance: 6, magnet: 4, marqueeSpeed: 24, ease: 'cubic-bezier(.22,1,.36,1)', threshold: .08 });
    SfMotion.factories = [];
    function elements(root, selector) { const found = [...root.querySelectorAll(selector)]; if (root instanceof HTMLElement && root.matches(selector))
        found.unshift(root); return found; }
    SfMotion.elements = elements;
    function editing() { return document.body.classList.contains('studio-host') || document.documentElement.dataset.studioMode === 'edit'; }
    SfMotion.editing = editing;
    function saveData() { return Boolean(navigator.connection?.saveData); }
    SfMotion.saveData = saveData;
    function blocked(el) { return editing() || Boolean(el.closest('[data-sf-motion="off"],.studio-overlay,.studio-frame-outline,.studio-frame-label,.studio-frame-banner,.studio-canvas,.is-dragging,[data-dragging="true"],dialog,[role="dialog"],table,textarea,[data-lenis-prevent]')); }
    SfMotion.blocked = blocked;
})(SfMotion || (SfMotion = {}));
