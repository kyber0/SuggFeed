// Browser source extracted from views/layout.eta.
(function () {
(function () {
      var t = localStorage.getItem('sf-theme') || 'system';
      var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    })();
})();
