"use strict";
// Browser source extracted from views/profile.eta.
(function () {
    function sfToggleSettings() {
        // Only acts as accordion on mobile; on desktop the body is always visible
        if (window.innerWidth > 768)
            return;
        const panel = document.getElementById('prof-settings-panel');
        const isOpen = panel.classList.contains('open');
        panel.classList.toggle('open', !isOpen);
    }
    function sfSetProfileTab(tab) {
        ['submissions', 'bookmarks', 'shared', 'voted'].forEach(t => {
            const active = t === tab;
            const btn = document.getElementById(`tab-btn-${t}`);
            const pane = document.getElementById(`prof-pane-${t}`);
            if (btn) {
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-selected', String(active));
            }
            if (pane) {
                if (active)
                    pane.removeAttribute('hidden');
                else
                    pane.setAttribute('hidden', '');
            }
        });
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tab);
            window.history.replaceState({}, '', url.toString());
        }
        catch (e) { }
    }
    function sfSaveProfilePrefs() {
        const btn = document.getElementById('btn-save-prefs');
        const name = document.getElementById('prof-display-name').value.trim();
        const anon = document.getElementById('prof-anon-toggle').checked;
        const notifs = document.getElementById('prof-notifs-toggle')?.checked ?? false;
        localStorage.setItem('sf_display_name', name);
        localStorage.setItem('sf_anon_default', String(anon));
        localStorage.setItem('sf_email_notifs', String(notifs));
        const orig = btn.textContent;
        btn.textContent = '✓ Saved!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
        if (window.sfToast)
            sfToast('Preferences saved!', 'success');
    }
    // Hydrate local storage + URL tab on load
    document.addEventListener('DOMContentLoaded', function () {
        try {
            // Auto-open settings on desktop; collapsed by default on mobile
            const panel = document.getElementById('prof-settings-panel');
            if (panel) {
                if (window.innerWidth > 768) {
                    panel.classList.add('open');
                }
            }
            const savedName = localStorage.getItem('sf_display_name');
            const nameEl = document.getElementById('prof-display-name');
            if (savedName && nameEl)
                nameEl.value = savedName;
            const anonEl = document.getElementById('prof-anon-toggle');
            if (anonEl)
                anonEl.checked = localStorage.getItem('sf_anon_default') === 'true';
            const notifsEl = document.getElementById('prof-notifs-toggle');
            if (notifsEl)
                notifsEl.checked = localStorage.getItem('sf_email_notifs') === 'true';
            // Voted count from local storage
            const voted = JSON.parse(localStorage.getItem('sf_voted') || '[]');
            const statVoted = document.getElementById('stat-supported-count');
            const countVoted = document.getElementById('count-tab-voted');
            if (statVoted)
                statVoted.textContent = voted.length;
            if (countVoted)
                countVoted.textContent = voted.length;
            // Check tab param in URL
            const params = new URLSearchParams(window.location.search);
            const tabParam = params.get('tab');
            if (tabParam && ['submissions', 'bookmarks', 'shared', 'voted'].includes(tabParam)) {
                sfSetProfileTab(tabParam);
            }
        }
        catch (e) { }
    });
    Object.assign(window, { sfToggleSettings, sfSetProfileTab, sfSaveProfilePrefs });
})();
