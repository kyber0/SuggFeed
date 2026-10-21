"use strict";
// Keep fixed forms inside the visible area when a mobile keyboard opens.
(() => {
    const viewport = window.visualViewport;
    if (!viewport)
        return;
    let frame = 0;
    const update = () => { frame = 0; const root = document.documentElement; root.style.setProperty('--sf-viewport-height', viewport.height + 'px'); root.style.setProperty('--sf-viewport-top', viewport.offsetTop + 'px'); root.toggleAttribute('data-virtual-keyboard', window.innerHeight - viewport.height > 120 && viewport.scale === 1); };
    const schedule = () => { if (!frame)
        frame = requestAnimationFrame(update); };
    const start = () => { viewport.addEventListener('resize', schedule); viewport.addEventListener('scroll', schedule); update(); };
    const stop = () => { viewport.removeEventListener('resize', schedule); viewport.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); frame = 0; };
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', start);
    start();
})();
(() => {
    const controls = document.querySelector('.studio-preview-controls');
    if (!controls)
        return;
    const desktop = matchMedia('(min-width:1024px)');
    controls.open = desktop.matches;
    desktop.addEventListener('change', event => { controls.open = event.matches; });
})();
(() => {
    const navigation = document.querySelector('.staff-navigation-disclosure');
    if (!navigation)
        return;
    const desktop = matchMedia('(min-width:801px)');
    navigation.open = desktop.matches;
    const toggle = document.getElementById('staff-sidebar-toggle');
    const content = document.getElementById('staff-sidebar-content');
    let collapsed = window.sfPreferences?.read('staffSidebar') === 'collapsed';
    function sidebar() {
        const hidden = desktop.matches && collapsed;
        document.documentElement.dataset.staffSidebar = collapsed ? 'collapsed' : 'expanded';
        content.hidden = hidden;
        toggle.setAttribute('aria-expanded', String(!hidden));
        toggle.setAttribute('aria-label', hidden ? 'Show sidebar' : 'Hide sidebar');
        toggle.title = hidden ? 'Show sidebar' : 'Hide sidebar';
        toggle.querySelector('span').textContent = hidden ? 'Show sidebar' : 'Hide sidebar';
    }
    toggle.addEventListener('click', () => { collapsed = !collapsed; window.sfPreferences?.write('staffSidebar', collapsed ? 'collapsed' : 'expanded'); sidebar(); });
    desktop.addEventListener('change', event => { navigation.open = event.matches; sidebar(); });
    sidebar();
})();
