(() => {
 const account=!!document.getElementById('sf-auth-config')?.dataset.user;
 const status=document.getElementById('profile-feedback');
 const tell=(text:string)=>{if(status)status.textContent=text;};
 function settings(open:boolean){
  document.getElementById('prof-settings-panel')?.classList.toggle('open',open);
  document.getElementById('prof-settings-header')?.setAttribute('aria-expanded',String(open));
  const body=document.getElementById('prof-settings-body');if(body)body.hidden=!open;
 }
 function sfToggleSettings(){settings(document.getElementById('prof-settings-header')?.getAttribute('aria-expanded')!=='true');}
 let selectedTab='submissions';
 const activity=new Map<string,{rows:any[];next:any;loaded:boolean;busy:boolean}>();
 function sfSetProfileTab(tab:string){
  selectedTab=tab;
  for(const name of ['submissions','bookmarks','shared','voted']){
   const active=name===tab,button=document.getElementById('tab-btn-'+name),pane=document.getElementById('prof-pane-'+name);
   button?.classList.toggle('active',active);button?.setAttribute('aria-selected',String(active));button?.setAttribute('tabindex',active?'0':'-1');if(pane)pane.hidden=!active;
  }
  const url=new URL(location.href);url.searchParams.set('tab',tab);history.replaceState({},'',url);
  if(tab!=='submissions' && !activity.get(tab)?.loaded)void loadActivity(tab);
 }
 const read=(key:string,limit=200):string[]=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(id=>typeof id==='string' && /^[a-f0-9-]{36}$/i.test(id)).slice(limit?-limit:0):[];}catch{return [];}};
 async function request(path:string,body:unknown){
  const response=await fetch(path,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok || !data.success)throw new Error(data.error || 'This change could not be confirmed. Refresh before retrying.');return data;
 }
 async function sfSaveProfilePrefs(){
  const button=document.getElementById('btn-save-prefs') as HTMLButtonElement;if(button.disabled)return;
  const name=(document.getElementById('prof-display-name') as HTMLInputElement).value.trim();
  const anon=(document.getElementById('prof-anon-toggle') as HTMLInputElement).checked;
  const notifications=(document.getElementById('prof-notifs-toggle') as HTMLInputElement)?.checked || false;
  button.disabled=true;tell('Saving preferences…');let savedAccount=false;
  try{
   if(account){await request('/profile/preferences',{display_name:name,email_notifications_enabled:notifications});savedAccount=true;const heading=document.querySelector<HTMLElement>('.prof-hero-name');if(heading)heading.textContent=name || 'Community Member';}
   localStorage.setItem('sf_anon_default',String(anon));
   tell(account?'Account preferences saved. Your fresh-draft default is saved on this browser.':'Fresh-draft preference saved on this browser. Named submissions require sign-in.');
   window.sfToast?.('Preferences saved.','success');
  }catch(error){tell(savedAccount?'Account preferences saved, but this browser could not remember your fresh-draft default.':error.name==='SecurityError' || error.name==='QuotaExceededError'?'Browser storage is unavailable. This preference was not saved.':error.message);}
  finally{button.disabled=false;}
 }
 function draw(tab:string,rows:any[]){
  const pane=document.getElementById('prof-pane-'+tab)!;
  pane.replaceChildren();const grid=document.createElement('div');grid.className='prof-activity-grid';
  if(!rows.length){const empty=document.createElement('p');empty.className='prof-empty-state';empty.textContent='No '+({bookmarks:'saved',shared:'shared',voted:'supported'}[tab])+' public ideas in this list yet.';pane.append(empty);}
  for(const row of rows){
   const wrap=document.createElement('div');wrap.className='prof-activity-card-wrap';
   const link=document.createElement('a');link.className='prof-activity-card';link.href='/idea/'+encodeURIComponent(row.id);
   const heading=document.createElement('h3');heading.className='prof-activity-title';heading.textContent=row.title;
   const detail=document.createElement('p');detail.textContent=(row.categories?.name || 'Other')+' · '+({approved:'Planned',in_progress:'In progress',resolved:'Completed'}[row.status] || 'Public idea')+' · '+row.vote_count+' supporters';
   link.append(heading,detail);wrap.append(link);
   if(tab==='bookmarks'){
    const remove=document.createElement('button');remove.type='button';remove.className='workspace-button';remove.textContent='Remove saved idea';
    remove.addEventListener('click',async()=>{remove.disabled=true;try{if(account)await request('/api/bookmarks/'+encodeURIComponent(row.id),{action:'remove'});else localStorage.setItem('sf_saved_ideas',JSON.stringify(read('sf_saved_ideas',0).filter(id=>id!==row.id)));activity.delete('bookmarks');await loadActivity('bookmarks');}catch(error){tell(error.message || 'The saved idea could not be removed.');remove.disabled=false;}});wrap.append(remove);
   }
   grid.append(wrap);
  }
  pane.append(grid);
  for(const id of ['count-tab-'+tab,'stat-'+({bookmarks:'bookmarks',shared:'shared',voted:'supported'}[tab])+'-count']){const count=document.getElementById(id);if(count)count.textContent=String(rows.length);}
 }
 async function loadActivity(tab=selectedTab){
  if(tab==='submissions')return;
  const state=activity.get(tab) || {rows:[],next:{offset:0,local:!account},loaded:false,busy:false};
  if(state.busy || (state.loaded && !state.next))return;
  activity.set(tab,state);state.busy=true;
  const pane=document.getElementById('prof-pane-'+tab)!;pane.setAttribute('aria-busy','true');
  if(!state.loaded)pane.textContent='Loading your activity…';
  pane.querySelectorAll<HTMLButtonElement>('[data-activity-more]').forEach(button=>button.disabled=true);
  const retry=document.getElementById('profile-activity-retry') as HTMLButtonElement;retry.hidden=true;
  try{
   const key={bookmarks:'sf_saved_ideas',voted:'sf_voted_ideas',shared:'sf_shared_ideas'}[tab];
   const data=await request('/profile/activity',{tab,...state.next,ids:read(key).reverse()});
   if(activity.get(tab)!==state)return;
   const seen=new Set(state.rows.map(row=>row.id));state.rows.push(...data.rows.filter(row=>!seen.has(row.id)));state.next=data.next;state.loaded=true;
   const restoreFocus=pane.contains(document.activeElement);
   draw(tab,state.rows);
   const note=document.createElement('p');note.textContent=state.rows.length+' public ideas shown'+(state.next?' · More activity available':'');pane.append(note);
   if(state.next){const more=document.createElement('button');more.type='button';more.className='workspace-button';more.dataset.activityMore='';more.textContent='Load more activity';more.addEventListener('click',()=>void loadActivity(tab));pane.append(more);}
   if(restoreFocus && selectedTab===tab)pane.focus();
  }catch{
   if(!state.loaded)pane.textContent='Activity could not load.';
   let retryButton=pane.querySelector<HTMLButtonElement>('[data-activity-more]');
   if(!retryButton){retryButton=document.createElement('button');retryButton.type='button';retryButton.className='workspace-button';retryButton.dataset.activityMore='';retryButton.addEventListener('click',()=>void loadActivity(tab));pane.append(retryButton);}
   retryButton.textContent='Retry activity';retryButton.disabled=false;
  }finally{state.busy=false;pane.setAttribute('aria-busy','false');}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const textSize=document.getElementById('profile-text-size') as HTMLSelectElement;textSize.value=window.sfPreferences?.read('textSize') || 'compact';
  textSize.addEventListener('change',()=>{document.documentElement.dataset.textSize=textSize.value;const saved=window.sfPreferences?.write('textSize',textSize.value);tell(saved?'Text size saved on this browser.':'Text size changed for this visit. Browser storage is unavailable.');});
  const desktop=matchMedia('(min-width:769px)');settings(desktop.matches || location.hash==='#prof-settings-panel');
  desktop.addEventListener('change',event=>settings(event.matches));
  document.querySelector<HTMLAnchorElement>('a[href="#prof-settings-panel"]')?.addEventListener('click',()=>settings(true));
  document.getElementById('profile-activity-retry')?.addEventListener('click',()=>void loadActivity());
  const tabs=['submissions','bookmarks','shared','voted'];
  document.querySelector<HTMLElement>('.prof-activity-tabs')?.addEventListener('keydown',(event:KeyboardEvent)=>{
   const button=(event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');if(!button)return;
   const index=tabs.indexOf(button.id.replace('tab-btn-',''));
   const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
   if(next<0)return;event.preventDefault();sfSetProfileTab(tabs[next]);document.getElementById('tab-btn-'+tabs[next])?.focus();
  });
  try{(document.getElementById('prof-anon-toggle') as HTMLInputElement).checked=localStorage.getItem('sf_anon_default')!=='false';}catch{tell('Browser preferences are unavailable for this visit.');}
  const tab=new URLSearchParams(location.search).get('tab');if(['submissions','bookmarks','shared','voted'].includes(tab))sfSetProfileTab(tab);

 });
 Object.assign(window,{sfToggleSettings,sfSetProfileTab,sfSaveProfilePrefs});
})();
