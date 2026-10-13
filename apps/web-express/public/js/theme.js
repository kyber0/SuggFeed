"use strict";
(() => {
    function sfToggleTheme() {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        const saved = window.sfPreferences?.write('theme', next);
        document.documentElement.setAttribute('data-theme', next);
        if (saved === false)
            window.sfToast?.('Theme changed for this visit. Browser storage is unavailable.');
    }
    Object.assign(window, { sfToggleTheme });
})();
