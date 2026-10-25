(() => {
 const boardData=document.getElementById('staff-board-data');
 const queueData=document.getElementById('staff-queue-data');
 if(!boardData && !queueData && !document.querySelector('.community-care-page')) return;
 const message=document.getElementById('staff-tools-message') || document.getElementById('staff-page-message');
 const tell=(text:string)=>{if(message) message.textContent=text;};
 let busy=false, dragging:string|null=null;
 async function save(url:string,data:unknown,method='POST') {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {const response=await sfSchoolFetch(url,{method,signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});const payload=await response.json();if(!response.ok || !payload.success) throw new Error(payload.error || 'Change not saved. Refresh and try again.');return payload;}
  finally{clearTimeout(timer);}
 }
 if(boardData) {
  interface BoardItem {id:string;title:string;status:string;updated_at:string;staff_note?:string;assignee_id?:string;priority?:string;target_date?:string;}
  interface BoardMeta {filters:{assignment?:string;priority?:string;overdue?:boolean;search:string;sort:string;pageSize:number;pages:Record<string,number>};totalCount:number;lanes:Array<{status:string;label:string;count:number;page:number;pageCount:number;from:number;to:number}>;}
  const board=document.getElementById('staff-flow-board')!;
  const stageSelect=document.getElementById('staff-mobile-stage') as HTMLSelectElement|null;
  const syncStage=(hash:string)=>{if(!stageSelect)return;const stage=hash.replace('#board-lane-','');if(Array.from(stageSelect.options).some(option=>option.value===stage))stageSelect.value=stage;board.dataset.mobileStage=stageSelect.value;const form=document.getElementById('staff-board-filters') as HTMLFormElement;form.action=sfSchoolPath('/admin/board#board-lane-'+stageSelect.value);};
  syncStage(location.hash);
  stageSelect?.addEventListener('change',()=>{syncStage('#board-lane-'+stageSelect.value);const url=new URL(location.href);url.hash='board-lane-'+stageSelect.value;history.replaceState(history.state,'',url);});
  const metaData=document.getElementById('staff-board-meta')!;
  let meta:BoardMeta=JSON.parse(metaData.textContent || '{}');
  let items=new Map<string,BoardItem>((JSON.parse(boardData.textContent || '[]') as BoardItem[]).map(item=>[item.id,item]));
  const selected=new Map<string,BoardItem>();
  const labels:Record<string,string>=Object.fromEntries(meta.lanes.map(lane=>[lane.status,lane.label]));
  const retry=document.getElementById('staff-board-retry') as HTMLButtonElement;
  let loading=false, failedPage:{stage:string|null;url:string;push:boolean}|null=null;
  const urlFor=(stage:string|null,page?:number)=>{
   const url=new URL(sfSchoolPath('/admin/board'),window.location.origin);url.searchParams.set('sort',meta.filters.sort);url.searchParams.set('pageSize',String(meta.filters.pageSize));if(meta.filters.assignment&&meta.filters.assignment!=='all')url.searchParams.set('assignment',meta.filters.assignment);if(meta.filters.priority&&meta.filters.priority!=='all')url.searchParams.set('priority',meta.filters.priority);if(meta.filters.overdue)url.searchParams.set('overdue','true');
   if(meta.filters.search)url.searchParams.set('search',meta.filters.search);
   for(const [key,number] of Object.entries(meta.filters.pages)){const value=key===stage?page:number;if(value && value>1)url.searchParams.set(key+'Page',String(value));}
   if(stage)url.hash='board-lane-'+stage;return url;
  };
  const controls=()=>{
   const locked=busy || loading;
   document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('.staff-flow-board input,.staff-flow-board select,.staff-flow-board button,#staff-bulk-assign,#staff-bulk-assignee,#staff-clear-selection,#staff-board-filters input,#staff-board-filters select,#staff-board-filters button').forEach(el=>{el.disabled=locked;});
   board.querySelectorAll<HTMLAnchorElement>('[data-board-page]').forEach(link=>{link.setAttribute('aria-disabled',String(locked));link.tabIndex=locked?-1:0;});
   retry.disabled=locked;
  };
  function selectionState(){
   let visible=0;
   board.querySelectorAll<HTMLInputElement>('[data-bulk-id]').forEach(input=>{input.checked=selected.has(input.dataset.bulkId!);if(input.checked)visible++;});
   document.getElementById('staff-selection-tools')!.hidden=!selected.size;
   document.getElementById('staff-selection-count')!.textContent=`${selected.size} selected${selected.size>visible?' · '+(selected.size-visible)+' on other pages':''} · maximum 25`;
  }
  async function navigate(stage:string|null,rawUrl:string,push=true,internal=false){
   if(loading || (busy && !internal))return false;
   const target=new URL(rawUrl,window.location.origin);
   if(target.origin!==window.location.origin || sfSchoolRoute(target.pathname)!=='/admin/board')return false;
   loading=true;failedPage=null;retry.hidden=true;controls();tell(stage?`Loading ${labels[stage]} page…`:'Refreshing the work board…');
   const ownLane=stage?board.querySelector<HTMLElement>(`[data-drop-stage="${stage}"]`):board;
   ownLane?.setAttribute('aria-busy','true');
   const request=new AbortController(),timer=setTimeout(()=>request.abort(),15000);
   try {
    const response=await sfSchoolFetch(sfSchoolRoute(target.pathname)+target.search,{headers:{Accept:'text/html'},cache:'no-store',signal:request.signal});
    if(!response.ok)throw new Error(response.status===401 || response.status===403?'Sign in again to continue using the staff board.':'The page could not load. Your current cards and selection are unchanged.');
    const fresh=new DOMParser().parseFromString(await response.text(),'text/html');
    const freshData=fresh.getElementById('staff-board-data'),freshMeta=fresh.getElementById('staff-board-meta');
    if(!freshData || !freshMeta)throw new Error('Your staff session may have expired. Sign in again; your current board has not been replaced.');
    const snapshot:BoardMeta=JSON.parse(freshMeta.textContent || '{}');
    const nextItems:BoardItem[]=JSON.parse(freshData.textContent || '[]');
    const replacementStages=Object.keys(labels).filter(key=>!stage || key===stage || snapshot.filters.pages[key]!==meta.filters.pages[key]);
    // Validate every replacement before touching the existing board. A failed
    // response cannot partially erase cards or silently discard bulk selection.
    for(const key of Object.keys(labels))if(!fresh.querySelector(`[data-drop-stage="${key}"]`))throw new Error('The page was incomplete. Retry loading; your current cards are still here.');
    for(const key of Object.keys(labels)){
     const oldLane=board.querySelector<HTMLElement>(`[data-drop-stage="${key}"]`),newLane=fresh.querySelector<HTMLElement>(`[data-drop-stage="${key}"]`)!;
     if(replacementStages.includes(key)){
      oldLane?.replaceWith(newLane);
     } else {
      for(const selector of ['.staff-lane-heading','.staff-lane-pagination']){const old=oldLane?.querySelector(selector),current=newLane.querySelector(selector);if(old && current)old.replaceChildren(...Array.from(current.childNodes));}
     }
    }
    const changedStages=new Set(replacementStages);
    items=new Map([...Array.from(items.values()).filter(item=>!changedStages.has(item.status)),...nextItems.filter(item=>changedStages.has(item.status))].map(item=>[item.id,item]));
    meta=snapshot;boardData.textContent=JSON.stringify(Array.from(items.values()));metaData.textContent=JSON.stringify(meta);
    document.getElementById('staff-board-summary')!.textContent=`${items.size} shown · ${meta.totalCount.toLocaleString()} matching submissions`;
    selectionState();
    const canonical=urlFor(stage,stage?meta.filters.pages[stage]:undefined);
    if(!stage&&/^#board-lane-(approved|in_progress|resolved)$/.test(target.hash))canonical.hash=target.hash;syncStage(canonical.hash);
    const openIdea=new URL(location.href).searchParams.get('idea');if(document.getElementById('staff-review-dialog')?.hasAttribute('open')&&openIdea)canonical.searchParams.set('idea',openIdea);
    if(push)window.history.pushState(null,'',canonical.href);else window.history.replaceState(null,'',canonical.href);
    if(stage){board.querySelector<HTMLElement>(`[data-drop-stage="${stage}"]`)?.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});const heading=board.querySelector<HTMLElement>(`#board-title-${stage}`);heading?.focus({preventScroll:true});const lane=meta.lanes.find(l=>l.status===stage)!;tell(`${lane.label}: ${lane.from}–${lane.to} of ${lane.count}. Page ${lane.page} of ${lane.pageCount}. Selection retained.`);}
    else tell('Work board refreshed.');
    return true;
   }catch(e){failedPage={stage,url:target.href,push};retry.hidden=false;tell(e.name==='AbortError'?'Loading timed out. Your current cards and selection are unchanged. Retry loading.':e.message);return false;}
   finally{clearTimeout(timer);ownLane?.removeAttribute('aria-busy');loading=false;controls();}
  }
  const stageActions:Record<string,Record<string,string>>={
   pending:{approved:'approve',rejected:'decline'},approved:{in_progress:'start',rejected:'withdraw'},
   in_progress:{resolved:'complete',rejected:'withdraw'},resolved:{in_progress:'reopen',rejected:'withdraw'}
  };
  const moveAction=(item:BoardItem,stage:string)=>stageActions[item.status]?.[stage] || null;
  async function move(id:string,stage:string){
   const item=items.get(id);if(!item || item.status===stage || busy || loading)return;
   const action=moveAction(item,stage);
   const select=board.querySelector<HTMLSelectElement>(`[data-stage-select="${id}"]`);if(select)select.value=item.status;
   if(!action){tell('That stage is unavailable for this idea. Open the idea to see its available actions.');return;}
   document.dispatchEvent(new CustomEvent('sf:review-action',{detail:{id,action,trigger:board.querySelector(`[data-review="${id}"]`)}}));
  }
  board.addEventListener('click',e=>{
   const link=(e.target as HTMLElement).closest<HTMLAnchorElement>('[data-board-page]');
   if(!link || (e as MouseEvent).button!==0 || (e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey || (e as MouseEvent).shiftKey || (e as MouseEvent).altKey)return;
   e.preventDefault();if(busy || loading)return;
   const stage=link.dataset.boardPage!;if(!labels[stage])return;
   const page=Number(new URL(link.href).searchParams.get(stage+'Page') || 1);
   void navigate(stage,urlFor(stage,page).href);
  });
  board.addEventListener('submit',e=>{const form=(e.target as HTMLElement).closest<HTMLFormElement>('[data-board-jump]');if(!form)return;e.preventDefault();if(busy || loading || !form.reportValidity())return;const stage=form.dataset.boardJump!;if(!labels[stage])return;const input=form.querySelector<HTMLInputElement>('.staff-page-input')!;void navigate(stage,urlFor(stage,Number(input.value)).href);});
  board.addEventListener('change',e=>{
   const input=e.target as HTMLInputElement;
   if(input.matches('[data-bulk-id]')){
    if(busy || loading){input.checked=selected.has(input.dataset.bulkId!);return;}
    const id=input.dataset.bulkId!,item=items.get(id);if(!item)return;
    if(input.checked && !selected.has(id) && selected.size>=25){input.checked=false;tell('Select no more than 25 ideas for one group.');return;}
    if(input.checked)selected.set(id,{...item});else selected.delete(id);selectionState();
   } else if(input.matches('[data-stage-select]')){
    const item=items.get(input.dataset.stageSelect!);if(!item)return;const stage=input.value;input.value=item.status;
    const group=selected.has(item.id)?Array.from(selected.values()).map(value=>items.get(value.id)||value):[item];
    if(busy||loading)return;if(!group.every(value=>moveAction(value,stage))){tell('Not every selected idea can move to this stage. Adjust the selection or choose another stage.');return;}dropGroup(group,stage);
   }
  });
  const dragStatus=document.getElementById('staff-drag-status');
  const tellDrag=(text:string)=>{if(dragStatus)dragStatus.textContent=text;};
  let dragPreview:HTMLElement|null=null;
  let dragItems:BoardItem[]=[];
  let pointerDrag:{pointerId:number;card:HTMLElement;capture:HTMLElement;item:BoardItem;startX:number;startY:number;x:number;y:number;started:boolean}|null=null;
  let dragFrame=0,ghostWidth=0,ghostHeight=0,lastPointerLane:HTMLElement|null=null;
  let suppressedCard:HTMLElement|null=null,suppressUntil=0,lastPointerType='';
  function clearDrag(){
   const pointer=pointerDrag;pointerDrag=null;
   cancelAnimationFrame(dragFrame);dragFrame=0;lastPointerLane=null;
   document.documentElement.removeAttribute('data-sf-board-dragging');document.documentElement.style.removeProperty('--sf-board-cursor');
   if(pointer?.started){suppressedCard=pointer.card;suppressUntil=performance.now()+250;}
   if(pointer){pointer.card.removeAttribute('data-sf-held');if(pointer.capture.hasPointerCapture(pointer.pointerId))pointer.capture.releasePointerCapture(pointer.pointerId);}

   board.classList.remove('is-dragging');
   board.querySelectorAll<HTMLElement>('[data-dragging]').forEach(card=>{delete card.dataset.dragging;card.dataset.draggedAt=String(Date.now());});
   board.querySelectorAll<HTMLElement>('[data-drop-stage]').forEach(lane=>{lane.classList.remove('is-drop-target','is-invalid-drop-target');delete lane.dataset.dropLabel;lane.querySelector<HTMLElement>('.staff-lane-heading')?.removeAttribute('data-drop-label');});
   dragPreview?.remove();dragPreview=null;dragging=null;dragItems=[];
  }
  function beginDrag(item:BoardItem,card:HTMLElement){
   dragging=item.id;dragItems=selected.has(item.id)?Array.from(selected.values()).map(value=>items.get(value.id)||value):[item];
   const ids=new Set(dragItems.map(value=>value.id));board.querySelectorAll<HTMLElement>('[data-board-id]').forEach(source=>{if(ids.has(source.dataset.boardId!))source.dataset.dragging='true';});board.classList.add('is-dragging');
   board.querySelectorAll<HTMLElement>('[data-drop-stage]').forEach(lane=>{
    const action=dragItems.every(value=>moveAction(value,lane.dataset.dropStage!))?moveAction(item,lane.dataset.dropStage!):null;
    if(action){lane.dataset.dropLabel=dragItems.length>1?`Release to review ${dragItems.length} moves to ${labels[lane.dataset.dropStage!]}`:({start:'Release to start work',reopen:'Release to reopen work',complete:'Release to review completion',approve:'Release to review approval',decline:'Release to review decline',withdraw:'Release to review withdrawal'})[action];lane.querySelector<HTMLElement>('.staff-lane-heading')!.dataset.dropLabel=lane.dataset.dropLabel;}
   });
   dragPreview=document.createElement('div');dragPreview.className='staff-drag-preview';dragPreview.setAttribute('aria-hidden','true');
   if(dragItems.length>1)dragPreview.dataset.group='true';
   const title=document.createElement('strong');title.textContent=dragItems.length>1?`${dragItems.length} selected ideas`:item.title;
   dragPreview.append(title);
   if(dragItems.length>1){const list=document.createElement('ul');for(const entry of dragItems.slice(0,3)){const row=document.createElement('li');row.textContent=entry.title;list.append(row);}if(dragItems.length>3){const row=document.createElement('li');row.textContent=`+${dragItems.length-3} more`;list.append(row);}dragPreview.append(list);}
   const hint=document.createElement('span');hint.textContent=dragItems.length>1?'Move group · review each idea before saving':'Move idea · review before saving';dragPreview.append(hint);document.body.append(dragPreview);
   tellDrag('Drop onto a highlighted stage to review the move. Nothing changes until you save.');
  }
  function pointerLane(){return document.elementFromPoint(pointerDrag!.x,pointerDrag!.y)?.closest<HTMLElement>('[data-drop-stage]')||null;}
  function paintPointer(){
   dragFrame=0;const pointer=pointerDrag;if(!pointer?.started)return;
   if(busy||loading){clearDrag();tellDrag('Drag cancelled while the board updates. No changes saved.');return;}
   const lane=pointerLane(),inside=lane&&board.contains(lane),allowed=inside&&!!lane.dataset.dropLabel;
   if(lane!==lastPointerLane){
    lastPointerLane=lane;board.querySelectorAll('.is-drop-target,.is-invalid-drop-target').forEach(el=>el.classList.remove('is-drop-target','is-invalid-drop-target'));
    if(inside)lane.classList.add(allowed?'is-drop-target':'is-invalid-drop-target');
    const hint=allowed?lane!.dataset.dropLabel!:inside?(dragItems.length===1&&lane!.dataset.dropStage===pointer.item.status?'Already in this stage · release to cancel':(dragItems.length>1?'Not all selected ideas can enter this stage · release to cancel':'This move is unavailable · release to cancel')):'Release over a highlighted stage, or release here to cancel';
    const label=dragPreview?.querySelector('span');if(label)label.textContent=hint;tellDrag(hint);
   }
   if(dragPreview)dragPreview.style.transform=`translate3d(${Math.max(8,Math.min(pointer.x+18,innerWidth-ghostWidth-8))}px,${Math.max(8,Math.min(pointer.y+18,innerHeight-ghostHeight-8))}px,0)`;
   const rect=board.getBoundingClientRect(),previousX=board.scrollLeft,previousY=window.scrollY;
   if(pointer.y>=Math.max(0,rect.top)&&pointer.y<=Math.min(innerHeight,rect.bottom)){
    if(pointer.x<Math.max(0,rect.left)+40)board.scrollLeft-=12;
    else if(pointer.x>Math.min(innerWidth,rect.right)-40)board.scrollLeft+=12;
   }
   if(pointer.y<96)window.scrollBy({top:-10,behavior:'instant'});
   else if(pointer.y>innerHeight-48)window.scrollBy({top:10,behavior:'instant'});
   if(board.scrollLeft!==previousX||window.scrollY!==previousY)dragFrame=requestAnimationFrame(paintPointer);
  }
  board.addEventListener('pointerdown',event=>{
   lastPointerType=event.pointerType;
   if(event.pointerType!=='mouse'||event.button!==0||busy||loading||pointerDrag||!(event.target instanceof Element)||event.target.closest('input,select,textarea,button,summary,label,details,[contenteditable]'))return;
   const card=event.target.closest<HTMLElement>('[data-board-id]'),item=card?items.get(card.dataset.boardId!):null;if(!card||!item)return;
   const capture=event.target instanceof HTMLElement?event.target:card;
   pointerDrag={pointerId:event.pointerId,card,capture,item,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,started:false};
   try{capture.setPointerCapture(event.pointerId);}catch{pointerDrag=null;}
  });
  board.addEventListener('pointermove',event=>{
   const pointer=pointerDrag;if(!pointer||event.pointerId!==pointer.pointerId)return;
   pointer.x=event.clientX;pointer.y=event.clientY;
   if(!pointer.started){
    if(Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)<6)return;
    if(busy||loading){clearDrag();return;}
    pointer.started=true;beginDrag(pointer.item,pointer.card);document.documentElement.style.setProperty('--sf-board-cursor',getComputedStyle(pointer.card).getPropertyValue('--sf-school-grabbing').trim()||'grabbing');document.documentElement.setAttribute('data-sf-board-dragging','');
    dragPreview!.setAttribute('data-pointer-drag','');const size=dragPreview!.getBoundingClientRect();ghostWidth=size.width;ghostHeight=size.height;window.getSelection()?.removeAllRanges();
   }
   event.preventDefault();if(!dragFrame)dragFrame=requestAnimationFrame(paintPointer);
  });
  board.addEventListener('pointerup',event=>{
   const pointer=pointerDrag;if(!pointer||event.pointerId!==pointer.pointerId)return;
   pointer.x=event.clientX;pointer.y=event.clientY;
   const lane=pointer.started?pointerLane():null,stage=lane?.dataset.dropStage;
   const allowed=pointer.started&&lane&&board.contains(lane)&&!!lane.dataset.dropLabel&&!busy&&!loading;
   if(pointer.started){suppressedCard=pointer.card;suppressUntil=performance.now()+250;event.preventDefault();}
   const group=[...dragItems];clearDrag();
   if(allowed&&stage)dropGroup(group,stage);
   else if(pointer.started)tellDrag('Drag cancelled. No changes saved.');
  });
  board.addEventListener('click',event=>{if(performance.now()<suppressUntil&&event.target instanceof Node&&suppressedCard?.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}},true);
  for(const name of ['pointercancel','lostpointercapture'])board.addEventListener(name,()=>{if(pointerDrag){clearDrag();tellDrag('Drag cancelled. No changes saved.');}});
  window.addEventListener('blur',()=>{if(pointerDrag){clearDrag();tellDrag('Drag cancelled. No changes saved.');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pointerDrag){event.preventDefault();clearDrag();tellDrag('Drag cancelled. No changes saved.');}},true);
  board.addEventListener('dragstart',e=>{
   // Native HTML drag owns the OS cursor; mouse dragging uses pointer capture instead.
   if(pointerDrag||lastPointerType==='mouse'){e.preventDefault();return;}
   const target=e.target as HTMLElement,card=target.closest<HTMLElement>('[data-board-id]');if(!card)return;
   if(busy||loading||target.closest('a,input,select,textarea,button,summary,label,details')){e.preventDefault();return;}
   const item=items.get(card.dataset.boardId!);if(!item){e.preventDefault();return;}
   beginDrag(item,card);
   if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.id);e.dataTransfer.setDragImage(dragPreview!,24,20);}
  });
  board.addEventListener('dragend',()=>{const cancelled=!!dragging;clearDrag();if(cancelled)tellDrag('Drag cancelled. No changes saved.');});
  board.addEventListener('dragover',e=>{
   const lane=(e.target as HTMLElement).closest<HTMLElement>('[data-drop-stage]');
   const allowed=!!(lane?.dataset.dropLabel && dragging && !busy && !loading);
   board.querySelectorAll('.is-drop-target').forEach(el=>{if(el!==lane || !allowed)el.classList.remove('is-drop-target');});
   if(!allowed){if(e.dataTransfer)e.dataTransfer.dropEffect='none';return;}
   e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';lane!.classList.add('is-drop-target');
  });
  board.addEventListener('dragleave',e=>{const lane=(e.target as HTMLElement).closest<HTMLElement>('[data-drop-stage]');if(lane && (!(e.relatedTarget instanceof Node) || !lane.contains(e.relatedTarget)))lane.classList.remove('is-drop-target');});
  board.addEventListener('drop',e=>{
   const lane=(e.target as HTMLElement).closest<HTMLElement>('[data-drop-stage]');if(!lane || !dragging)return;
   e.preventDefault();const group=[...dragItems],stage=lane.dataset.dropStage!,allowed=!!lane.dataset.dropLabel;
   clearDrag();if(allowed)dropGroup(group,stage);else tellDrag('That stage is unavailable for this idea. No changes saved.');
  });
  function dropGroup(group:BoardItem[],stage:string){
   if(!group.length)return;
   tellDrag(group.length>1?'Opening group review. Each idea must be saved individually.':'Opening the move form. Review the change before saving.');
   if(group.length===1){void move(group[0].id,stage);return;}
   document.dispatchEvent(new CustomEvent('sf:review-group',{detail:{items:group.map(item=>({id:item.id,title:item.title})),stage,trigger:board.querySelector(`[data-review="${group[0].id}"]`)}}));
  }
  document.addEventListener('sf:board-group-saved',event=>{const {id}=(event as CustomEvent).detail;selected.delete(id);selectionState();});
  window.addEventListener('pagehide',clearDrag);
  retry.addEventListener('click',()=>{if(failedPage)void navigate(failedPage.stage,failedPage.url,failedPage.push);});
  document.getElementById('staff-clear-selection')?.addEventListener('click',()=>{if(busy || loading)return;selected.clear();selectionState();tell('Selection cleared.');});
  document.getElementById('staff-bulk-assign')?.addEventListener('click',async()=>{
   if(busy || loading)return;if(!selected.size){tell('Select at least one idea.');return;}
   const assignee=document.getElementById('staff-bulk-assignee') as HTMLSelectElement;
   const assignment={assigneeId:assignee.value || null,items:Array.from(selected.values()).map(x=>({id:x.id,updatedAt:x.updated_at}))};
   if(!await window.sfConfirm(`Assign ${selected.size} selected ideas, including selections on other pages, to ${assignee.selectedOptions[0].textContent}? No statuses or public responses will change. If any selected idea changed, nothing is saved.`))return;
   if(busy || loading || assignment.assigneeId!==(assignee.value || null) || JSON.stringify(assignment.items)!==JSON.stringify(Array.from(selected.values()).map(x=>({id:x.id,updatedAt:x.updated_at}))))return;
   busy=true;controls();tell('Saving assignments…');
   try {await save('/api/community/staff/bulk_assign',assignment);selected.clear();selectionState();if(!await navigate(null,urlFor(null).href,false,true))tell('Assignments saved, but the board could not refresh. Retry loading.');}
   catch(e){tell(e.name==='AbortError'?'Request timed out. Refresh to confirm assignments before retrying.':e.message);}finally{busy=false;controls();}
  });
  let filterConfirmed=false,confirmingFilter=false;
  document.getElementById('staff-board-filters')?.addEventListener('submit',async e=>{
   if(busy || loading){e.preventDefault();return;}
   if(filterConfirmed){filterConfirmed=false;return;}
   if(!selected.size)return;
   e.preventDefault();if(confirmingFilter)return;confirmingFilter=true;
   try{
    if(!await window.sfConfirm('Changing the search, order or page size clears your selection. Continue?'))return;
    if(busy || loading)return;
    filterConfirmed=true;
    const form=e.target as HTMLFormElement,submitter=(e as SubmitEvent).submitter;
    if(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement)form.requestSubmit(submitter);else form.requestSubmit();
    filterConfirmed=false;
   }finally{confirmingFilter=false;}
  });
  document.querySelector<HTMLAnchorElement>('[data-board-reset]')?.addEventListener('click',async e=>{
   if(busy || loading){e.preventDefault();return;}
   if(!selected.size)return;
   e.preventDefault();if(confirmingFilter)return;confirmingFilter=true;
   const href=(e.currentTarget as HTMLAnchorElement).href;
   try{if(await window.sfConfirm('Reset filters and clear your selection?') && !busy && !loading)window.location.assign(href);}
   finally{confirmingFilter=false;}
  });
  window.addEventListener('popstate',()=>{if(busy || loading){window.history.pushState(null,'',urlFor(null).href);tell('Wait for the current request before changing pages.');return;}void navigate(null,window.location.href,false);});
  selectionState();
  window.sfStaffBoardRefresh=()=>navigate(null,urlFor(null).href,false);
 }
 document.getElementById('staff-response-template')?.addEventListener('change',async e=>{
  const select=e.target as HTMLSelectElement, note=document.getElementById('review-note') as HTMLTextAreaElement;
  if(!select.value || !note) return;
  const templates:Record<string,string>={planned:'Thank you for raising this idea. We have approved it for planning. We will publish an update when the next step is confirmed.',clarify:'Thank you for your feedback. We need more detail before making a decision. Please check your private School messages for our question.',declined:'Thank you for this suggestion. We are unable to proceed at this time. Reason: [explain the decision]. Alternative or next step: [provide a helpful option].'};
  const priorText=note.value,template=select.value;
  if(note.value && !await window.sfConfirm('Replace the current draft response with this template?')) {select.value='';return;}
  if(note.value!==priorText || select.value!==template)return;
  note.value=templates[template] || '';note.dispatchEvent(new Event('input',{bubbles:true}));note.focus();select.value='';
 });
 document.addEventListener('keydown',e=>{
  if(document.getElementById('review-workspace')?.hidden)return;
  if(e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
  if(e.key==='/') {const search=document.querySelector<HTMLInputElement>('.staff-search-form input[type=search]');if(search){e.preventDefault();search.focus();}}
  if(e.key==='j' || e.key==='k') {const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.staff-row .staff-title-button'));const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='j' ? current+1 : current-1;if(buttons.length){e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,next))].focus();}}
 });
})();
