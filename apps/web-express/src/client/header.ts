// Browser source extracted from views/partials/header.eta.
(function () {
(function() {
    var btn = (document.getElementById('header-avatar-btn') as HTMLButtonElement);
    var menu = (document.getElementById('header-dropdown') as HTMLElement);
    if (!btn || !menu) return;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var open = !menu.hidden;
      menu.hidden = open;
      btn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', function() {
      if (menu) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
  })();
})();
