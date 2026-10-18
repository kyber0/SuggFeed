interface Window { sfStaffBoardRefresh?:()=>Promise<boolean>; }
(() => {
  interface QueueItem { id:string; title:string; description:string; category:string; status:string; created_at:string; updated_at:string; staff_note:string; assignee_id:string; priority:string; target_date:string;started_at?:string;resolved_at?:string;workflow?:StaffWorkflowContext; }
  const queueData=document.getElementById('staff-queue-data');
  const isQueue=!!queueData;
  let items:QueueItem[] = JSON.parse(queueData?.textContent || '[]');
  const currentUser = JSON.parse(document.getElementById('staff-current-user')!.textContent || '{}').id;
  const dialog = document.getElementById('staff-review-dialog') as HTMLDialogElement;
  const form = document.getElementById('staff-review-form') as HTMLFormElement;
  const fields = document.getElementById('staff-review-fields') as HTMLFieldSetElement;
  const status = document.getElementById('review-status') as HTMLSelectElement;
  const note = document.getElementById('review-note') as HTMLTextAreaElement;
  const assignee = document.getElementById('review-assignee') as HTMLSelectElement;
  const priority = document.getElementById('review-priority') as HTMLSelectElement;
  const targetDate = document.getElementById('review-target-date') as HTMLInputElement;
  const internalNote = document.getElementById('review-internal-note') as HTMLTextAreaElement;
  const internalForm = document.getElementById('staff-internal-note-form') as HTMLFormElement;
  const internalMessage = document.getElementById('review-internal-message')!;
  const activityMessage = document.getElementById('review-activity-message')!;
  const save = document.getElementById('review-save') as HTMLButtonElement;
  const saveNext = document.getElementById('review-save-next') as HTMLButtonElement;
  const message = document.getElementById('review-message')!;
  const pageMessage = (document.getElementById('staff-page-message') || document.getElementById('care-message') || document.getElementById('staff-tools-message'))!;
  const discardWarning = document.getElementById('review-discard-warning')!;
  const reviewed = new Set<string>();
  let noteBusy=false, busy=false, saved=false, refreshing=false;
  let activityRequest:AbortController | undefined;
  let detailRequest:AbortController | undefined;
  let requestedId='', requestedSection='decision';
  let active:QueueItem | undefined;
  let returnFocus:HTMLElement | null=null;
  let repairRetry:{payload:string;id:string}|undefined;
  const repairForm=document.getElementById('work-date-repair-form') as HTMLFormElement;
  function hasRepairDraft(){return !!repairForm && !repairForm.hidden && ['repair-source','repair-reason','repair-start','repair-end'].some(id=>{const input=document.getElementById(id) as HTMLInputElement;return input && input.value!==input.defaultValue;});}
  function paintWorkflow(context?:StaffWorkflowContext){
    if(!context || !active)return;active.workflow=context;
    const state=document.getElementById('workflow-state'),actions=document.getElementById('workflow-actions');if(!state || !actions)return;
    state.textContent=context.paused?'Work changes are temporarily paused.':context.issues.length?'Work changes require verified historical dates. Reading, assignment and private follow-ups remain available.':context.mode==='preview'?'Guided actions are available. Operator rollout enforcement has not been enabled yet.':'Choose the next action. Saving assignment does not publish an update.';
    actions.replaceChildren();
    const names:Record<string,string>={approve:'Approve',decline:'Decline',start:'Start work',update:'Publish update',milestone:'Record milestone',pause:'Pause work',resume:'Resume work',complete:'Complete with evidence',correction:'Correct an update',reopen:'Reopen work',withdraw:'Withdraw public idea'};
    const more=document.createElement('details'),caption=document.createElement('summary');caption.textContent='Other actions';more.className='workflow-secondary';more.append(caption);
    const primary=active.status==='pending'?['approve','decline']:active.status==='approved'?['start']:context.allowedActions.includes('resume')?['resume','complete']:active.status==='in_progress'?['update','complete']:['reopen','correction'];
    for(const action of context.allowedActions){const button=document.createElement('button');button.type='button';button.className='workspace-button';button.textContent=names[action];button.dataset.workflowAction=action;(primary.includes(action)?actions:more).append(button);}
    if(context.allowedActions.includes('withdraw')){const merge=document.createElement('a');merge.className='workspace-button';merge.textContent='Merge duplicate';merge.href=sfSchoolPath('/admin/community?section=clarifications&task=merge&idea='+encodeURIComponent(active.id));more.append(merge);}
    if(more.children.length>1)actions.append(more);
    if(repairForm)repairForm.hidden=!context.canRepair;
  }
  document.addEventListener('sf:workflow-context',event=>paintWorkflow((event as CustomEvent).detail));
  document.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-workflow-action]');if(button){selectTab('progress');window.sfStaffProgress?.prepareAction?.(button.dataset.workflowAction!);}});
  document.addEventListener('sf:review-action',event=>{const {id,action,trigger}=(event as CustomEvent).detail || {};if(typeof id!=='string')return;void openReview(id,trigger).then(()=>{if(active?.id===id){selectTab('progress');window.sfStaffProgress?.prepareAction?.(action);}});});
  const labels:Record<string,string>={pending:'Needs review',approved:'Planned',in_progress:'In progress',resolved:'Completed',rejected:'Declined'};
  const hints:Record<string,string>={
    pending:'Keep this suggestion in the private review queue.',
    approved:'Publish this idea to the community feed and Planned roadmap stage.',
    in_progress:'Show the community that work on this idea is underway.',
    resolved:'Mark the idea as completed on the public roadmap.',
    rejected:'Remove this idea from public views. Explain the decision for the submitter.'
  };
  function selectTab(key:string, focus=false) {
    dialog.querySelectorAll<HTMLButtonElement>('[data-review-tab]').forEach(button=>{
      const selected=button.dataset.reviewTab===key;
      button.setAttribute('aria-selected',String(selected)); button.tabIndex=selected?0:-1;
      if(selected && focus) button.focus();
    });
    dialog.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach(panel=>{panel.hidden=panel.id!=='review-panel-'+key;});
    save.hidden=saved || key==='progress';saveNext.hidden=!isQueue || !items.some(i=>i.id===active?.id) || saved || key==='progress';
  }
  const tabs=Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-review-tab]'));
  tabs.forEach((button,index)=>{
    button.addEventListener('click',()=>selectTab(button.dataset.reviewTab!));
    button.addEventListener('keydown',event=>{
      const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
      if(next>=0){event.preventDefault();selectTab(tabs[next].dataset.reviewTab!,true);}
    });
  });
  function hasReviewDraft() {return Boolean(active && !saved && (status.value!==active.status || note.value!==active.staff_note || assignee.value!==active.assignee_id || priority.value!==active.priority || targetDate.value!==active.target_date));}
  function hasUnsavedChanges() {return Boolean(internalNote.value.trim() || hasReviewDraft() || hasRepairDraft() || window.sfStaffProgress?.hasDraft());}
  function updateDraft() {document.getElementById('review-draft-state')!.textContent=hasUnsavedChanges()?'Unsaved changes':saved?'Changes saved':'No unsaved changes';}
  function updateHint(){document.getElementById('review-status-hint')!.textContent=hints[status.value] || '';}
  function updateCount(){document.getElementById('review-note-count')!.textContent=note.value.length.toLocaleString()+' / 2,000';updateDraft();}
  function close(discard=false){
    if(busy || noteBusy || window.sfStaffProgress?.isBusy()) return;
    if(!discard && hasUnsavedChanges()){discardWarning.hidden=false;document.getElementById('review-keep-editing')!.focus();return;}
    dialog.close();
  }
  function populateReview(item:QueueItem, section='decision') {
    active=item;
    const index=items.findIndex(i=>i.id===item.id);if(index>=0)items[index]=item;
    saved=false; fields.disabled=false; save.disabled=false; save.hidden=false; saveNext.hidden=false; saveNext.disabled=false;
    save.textContent='Save assignment'; discardWarning.hidden=true; message.textContent=''; message.classList.remove('is-success');
    document.getElementById('review-dismiss')!.textContent='Cancel';
    document.getElementById('review-title')!.textContent=item.title;
    document.getElementById('review-description')!.textContent=item.description;
    document.getElementById('review-meta')!.textContent=item.category+' · Received '+new Date(item.created_at).toLocaleDateString('en-PH',{dateStyle:'medium'})+' · Submission ID: '+item.id;
    let clarification=document.getElementById('review-clarification-link') as HTMLAnchorElement;
    if(!clarification){clarification=document.createElement('a');clarification.id='review-clarification-link';clarification.textContent='Request private clarification →';document.getElementById('review-meta')!.after(clarification);}
    clarification.href=sfSchoolPath('/admin/community?idea='+encodeURIComponent(item.id));
    document.getElementById('review-position')!.textContent=isQueue && index>=0?'Item '+(index+1)+' of '+items.length+' on this page':isQueue?'Opened from a direct link':document.getElementById('staff-board-data')?'Work board':'Community care';
    const badge=document.getElementById('review-current-status')!; badge.textContent=labels[item.status];badge.dataset.status=item.status;
    status.value=item.status;note.value=item.staff_note;priority.value=item.priority;targetDate.value=item.target_date;
    assignee.querySelector('[data-former-staff]')?.remove();
    if(item.assignee_id && !Array.from(assignee.options).some(o=>o.value===item.assignee_id)){
      const option=new Option('Former staff — choose an active assignee',item.assignee_id);option.dataset.formerStaff='true';assignee.add(option);
    }
    assignee.value=item.assignee_id; internalNote.value='';internalMessage.textContent='';
    targetDate.removeAttribute('aria-invalid');document.getElementById('review-date-error')!.textContent='';
    updateHint();updateCount();selectTab(section);
    if(!dialog.open)dialog.showModal();else tabs[0].focus();
    dialog.querySelector('.staff-review-scroll')!.scrollTop=0;
    void loadActivity();
    window.sfStaffProgress?.open(item);
    repairRetry=undefined;
    if(repairForm){for(const [id,value] of [['repair-start',item.started_at],['repair-end',item.resolved_at],['repair-source',''],['repair-reason','']]){const input=document.getElementById(id) as HTMLInputElement;input.value=value?new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10):'';input.defaultValue=input.value;}
      document.getElementById('repair-end-wrap')!.hidden=item.status!=='resolved';(document.getElementById('repair-end') as HTMLInputElement).required=item.status==='resolved';}
    paintWorkflow(item.workflow);
  }
  repairForm?.addEventListener('submit',async event=>{
    event.preventDefault();if(!active || busy || noteBusy || window.sfStaffProgress?.isBusy() || !repairForm.reportValidity())return;
    const value=(id:string)=>(document.getElementById(id) as HTMLInputElement).value;
    const payload=JSON.stringify({updatedAt:active.updated_at,startedOn:value('repair-start'),completedOn:value('repair-end'),source:value('repair-source'),reason:value('repair-reason')});
    if(!repairRetry || repairRetry.payload!==payload)repairRetry={payload,id:crypto.randomUUID()};
    const state=document.getElementById('repair-message')!;busy=true;const button=repairForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;state.textContent='Saving verified dates…';
    try{const data=await request('/api/staff/submissions/'+active.id+'/work-dates','POST',{...JSON.parse(payload),requestId:repairRetry.id});
      for(const id of ['repair-source','repair-reason','repair-start','repair-end']){const input=document.getElementById(id) as HTMLInputElement;input.defaultValue=input.value;}
      Object.assign(active,data.submission);paintWorkflow(data.workflow);state.textContent='Verified dates saved.';repairRetry=undefined;busy=false;try{await refreshQueue();await window.sfStaffProgress?.refresh();}catch{state.textContent='Verified dates saved, but the workspace could not refresh.';}
    }catch(error){state.textContent=error.message || 'Could not confirm the repair. Keep your draft and retry the same request.';}
    finally{busy=false;button.disabled=false;updateDraft();}
  });
  async function openReview(id:string, trigger?:HTMLElement, section='decision') {
    if(busy || noteBusy || window.sfStaffProgress?.isBusy())return;
    if(dialog.open && hasUnsavedChanges()){discardWarning.hidden=false;document.getElementById('review-keep-editing')!.focus();return;}
    detailRequest?.abort();activityRequest?.abort();window.sfStaffProgress?.close();
    requestedId=id;requestedSection=section==='progress'?'progress':'decision';
    if(!dialog.open)returnFocus=trigger || document.activeElement as HTMLElement;
    active=undefined;internalNote.value='';saved=false;discardWarning.hidden=true;
    dialog.dataset.unavailable='true';dialog.setAttribute('aria-busy','true');
    fields.disabled=true;save.hidden=true;saveNext.hidden=true;
    document.getElementById('review-title')!.textContent='Loading submission…';
    document.getElementById('review-position')!.textContent='';message.textContent='Loading fresh details…';message.classList.remove('is-success');
    const retry=document.getElementById('review-retry-detail') as HTMLButtonElement;retry.hidden=true;
    if(!dialog.open)dialog.showModal();
    const controller=new AbortController();detailRequest=controller;
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('This link contains an invalid submission ID.');
      const response=await sfSchoolFetch('/api/staff/submissions/'+encodeURIComponent(id),{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
      const body=await response.json().catch(()=>null);
      if(!response.ok || !body?.success)throw new Error(response.status===401 || response.status===403?'Your staff session expired or access changed. Sign in again.':response.status===404?'This submission is no longer available.':'Submission details could not load. Please retry.');
      if(!dialog.open || detailRequest!==controller)return;
      if(body.item?.id!==id || !labels[body.item?.status])throw new Error('Submission details were incomplete. Please retry.');
      delete dialog.dataset.unavailable;populateReview(body.item,requestedSection);
    }catch(error){
      if(dialog.open && detailRequest===controller){document.getElementById('review-title')!.textContent='Submission unavailable';message.textContent=error.name==='AbortError'?'Loading timed out. Retry loading this submission.':error.message;retry.hidden=false;}
    }finally{clearTimeout(timer);if(detailRequest===controller)dialog.removeAttribute('aria-busy');}
  }
  document.addEventListener('click',event=>{
    const target=event.target as Element;
    const card=target.closest<HTMLElement>('[data-board-id]');
    if(card && (Date.now()-Number(card.dataset.draggedAt || 0)<400 || card.dataset.dragging==='true')){event.preventDefault();return;}
    const button=target.closest<HTMLElement>('[data-review]');
    if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    if(button){event.preventDefault();void openReview(button.dataset.review!,button,button.dataset.reviewSection);}
    else if(card && !target.closest('input,select,button,a,label,summary,details') && !window.getSelection()?.toString()){
      const title=card.querySelector<HTMLElement>('[data-review]');if(title)void openReview(card.dataset.boardId!,title);
    }
  });
  document.getElementById('review-retry-detail')!.addEventListener('click',()=>void openReview(requestedId,undefined,requestedSection));
  document.querySelectorAll('[data-close-review]').forEach(button=>button.addEventListener('click',()=>close()));
  document.getElementById('review-keep-editing')!.addEventListener('click',()=>{discardWarning.hidden=true;if(window.sfStaffProgress?.hasDraft()){selectTab('progress');window.sfStaffProgress.focusDraft();}else{selectTab(internalNote.value.trim()?'notes':'decision');(internalNote.value.trim()?internalNote:note).focus();}});
  document.getElementById('review-discard-confirm')!.addEventListener('click',()=>close(true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog && event.clientX<dialog.getBoundingClientRect().left)close();});
  dialog.addEventListener('close',()=>{detailRequest?.abort();activityRequest?.abort();window.sfStaffProgress?.close();if(returnFocus?.isConnected)returnFocus.focus();else document.querySelector<HTMLElement>('#staff-queue-title,.workspace-heading h1')?.focus();});
  window.addEventListener('beforeunload',event=>{if(dialog.open && (busy || noteBusy || window.sfStaffProgress?.isBusy() || hasUnsavedChanges())){event.preventDefault();event.returnValue='';}});
  status.addEventListener('change',()=>{updateHint();updateDraft();});note.addEventListener('input',updateCount);
  [assignee,priority,targetDate,internalNote].forEach(input=>input.addEventListener('input',updateDraft));
  targetDate.addEventListener('input',()=>{targetDate.removeAttribute('aria-invalid');document.getElementById('review-date-error')!.textContent='';});
  document.getElementById('review-assign-me')!.addEventListener('click',()=>{
    if(Array.from(assignee.options).some(o=>o.value===currentUser)){assignee.value=currentUser;updateDraft();}
  });
  async function refreshCare(){
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null,scrollY=window.scrollY;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await sfSchoolFetch(window.location.href,{headers:{Accept:'text/html'},cache:'no-store',signal:controller.signal});
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      const ids=['care-reminders','care-reports','care-clarification','care-merges'];
      if(!response.ok || ids.some(id=>!doc.getElementById(id)))throw new Error('Community care could not refresh. Check your staff session.');
      // Preserve the actual form nodes (values, focus, and in-flight state), not
      // just serialized values. Never replace an unrelated care draft.
      const key=(form:HTMLFormElement)=>(form.closest<HTMLElement>('[data-care-row]')?.dataset.careRow || '')+':'+form.dataset.careAction;
      const existing=new Map(Array.from(document.querySelectorAll<HTMLFormElement>('.community-care-page [data-care-action]')).map(form=>[key(form),form]));
      for(const fresh of doc.querySelectorAll<HTMLFormElement>('[data-care-action]')){const old=existing.get(key(fresh));if(old)fresh.replaceWith(old);}
      for(const id of ids){
        const old=document.getElementById(id)!,fresh=doc.getElementById(id)!;
        for(const row of old.querySelectorAll<HTMLElement>('[data-care-row]')){
          if(!fresh.querySelector(`[data-care-row="${row.dataset.careRow}"]`) && Array.from(row.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')).some(input=>input.value!==input.defaultValue))fresh.append(row);
        }
        old.replaceChildren(...Array.from(fresh.childNodes));
      }
      const nav=document.querySelector('.care-section-nav'),freshNav=doc.querySelector('.care-section-nav');if(nav && freshNav)nav.replaceChildren(...Array.from(freshNav.childNodes));
      const pager=document.querySelector('.care-pagination'),freshPager=doc.querySelector('.care-pagination');if(pager && freshPager)pager.replaceChildren(...Array.from(freshPager.childNodes));
      if(focused?.isConnected)focused.focus({preventScroll:true});window.scrollTo({top:scrollY});
    }finally{clearTimeout(timer);}
  }
  async function refreshQueue() {
    if(!isQueue){
      if(document.getElementById('staff-board-data')){if(!await window.sfStaffBoardRefresh?.())throw new Error('Work board refresh failed.');return;}
      await refreshCare();return;
    }
    if(refreshing)throw new Error('A queue refresh is already running.');
    refreshing=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    const refreshButton=document.getElementById('staff-refresh') as HTMLButtonElement;refreshButton.disabled=true;
    const queue=document.querySelector('.staff-queue')!;queue.setAttribute('aria-busy','true');
    try {
      const response=await sfSchoolFetch(window.location.href,{headers:{Accept:'text/html'},cache:'no-store',signal:controller.signal});
      const html=await response.text();const doc=new DOMParser().parseFromString(html,'text/html');
      const data=doc.getElementById('staff-queue-data');
      if(!response.ok || !data)throw new Error('The queue could not be refreshed. Your staff session may have expired.');
      const fresh:QueueItem[]=JSON.parse(data.textContent || '[]');
      // Keep the delegated row container and current form drafts intact.
      document.querySelector('.staff-rows')!.replaceChildren(...Array.from(doc.querySelector('.staff-rows')!.children));
      for(const selector of ['.staff-metrics','.staff-status-tabs','.staff-pagination','#staff-result-count','#staff-pending-count','#staff-saved-views']){
        const target=document.querySelector(selector);const source=doc.querySelector(selector);
        if(target && source)target.replaceChildren(...Array.from(source.childNodes));
      }
      items=fresh;document.getElementById('staff-queue-data')!.textContent=JSON.stringify(items);
      (document.getElementById('staff-export') as HTMLButtonElement).disabled=!items.length;
      if(response.url!==window.location.href)window.history.replaceState(null,'',response.url);
      pageMessage.textContent='Queue updated.';pageMessage.classList.add('is-success');
    } finally {clearTimeout(timer);refreshing=false;refreshButton.disabled=false;queue.removeAttribute('aria-busy');}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!active || busy || noteBusy || saved || window.sfStaffProgress?.isBusy())return;
    const moveNext=(event as SubmitEvent).submitter===saveNext;
    if(moveNext && window.sfStaffProgress?.hasDraft()){selectTab('progress');message.textContent='Post or clear your progress draft before moving to the next suggestion.';window.sfStaffProgress.focusDraft();return;}
    if(moveNext && internalNote.value.trim()){selectTab('notes');internalMessage.textContent='Save or clear your private-note draft before moving to the next suggestion.';internalNote.focus();return;}
    selectTab('decision');
    if(!targetDate.validity.valid){targetDate.setAttribute('aria-invalid','true');document.getElementById('review-date-error')!.textContent='Choose a valid date between 2000 and 2100.';}
    if(!form.reportValidity())return;
    if(/\[(explain the decision|provide a helpful option)\]/i.test(note.value)){message.textContent='Replace the template placeholders with your actual decision and next step.';note.focus();return;}
    busy=true;discardWarning.hidden=true;fields.disabled=true;save.disabled=true;saveNext.disabled=true;save.textContent='Saving…';
    form.setAttribute('aria-busy','true');dialog.querySelectorAll<HTMLButtonElement>('[data-close-review]').forEach(b=>{b.disabled=true;});
    message.classList.remove('is-success');message.textContent='';
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    const savedId=active.id;let nextId:string | undefined;
    const index=items.findIndex(i=>i.id===active?.id);
    const candidates=[...items.slice(index+1),...items.slice(0,index)].map(i=>i.id);
    try {
      const response=await sfSchoolFetch('/api/staff/submissions/'+encodeURIComponent(savedId)+'/review',{
        method:'PATCH',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({status:status.value,note:note.value.trim(),assignee:assignee.value || null,priority:priority.value,targetDate:targetDate.value || null,updatedAt:active.updated_at})
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok || body?.success!==true)throw new Error(response.status===409?'Someone changed this suggestion. Copy your draft, then refresh the queue before saving again.':response.status===401 || response.status===403?'Your staff session expired or access changed. Sign in again before retrying.':response.status===400?body?.error || 'Check your review values.':'The update was not saved. Try again; your draft is still here.');
      saved=true;reviewed.add(savedId);save.hidden=true;saveNext.hidden=true;document.getElementById('review-dismiss')!.textContent='Done';
      message.classList.add('is-success');message.textContent='Review saved. Updating this workspace…';updateDraft();void loadActivity();
      try {
        await refreshQueue();
        nextId=moveNext?candidates.find(id=>!reviewed.has(id) && items.some(i=>i.id===id)) || items.find(i=>i.id!==savedId && !reviewed.has(i.id))?.id:undefined;
        message.textContent=moveNext && !nextId?'Saved. You have reviewed every available suggestion on this page.':'Review saved. This workspace is up to date.';
      } catch {message.textContent='Review saved, but this workspace could not refresh. Your changes were saved; refresh the page to see the latest cards.';}
    } catch(error) {
      message.textContent=error instanceof Error && error.name!=='AbortError' && !(error instanceof TypeError)?error.message:'We could not confirm the save. Your draft is still here. Refresh the queue before retrying.';
    } finally {
      clearTimeout(timer);busy=false;fields.disabled=saved;save.disabled=saved;saveNext.disabled=saved;save.textContent='Save assignment';
      form.removeAttribute('aria-busy');dialog.querySelectorAll<HTMLButtonElement>('[data-close-review]').forEach(b=>{b.disabled=false;});
      if(nextId)openReview(nextId);else{if(saved)void window.sfStaffProgress?.refresh();message.focus();}
    }
  });
  async function request(url: string, method: string, payload?: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await sfSchoolFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Request failed. Try again.');
      return body;
    } finally { clearTimeout(timer); }
  }
  function activityCard(container: HTMLElement, heading: string, body: string, timestamp: string) {
    const article = document.createElement('article');
    const title = document.createElement('strong'); title.textContent = heading;
    const time = document.createElement('time'); time.dateTime = timestamp;
    time.textContent = new Date(timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const text = document.createElement('p'); text.textContent = body;
    article.append(title, time, text); container.append(article);
  }
  async function loadActivity() {
    if (!active) return;
    activityRequest?.abort();
    const controller = new AbortController(); activityRequest = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    const history = document.getElementById('review-history')!;
    const notes = document.getElementById('review-internal-notes')!;
    history.replaceChildren(); notes.replaceChildren();
    activityMessage.textContent = 'Loading history and private notes…';
    document.getElementById('review-notes-state')!.textContent = 'Loading private notes…';
    try {
      const response = await sfSchoolFetch('/api/staff/submissions/' + encodeURIComponent(active.id) + '/activity', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('History could not be loaded. Your review draft is safe; use Refresh history & notes to retry.');
      if (activityRequest !== controller || !dialog.open) return;
      const events: Array<{ heading: string; body: string; created_at: string }> = [];
      const knownTransitions = new Set<string>();
      for (const entry of data.history || []) {
        const changes: string[] = [];
        const before = entry.previous; const after = entry.current;
        if (before.status !== after.status) { changes.push('Status: ' + labels[before.status] + ' → ' + labels[after.status]); knownTransitions.add([before.status, after.status, entry.created_at, after.response || ''].join('|')); }
        if (before.assignee_id !== after.assignee_id) changes.push('Assigned staff: ' + (after.assignee_id ? assignee.querySelector<HTMLOptionElement>('option[value="' + after.assignee_id + '"]')?.textContent || 'Staff member' : 'Unassigned'));
        if (before.priority !== after.priority) changes.push('Priority: ' + before.priority + ' → ' + after.priority);
        if (before.target_date !== after.target_date) changes.push('Target date: ' + (after.target_date || 'Cleared'));
        if (before.response !== after.response) changes.push('Public response: ' + (after.response || 'Cleared'));
        events.push({ heading: entry.actor?.display_name || 'Staff member', body: changes.join('\n') || 'Review confirmed; no fields changed.', created_at: entry.created_at });
      }
      for (const entry of data.transitions || []) {
        if (knownTransitions.has([entry.old_status, entry.new_status, entry.created_at, entry.note || ''].join('|'))) continue;
        events.push({ heading: 'Status update', body: (labels[entry.old_status] || 'Received') + ' → ' + labels[entry.new_status] + (entry.note ? '\nPublic response: ' + entry.note : ''), created_at: entry.created_at });
      }
      events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).forEach(e => activityCard(history, e.heading, e.body, e.created_at));
      for (const entry of data.notes || []) activityCard(notes, entry.actor?.display_name || 'Staff member', entry.body, entry.created_at);
      if (!events.length) history.append(sfEmptyState({compact:true,icon:'clock',heading:'No review changes yet',description:'Saved assignments and review decisions will create a record here.'}));
      if (!data.notes?.length) notes.append(sfEmptyState({compact:true,icon:'message',heading:'A space for staff context',description:'Add a private note above to help other staff. These notes never appear in the community feed.'}));
      activityMessage.textContent = '';
      document.getElementById('review-notes-state')!.textContent = '';
    } catch (error) {
      if (activityRequest === controller && dialog.open) {
        activityMessage.textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'History request timed out. Refresh to retry.';
        document.getElementById('review-notes-state')!.textContent = 'Private notes could not load. Open History and choose Refresh to retry.';
      }
    } finally { clearTimeout(timer); }
  }
  document.getElementById('review-retry-activity')!.addEventListener('click', () => void loadActivity());
  internalForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!active || busy || noteBusy || window.sfStaffProgress?.isBusy() || !internalForm.reportValidity()) return;
    noteBusy = true;
    const button = document.getElementById('review-add-note') as HTMLButtonElement;
    button.disabled = true; internalNote.disabled = true; internalMessage.textContent = 'Saving private note…';
    try {
      await request('/api/staff/submissions/' + encodeURIComponent(active.id) + '/notes', 'POST', { body: internalNote.value.trim() });
      internalNote.value = ''; internalMessage.textContent = 'Private note saved.'; updateDraft(); void loadActivity();
    } catch { internalMessage.textContent = 'Could not confirm the note was saved. Refresh notes before retrying to avoid a duplicate. Your draft is still here.'; }
    finally { noteBusy = false; button.disabled = false; internalNote.disabled = false; }
  });
  window.sfStaffProgress?.bind({
    canPost:()=>!busy && !noteBusy && !hasReviewDraft() && !hasRepairDraft(),
    applySnapshot(submission){
      if(!active || active.id!==submission.id || busy)return false;
      if(hasReviewDraft())return active.updated_at===submission.updated_at;
      const normalized={...submission,staff_note:submission.staff_note || '',assignee_id:submission.assignee_id || '',priority:submission.priority || 'normal',target_date:submission.target_date || ''};
      Object.assign(active,normalized);
      const queued=items.find(item=>item.id===submission.id);if(queued)Object.assign(queued,normalized);
      status.value=active.status;note.value=active.staff_note;priority.value=active.priority;targetDate.value=active.target_date;
      if(active.assignee_id && !Array.from(assignee.options).some(option=>option.value===active!.assignee_id)){
        const option=new Option('Former staff — choose an active assignee',active.assignee_id);option.dataset.formerStaff='true';assignee.add(option);
      }
      assignee.value=active.assignee_id;
      const badge=document.getElementById('review-current-status')!;badge.textContent=labels[active.status] || active.status;badge.dataset.status=active.status;
      saved=false;const posting=window.sfStaffProgress?.isBusy() || false;fields.disabled=posting;save.disabled=posting;saveNext.disabled=posting;
      const onProgress=dialog.querySelector('[data-review-tab="progress"]')?.getAttribute('aria-selected')==='true';
      save.hidden=onProgress;saveNext.hidden=!isQueue || !items.some(i=>i.id===active?.id) || onProgress;document.getElementById('review-dismiss')!.textContent='Cancel';
      updateHint();updateCount();return true;
    },
    async afterPost(){await refreshQueue();void loadActivity();},
    changed:updateDraft,
    posting(value){
      fields.disabled=value || saved;
      save.disabled=value || saved;saveNext.disabled=value || saved;
      (document.getElementById('review-add-note') as HTMLButtonElement).disabled=value;
      dialog.querySelectorAll<HTMLButtonElement>('[data-close-review]').forEach(button=>{button.disabled=value;});
      updateDraft();
    }
  });
  const initial=new URL(window.location.href).searchParams.get('idea');
  if(initial && sfSchoolRoute(window.location.pathname)==='/admin')void openReview(initial);
  if(!isQueue)return;
  const viewDialog=document.getElementById('staff-save-view-dialog') as HTMLDialogElement;
  const viewMessage=document.getElementById('staff-view-message')!;
  document.getElementById('staff-open-save-view')!.addEventListener('click',()=>{viewMessage.textContent='';viewDialog.showModal();});
  document.getElementById('staff-close-save-view')!.addEventListener('click',()=>viewDialog.close());
  viewDialog.addEventListener('close',()=>document.getElementById('staff-open-save-view')!.focus());
  document.getElementById('staff-save-view')!.addEventListener('submit',async event=>{
    event.preventDefault();const viewForm=event.currentTarget as HTMLFormElement;if(!viewForm.reportValidity())return;
    const button=viewForm.querySelector<HTMLButtonElement>('[type="submit"]')!;button.disabled=true;
    try {
      await request('/api/staff/views','POST',{name:(document.getElementById('staff-view-name') as HTMLInputElement).value,filters:JSON.parse(document.getElementById('staff-filter-data')!.textContent || '{}')});
      viewDialog.close();
      try{await refreshQueue();}catch{pageMessage.textContent='View saved. Use Refresh to update your sidebar.';}
    } catch(error){viewMessage.textContent=error instanceof Error?error.message:'Could not save view.';}
    finally{button.disabled=false;}
  });
  document.getElementById('staff-saved-views')!.addEventListener('click',async event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-delete-view]');if(!button)return;
    if(button.dataset.confirm!=='true'){button.dataset.confirm='true';button.textContent='Remove?';return;}
    button.disabled=true;
    try{await request('/api/staff/views/'+encodeURIComponent(button.dataset.deleteView!),'DELETE');button.parentElement!.remove();}
    catch{pageMessage.classList.remove('is-success');pageMessage.textContent='Could not remove the saved view. Try again.';button.disabled=false;}
  });
  document.getElementById('staff-refresh')!.addEventListener('click',async()=>{
    try{await refreshQueue();}catch{pageMessage.classList.remove('is-success');pageMessage.textContent='The queue could not refresh. Check your connection and staff session, then try again.';}
  });
  document.getElementById('staff-export')!.addEventListener('click', () => {
    // Quote every cell and neutralize spreadsheet formulas in user-written content.
    const cell = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
    const rows = [['ID', 'Title', 'Category', 'Status', 'Received'], ...items.map(item => [item.id, item.title, item.category, labels[item.status], item.created_at])];
    const csv = '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'suggfeed-review-page.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
