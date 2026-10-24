/** Shared inline owner editing; the server rechecks ownership and moderation. */
(() => {
 function hold(card:HTMLElement){
  const body=card.querySelector<HTMLElement>('.comment-body'),actions=card.querySelector<HTMLElement>('.comment-actions');if(actions?.hidden)return;
  if(body)body.textContent='This comment is awaiting administrator review.';if(actions)actions.hidden=true;const menu=card.querySelector<HTMLElement>('.comment-menu');if(menu)menu.hidden=true;
  const prefix=card.id.startsWith('drawer-')?'drawer-':'';for(const id of ['comments-header-count','mob-comment-count','jump-comment-count']){const counter=document.getElementById(prefix+id);if(counter)counter.textContent=String(Math.max(0,Number(counter.textContent||0)-1));}
 }
 Object.assign(window,{sfHoldComment:hold});
 document.addEventListener('toggle',event=>{
  const menu=event.target;if(!(menu instanceof HTMLDetailsElement)||!menu.classList.contains('comment-menu'))return;
  const panel=menu.querySelector<HTMLElement>('.comment-menu-items');if(!panel||typeof panel.showPopover!=='function')return;
  if(!menu.open){if(panel.matches(':popover-open'))panel.hidePopover();return;}
  for(const other of document.querySelectorAll<HTMLDetailsElement>('.comment-menu[open]'))if(other!==menu)other.open=false;
  if(!panel.hasAttribute('popover')){panel.setAttribute('popover','auto');panel.addEventListener('toggle',e=>{if((e as ToggleEvent).newState==='closed')menu.open=false;});}
  panel.showPopover();const rect=menu.getBoundingClientRect(),height=panel.offsetHeight;
  panel.style.left=Math.max(8,Math.min(rect.right-panel.offsetWidth,innerWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,rect.bottom+4+height<=innerHeight-8?rect.bottom+4:rect.top-height-4)+'px';
 },true);
 const closeMenus=()=>{for(const menu of document.querySelectorAll<HTMLDetailsElement>('.comment-menu[open]'))menu.open=false;};window.addEventListener('resize',closeMenus);document.addEventListener('scroll',closeMenus,{capture:true,passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const menu=document.querySelector<HTMLDetailsElement>('.comment-menu[open]');if(menu){e.preventDefault();e.stopImmediatePropagation();menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus();}}},true);
 document.addEventListener('click',event=>{
  for(const menu of document.querySelectorAll<HTMLDetailsElement>('.comment-menu[open]'))if(!menu.contains(event.target as Node)||(event.target as Element).closest('.comment-menu-items button'))menu.open=false;
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-edit-comment]');if(!button)return;
  const card=button.closest<HTMLElement>('.comment-card'),body=card?.querySelector<HTMLElement>('.comment-body');
  if(!card||!body||card.querySelector('[data-comment-editor]'))return;
  const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('textarea'),save=document.createElement('button'),cancel=document.createElement('button'),message=document.createElement('p');
  form.className='comment-editor';card.dataset.editing='true';form.dataset.commentEditor='';label.className='comment-edit-label';label.textContent='';input.className='workspace-input';input.rows=1;input.setAttribute('aria-label','Edit your comment');input.minLength=10;input.maxLength=500;input.required=true;input.value=body.textContent||'';label.append(input);save.type='submit';save.className=cancel.className='workspace-button';save.textContent='Save';cancel.type='button';cancel.textContent='Cancel';message.className='comment-edit-message';message.hidden=true;message.setAttribute('role','status');const actions=document.createElement('div');actions.className='comment-edit-actions';actions.append(save,cancel);form.append(label,actions,message);body.hidden=true;body.after(form);const resize=()=>{input.style.height='auto';input.style.height=Math.min(160,input.scrollHeight)+'px';};input.addEventListener('input',resize);resize();input.focus();input.setSelectionRange(input.value.length,input.value.length);
  const finish=()=>{body.hidden=false;form.remove();delete card.dataset.editing;const focus=button.closest('details')?.querySelector<HTMLElement>('summary')||button;focus.focus();};cancel.addEventListener('click',finish);input.addEventListener('keydown',e=>{if(e.key==='Escape'&&!save.disabled){e.preventDefault();e.stopPropagation();finish();}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',async e=>{
   e.preventDefault();e.stopPropagation();save.disabled=cancel.disabled=true;message.hidden=false;message.textContent='Saving…';
   try{const response=await sfSchoolFetch('/api/community/comments/'+encodeURIComponent(button.dataset.editComment!)+'/edit',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({body:input.value,version:Number(button.dataset.commentVersion)})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Could not save this comment.');
    if(data.data.status==='published'){body.textContent=data.data.body;button.dataset.commentVersion=String(data.data.version);finish();}
    else{hold(card);finish();}
    window.sfToast?.(data.data.status==='published'?'Comment updated.':'Your comment was saved privately for administrator review.','success');
   }catch(error){message.textContent=error instanceof Error?error.message:'Could not save. Your text is still here.';}
   finally{save.disabled=cancel.disabled=false;}
  });
 });
})();
