"use strict";
(() => {
    const node = document.getElementById('school-presentation-data');
    if (!node)
        return;
    const p = JSON.parse(node.textContent || '{}');
    Object.assign(window, { sfSchoolCustomization: p, sfSchoolStatusLabel: (status) => p.labels?.[status] || status.replace(/_/g, ' ') });
    SfSchoolColors.apply(document.body, p.palette);
    const applyDesign = () => { SfSchoolDesign.apply(document.body, p.design, document.body.dataset.schoolPage || SfSchoolDesign.page(location.pathname), p.palette); const form = document.getElementById('submit-panel'); if (form)
        SfSchoolDesign.apply(form, p.design, 'submit', p.palette); };
    const prefix = document.querySelector('meta[name="school-base"]')?.content || '';
    function apply() {
        applyDesign();
        if (!p.features.roadmap)
            for (const link of document.querySelectorAll('a[href]')) {
                try {
                    const url = new URL(link.href);
                    if (url.origin === location.origin && (url.pathname === prefix + '/roadmap' || url.pathname.startsWith(prefix + '/roadmap/')))
                        link.hidden = true;
                }
                catch { }
            }
        for (const label of document.querySelectorAll('[data-school-status]')) {
            const text = p.labels[label.dataset.schoolStatus];
            if (text && label.textContent !== text)
                label.textContent = text;
        }
    }
    document.addEventListener('click', event => { const button = event.target.closest('[data-school-submit-category]'); if (button) {
        event.preventDefault();
        window.openSubmitPanel?.(button.dataset.schoolSubmitCategory);
    } });
    document.addEventListener('DOMContentLoaded', () => { apply(); const observer = new MutationObserver(records => { if (records.some(r => r.addedNodes.length))
        apply(); }); observer.observe(document.getElementById('page-content') || document.body, { childList: true, subtree: true }); });
})();
