/** Shared inline owner editing; the server rechecks ownership and moderation. */
(() => {
 function hold(card:HTMLElement){
  if(card.dataset.commentPendingItem){card.closest('[data-comment-pending]')?.dispatchEvent(new CustomEvent('sf:pending-refresh',{bubbles:true}));return;}
  const body=card.querySelector<HTMLElement>('.comment-body'),actions=card.querySelector<HTMLElement>('.comment-actions');if(actions?.hidden)return;
  if(body)body.textContent='This comment is awaiting administrator review.';if(actions)actions.hidden=true;const menu=card.querySelector<HTMLElement>('.comment-menu');if(menu)menu.hidden=true;
  const prefix=card.id.startsWith('drawer-')?'drawer-':'';for(const id of ['comments-header-count','mob-comment-count','jump-comment-count']){const counter=document.getElementById(prefix+id);if(counter)counter.textContent=String(Math.max(0,Number(counter.textContent||0)-1));}
 }

 interface PublishedComment {id:string;submission_id:string;body:string;parent_id?:string|null;version:number;text_revision:number;display_name?:string;created_at:string;}
 function publishIntoDiscussion(item:PublishedComment){
  document.querySelectorAll<HTMLElement>('[data-comment-pending]').forEach(container=>{
   if(container.dataset.commentPending!==item.submission_id)return;
   const drawer=container.id==='drawer-comment-pending',prefix=drawer?'drawer-':'',list=document.getElementById(prefix+'comments-list');
   if(!list)return;
   const existing=document.getElementById(prefix+'comment-'+item.id);
   if(existing?.dataset.editing)return;
   const create=drawer?typeof sfCreateCommentCardEl==='function'?sfCreateCommentCardEl:null:typeof sfCreateStandaloneCommentCardEl==='function'?sfCreateStandaloneCommentCardEl:null;
   if(!create)return;
   const parent=item.parent_id?document.getElementById(prefix+'comment-'+item.parent_id):null,card=create(item,!!parent);
   const counted=existing&&!existing.querySelector<HTMLElement>('.comment-actions')?.hidden;
   if(existing)existing.replaceWith(card);
   else if(parent){let thread=parent.nextElementSibling;if(!thread?.classList.contains('comment-replies-thread')){thread=document.createElement('div');thread.className='comment-replies-thread';parent.after(thread);}thread.append(card);}
   else list.append(card);
   document.getElementById(prefix+'comment-empty')?.remove();
   if(!counted)for(const id of ['comments-header-count','mob-comment-count','jump-comment-count']){const counter=document.getElementById(prefix+id);if(counter)counter.textContent=String((Number(counter.textContent)||0)+1);}
  });
 }
 Object.assign(window,{sfHoldComment:hold});
 interface PendingComment {id:string;body:string;version:number;text_revision:number;}
 const pendingRequests=new WeakMap<HTMLElement,AbortController>();
 async function loadPending(container:HTMLElement){
  pendingRequests.get(container)?.abort();
  if(document.getElementById('school-studio-data')||!document.getElementById('sf-auth-config')?.dataset.user || !container.dataset.commentPending){container.hidden=true;return;}
  const request=new AbortController();pendingRequests.set(container,request);
  const id=container.dataset.commentPending,status=container.querySelector<HTMLElement>('[data-pending-status]')!,list=container.querySelector<HTMLElement>('[data-pending-list]')!;
  // Never carry another idea's private text into a reused drawer.
  if(container.dataset.loadedIdea!==id){list.replaceChildren();container.hidden=true;container.dataset.loadedIdea=id;}
  status.textContent='Loading your pending comments…';const timer=setTimeout(()=>request.abort(),15000);
  try{
   const response=await sfSchoolFetch('/api/community/comments/mine/'+encodeURIComponent(id),{signal:request.signal,cache:'no-store',headers:{Accept:'application/json'}});
   const data=await response.json();if(!response.ok||!data.success)throw new Error('Your pending comments could not load. Use Refresh to try again.');
   if(pendingRequests.get(container)!==request||container.dataset.commentPending!==id)return;
   // Keep an active editor intact. Its save performs a fresh revision check.
   if(list.querySelector('[data-comment-editor]')){status.textContent='Finish editing before refreshing this list.';return;}
   list.replaceChildren();const items:PendingComment[]=Array.isArray(data.items)?data.items:[];
   for(const item of items){
    const card=document.createElement('article'),body=document.createElement('p'),edit=document.createElement('button'),label=document.createElement('small');
    card.className='comment-card';card.dataset.commentPendingItem='true';body.className='comment-body';body.textContent=item.body;
    label.textContent='Awaiting school review · visible only to you and school administrators';edit.type='button';edit.className='workspace-button';edit.textContent='Revise comment';edit.dataset.editComment=item.id;edit.dataset.commentVersion=String(item.version);
    card.append(label,body,edit);list.append(card);
   }
   container.hidden=!items.length;status.textContent=items.length+' pending · latest 50 shown. You can revise your text while it is waiting.';
   if(items.length&&container instanceof HTMLDetailsElement)container.open=true;
  }catch(error){if(pendingRequests.get(container)!==request)return;container.hidden=false;status.textContent=request.signal.aborted?'Request timed out. Use Refresh to try again.':error instanceof Error?error.message:'Pending comments could not load.';}finally{clearTimeout(timer);}
 }
 document.addEventListener('sf:pending-refresh',event=>{const container=event.target;if(container instanceof HTMLElement&&container.matches('[data-comment-pending]'))void loadPending(container);});
 document.querySelectorAll<HTMLElement>('[data-comment-pending]').forEach(container=>{if(container.dataset.commentPending)void loadPending(container);});
 document.addEventListener('click',async event=>{
  const target=event.target;if(!(target instanceof Element))return;
  const refresh=target.closest('[data-pending-refresh]');if(refresh){const container=refresh.closest<HTMLElement>('[data-comment-pending]');if(container)void loadPending(container);}
  const read=target.closest<HTMLButtonElement>('[data-comment-notice-read]');if(!read)return;
  read.disabled=true;read.textContent='Saving…';
  try{const response=await sfSchoolFetch('/api/community/comments/notices/'+encodeURIComponent(read.dataset.commentNoticeRead! )+'/read',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();read.textContent='Read';}
  catch{read.disabled=false;read.textContent='Retry mark read';}
 });
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
   try{const response=await sfSchoolFetch('/api/community/comments/'+encodeURIComponent(button.dataset.editComment!)+'/edit',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({body:input.value,version:Number(button.dataset.commentVersion)})});const data=await response.json();
    if(response.status===409){
     form.querySelector('[data-edit-conflict]')?.remove();const conflict=document.createElement('div'),latest=document.createElement('blockquote'),refresh=document.createElement('button');conflict.dataset.editConflict='';refresh.type='button';refresh.className='workspace-button';refresh.textContent='Load latest saved revision';conflict.append(refresh,latest);form.append(conflict);
     refresh.addEventListener('click',async()=>{
      refresh.disabled=true;
      try{const currentResponse=await sfSchoolFetch('/api/community/comments/'+encodeURIComponent(button.dataset.editComment!)+'/current',{cache:'no-store',signal:AbortSignal.timeout(15000)});const current=await currentResponse.json();if(!currentResponse.ok||!current.data)throw new Error('The latest revision could not load.');
       latest.textContent=current.data.body||'This comment text has been removed.';
       if(['hidden','deleted'].includes(current.data.status)){refresh.textContent='School review has resolved this comment';message.textContent='Your draft is unchanged. This comment can no longer be edited.';save.disabled=true;form.dataset.editUnavailable='true';return;}
       button.dataset.commentVersion=String(current.data.version);refresh.textContent='Latest revision loaded';message.textContent='Latest saved text is shown below. Your draft is unchanged; review both before saving.';
      }catch(error){refresh.disabled=false;message.textContent=error instanceof Error?error.message:'Could not load the latest revision.';}
     });
    }
    if(!response.ok||!data.success)throw new Error(data.error||'Could not save this comment.');
    if(data.data.status==='published'){body.textContent=data.data.body;button.dataset.commentVersion=String(data.data.version);const report=card.querySelector<HTMLElement>('[data-report-comment]');if(report)report.dataset.commentTextRevision=String(data.data.text_revision);finish();publishIntoDiscussion(data.data);}
    else{hold(card);finish();}
    document.querySelectorAll<HTMLElement>('[data-comment-pending]').forEach(container=>{if(container.dataset.commentPending)container.dispatchEvent(new CustomEvent('sf:pending-refresh',{bubbles:true}));});
    window.sfToast?.(data.data.status==='published'?'Comment updated.':'Your comment was saved privately for administrator review.','success');
   }catch(error){message.textContent=error instanceof Error?error.message:'Could not save. Your text is still here.';}
   finally{save.disabled=form.dataset.editUnavailable==='true';cancel.disabled=false;}
  });
 });
})();
