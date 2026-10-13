// Progressive enhancement: the disclosure and real navigation links work without JS.
(() => {
  const disclosure=document.querySelector<HTMLDetailsElement>('.roadmap-other-views');
  if(!disclosure)return;
  const preferences=(window as any).sfPreferences;
  document.querySelectorAll<HTMLAnchorElement>('[data-roadmap-view]').forEach(link=>link.addEventListener('click',()=>{
    preferences?.write('roadmapView',new URL(link.href).searchParams.get('view') || 'board');
  }));
  const preferred=preferences?.read('roadmapView');
  if(preferred && !new URLSearchParams(location.search).has('view')) {
    const link=document.createElement('a');link.className='workspace-button';
    link.href='/roadmap?'+new URLSearchParams({view:preferred});link.textContent='Open your preferred '+({tree:'category',done:'completed',board:'board',timeline:'timeline'}[preferred])+' view';disclosure.after(link);
  }
  const trigger=disclosure.querySelector<HTMLElement>('summary')!;
  const links=Array.from(disclosure.querySelectorAll<HTMLAnchorElement>('[data-roadmap-view]'));
  document.addEventListener('click',event=>{if(disclosure.open && !disclosure.contains(event.target as Node))disclosure.open=false;});
  document.addEventListener('focusin',event=>{if(disclosure.open && !disclosure.contains(event.target as Node))disclosure.open=false;});
  disclosure.addEventListener('keydown',event=>{
    if(event.key==='Escape' && disclosure.open){event.preventDefault();event.stopPropagation();disclosure.open=false;trigger.focus();return;}
    const index=links.indexOf(event.target as HTMLAnchorElement);
    if(event.target===trigger && event.key==='ArrowDown'){event.preventDefault();disclosure.open=true;links[0]?.focus();return;}
    if(index<0)return;
    const next=event.key==='ArrowDown'?(index+1)%links.length:event.key==='ArrowUp'?(index+links.length-1)%links.length:event.key==='Home'?0:event.key==='End'?links.length-1:-1;
    if(next>=0){event.preventDefault();links[next].focus();}
  });
})();
