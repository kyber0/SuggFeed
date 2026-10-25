/** Progressive student navigation helpers; no private content or receipts are persisted. */
(() => {
  if(document.documentElement.dataset.studentExperienceReady)return;
  document.documentElement.dataset.studentExperienceReady='true';
  document.querySelector<HTMLButtonElement>('[data-student-signin]')?.addEventListener('click',()=>window.openAuthModal?.());
  const back=document.querySelector<HTMLAnchorElement>('.standalone-idea-page .idea-header-back');
  if(back&&document.referrer){
    try{const previous=new URL(document.referrer),base=document.querySelector<HTMLMetaElement>('meta[name="school-base"]')?.content||'';
      if(previous.origin===location.origin&&[base+'/feed',base+'/roadmap'].includes(previous.pathname)){back.href=previous.pathname+previous.search;const label=back.querySelector('span');if(label&&previous.pathname.endsWith('/roadmap'))label.textContent='Back to progress';}
    }catch{/* Ordinary Back to ideas remains available. */}
  }
  const profile=document.querySelector<HTMLElement>('[data-profile-section]');
  if(profile&&location.hash==='#prof-settings-panel'&&profile.dataset.profileSection!=='account'){
    const url=new URL(location.href);url.searchParams.set('section','account');url.hash='';location.replace(url.href);
  }
})();
