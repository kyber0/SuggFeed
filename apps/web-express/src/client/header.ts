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
    document.addEventListener('click', function(e) {
      if(menu.contains(e.target as Node))return;
      if (menu) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape' && !menu.hidden){menu.hidden=true;btn.setAttribute('aria-expanded','false');btn.focus();}
    });
    menu.addEventListener('focusout',function(e){
      if(e.relatedTarget && !menu.contains(e.relatedTarget as Node) && e.relatedTarget!==btn){menu.hidden=true;btn.setAttribute('aria-expanded','false');}
    });
  })();
})();
