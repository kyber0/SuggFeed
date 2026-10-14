(() => {
  const navigation = document.querySelector<HTMLDetailsElement>('.staff-navigation-disclosure');
  if (!navigation) return;
  const desktop = matchMedia('(min-width:801px)');
  navigation.open = desktop.matches;
  const toggle=document.getElementById('staff-sidebar-toggle') as HTMLButtonElement;
  const content=document.getElementById('staff-sidebar-content')!;
  let collapsed=window.sfPreferences?.read('staffSidebar')==='collapsed';
  function sidebar(){
    const hidden=desktop.matches && collapsed;
    document.documentElement.dataset.staffSidebar=collapsed?'collapsed':'expanded';
    content.hidden=hidden;
    toggle.setAttribute('aria-expanded',String(!hidden));
    toggle.setAttribute('aria-label',hidden?'Show sidebar':'Hide sidebar');
    toggle.title=hidden?'Show sidebar':'Hide sidebar';
    toggle.querySelector('span')!.textContent=hidden?'Show sidebar':'Hide sidebar';
  }
  toggle.addEventListener('click',()=>{collapsed=!collapsed;window.sfPreferences?.write('staffSidebar',collapsed?'collapsed':'expanded');sidebar();});
  desktop.addEventListener('change', event => {navigation.open = event.matches;sidebar();});
  sidebar();
})();
