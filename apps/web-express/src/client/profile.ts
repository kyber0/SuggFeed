(() => {
 const account=!!document.getElementById('sf-auth-config')?.dataset.user;
 const status=document.getElementById('profile-feedback');
 const tell=(text:string)=>{if(status)status.textContent=text;};
 function sfToggleSettings(){const panel=document.getElementById('prof-settings-panel');if(panel && innerWidth<=768)panel.classList.toggle('open');}
 function sfSetProfileTab(tab:string){
  for(const name of ['submissions','bookmarks','shared','voted']){
   const active=name===tab,button=document.getElementById('tab-btn-'+name),pane=document.getElementById('prof-pane-'+name);
   button?.classList.toggle('active',active);button?.setAttribute('aria-selected',String(active));if(pane)pane.hidden=!active;
  }
  const url=new URL(location.href);url.searchParams.set('tab',tab);history.replaceState({},'',url);
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
    remove.addEventListener('click',async()=>{remove.disabled=true;try{if(account)await request('/api/bookmarks/'+encodeURIComponent(row.id),{action:'remove'});else localStorage.setItem('sf_saved_ideas',JSON.stringify(read('sf_saved_ideas',0).filter(id=>id!==row.id)));await loadActivity();}catch(error){tell(error.message || 'The saved idea could not be removed.');remove.disabled=false;}});wrap.append(remove);
   }
   grid.append(wrap);
  }
  pane.append(grid);
  for(const id of ['count-tab-'+tab,'stat-'+({bookmarks:'bookmarks',shared:'shared',voted:'supported'}[tab])+'-count']){const count=document.getElementById(id);if(count)count.textContent=String(rows.length);}
 }
 async function loadActivity(){
  try{const data=await request('/profile/activity',{saved:read('sf_saved_ideas'),supported:read('sf_voted_ideas'),shared:read('sf_shared_ideas')});for(const tab of ['bookmarks','shared','voted'])draw(tab,data[tab]);}
  catch{tell('Activity could not load. Refresh to retry; the displayed lists may be incomplete.');}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const panel=document.getElementById('prof-settings-panel');if(innerWidth>768 || location.hash==='#prof-settings-panel')panel?.classList.add('open');
  document.querySelector<HTMLAnchorElement>('a[href="#prof-settings-panel"]')?.addEventListener('click',()=>panel?.classList.add('open'));
  try{(document.getElementById('prof-anon-toggle') as HTMLInputElement).checked=localStorage.getItem('sf_anon_default')!=='false';}catch{tell('Browser preferences are unavailable for this visit.');}
  const tab=new URLSearchParams(location.search).get('tab');if(['submissions','bookmarks','shared','voted'].includes(tab))sfSetProfileTab(tab);
  void loadActivity();
 });
 Object.assign(window,{sfToggleSettings,sfSetProfileTab,sfSaveProfilePrefs});
})();
