(() => {
 const shell=document.getElementById('navigation-skeleton');
 const content=document.getElementById('page-content');
 const title=document.getElementById('navigation-title');
 const status=document.getElementById('navigation-status');
 const cancel=document.getElementById('navigation-cancel');
 if(!shell || !content)return;
 let timer:number;
 function reset(){clearTimeout(timer);shell.hidden=true;content.hidden=false;content.removeAttribute('aria-busy');document.documentElement.classList.remove('is-navigating');}
 function show(path:string){
  const section=path.startsWith('/admin')?'Staff workspace':path.startsWith('/feed')?'Community ideas':path.startsWith('/roadmap')?'Roadmap':path.startsWith('/profile')?'Your profile':path.startsWith('/notifications')?'School updates':path.startsWith('/inbox')?'School messages':path.startsWith('/idea/')?'Idea details':'SuggFeed';
  const menu=document.getElementById('header-dropdown');if(menu)menu.hidden=true;document.getElementById('header-avatar-btn')?.setAttribute('aria-expanded','false');
  shell.dataset.section=section;title.textContent=section;status.textContent='Loading '+section.toLowerCase()+'…';
  shell.hidden=false;content.hidden=true;content.setAttribute('aria-busy','true');document.documentElement.classList.add('is-navigating');
  clearTimeout(timer);timer=window.setTimeout(()=>status.textContent='Still loading. You can cancel to stay on this page.',8000);
 }
 document.addEventListener('click',event=>{
  if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
  const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
  if(!link || link.hasAttribute('download') || (link.target && link.target!=='_self') || link.closest('[data-no-navigation-loader]'))return;
  const destination=new URL(link.href,location.href);
  if(destination.origin!==location.origin || destination.protocol!==location.protocol || destination.pathname.startsWith('/api/') || destination.pathname.startsWith('/auth/'))return;
  if(destination.pathname===location.pathname && destination.search===location.search)return;
  // Keep ordinary browser navigation: start it in this click, with no fetch or
  // artificial wait. Only the old document's pending visual state changes.
  queueMicrotask(()=>{if(!event.defaultPrevented)show(destination.pathname);});
 });
 document.addEventListener('submit',event=>{
  if(event.defaultPrevented)return;const form=event.target as HTMLFormElement;
  if(form.method.toLowerCase()!=='get' || (form.target && form.target!=='_self'))return;
  const destination=new URL(form.action,location.href);if(destination.origin===location.origin && !destination.pathname.startsWith('/auth/'))queueMicrotask(()=>{if(!event.defaultPrevented)show(destination.pathname);});
 });
 cancel?.addEventListener('click',()=>{window.stop();reset();});
 window.addEventListener('pageshow',event=>{if(event.persisted)reset();});window.addEventListener('pagehide',reset);
 // Preserve the editor if the browser's unsaved-work warning cancels leaving.
 window.addEventListener('beforeunload',event=>{queueMicrotask(()=>{if(event.defaultPrevented)reset();});});
})();
