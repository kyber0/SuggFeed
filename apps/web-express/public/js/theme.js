"use strict";
// Browser source extracted from views/layout.eta.
(function () {
    function sfToggleTheme() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var next = isDark ? 'light' : 'dark';
        localStorage.setItem('sf-theme', next);
        document.documentElement.setAttribute('data-theme', next);
    }
    Object.assign(window, { sfToggleTheme });
})();
