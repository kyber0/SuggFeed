(() => {
  interface QueueItem { id:string; title:string; description:string; category:string; status:string; created_at:string; updated_at:string; staff_note:string; assignee_id:string; priority:string; target_date:string; }
  let items:QueueItem[] = JSON.parse(document.getElementById('staff-queue-data')!.textContent || '[]');
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
  const pageMessage = document.getElementById('staff-page-message')!;
  const discardWarning = document.getElementById('review-discard-warning')!;
  const reviewed = new Set<string>();
  let noteBusy=false, busy=false, saved=false, refreshing=false;
  let activityRequest:AbortController | undefined;
  let active:QueueItem | undefined;
  let returnFocus:HTMLElement | null=null;
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
  }
  const tabs=Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-review-tab]'));
  tabs.forEach((button,index)=>{
    button.addEventListener('click',()=>selectTab(button.dataset.reviewTab!));
    button.addEventListener('keydown',event=>{
      const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
      if(next>=0){event.preventDefault();selectTab(tabs[next].dataset.reviewTab!,true);}
    });
  });
  function hasUnsavedChanges() {
    return Boolean(internalNote.value.trim() || (active && !saved && (status.value!==active.status || note.value!==active.staff_note || assignee.value!==active.assignee_id || priority.value!==active.priority || targetDate.value!==active.target_date)));
  }
  function updateDraft() {document.getElementById('review-draft-state')!.textContent=hasUnsavedChanges()?'Unsaved changes':saved?'Changes saved':'No unsaved changes';}
  function updateHint(){document.getElementById('review-status-hint')!.textContent=hints[status.value] || '';}
  function updateCount(){document.getElementById('review-note-count')!.textContent=note.value.length.toLocaleString()+' / 2,000';updateDraft();}
  function close(discard=false){
    if(busy || noteBusy) return;
    if(!discard && hasUnsavedChanges()){discardWarning.hidden=false;document.getElementById('review-keep-editing')!.focus();return;}
    dialog.close();
  }
  function openReview(id:string, trigger?:HTMLElement) {
    const item=items.find(i=>i.id===id); if(!item)return;
    active=item; returnFocus=trigger || document.querySelector<HTMLElement>('[data-review="'+id+'"]');
    saved=false; fields.disabled=false; save.disabled=false; save.hidden=false; saveNext.hidden=false; saveNext.disabled=false;
    save.textContent='Save update'; discardWarning.hidden=true; message.textContent=''; message.classList.remove('is-success');
    document.getElementById('review-dismiss')!.textContent='Cancel';
    document.getElementById('review-title')!.textContent=item.title;
    document.getElementById('review-description')!.textContent=item.description;
    document.getElementById('review-meta')!.textContent=item.category+' · Received '+new Date(item.created_at).toLocaleDateString('en-PH',{dateStyle:'medium'});
    document.getElementById('review-position')!.textContent='Item '+(items.indexOf(item)+1)+' of '+items.length+' on this page';
    const badge=document.getElementById('review-current-status')!; badge.textContent=labels[item.status];badge.dataset.status=item.status;
    status.value=item.status;note.value=item.staff_note;priority.value=item.priority;targetDate.value=item.target_date;
    assignee.querySelector('[data-former-staff]')?.remove();
    if(item.assignee_id && !Array.from(assignee.options).some(o=>o.value===item.assignee_id)){
      const option=new Option('Former staff — choose an active assignee',item.assignee_id);option.dataset.formerStaff='true';assignee.add(option);
    }
    assignee.value=item.assignee_id; internalNote.value='';internalMessage.textContent='';
    targetDate.removeAttribute('aria-invalid');document.getElementById('review-date-error')!.textContent='';
    updateHint();updateCount();selectTab('decision');
    if(!dialog.open)dialog.showModal();else tabs[0].focus();
    dialog.querySelector('.staff-review-scroll')!.scrollTop=0;
    void loadActivity();
  }
  document.querySelector('.staff-rows')!.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-review]');
    if(button)openReview(button.dataset.review!,button);
  });
  document.querySelectorAll('[data-close-review]').forEach(button=>button.addEventListener('click',()=>close()));
  document.getElementById('review-keep-editing')!.addEventListener('click',()=>{discardWarning.hidden=true;selectTab(internalNote.value.trim()?'notes':'decision');(internalNote.value.trim()?internalNote:note).focus();});
  document.getElementById('review-discard-confirm')!.addEventListener('click',()=>close(true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog && event.clientX<dialog.getBoundingClientRect().left)close();});
  dialog.addEventListener('close',()=>{activityRequest?.abort();if(returnFocus?.isConnected)returnFocus.focus();else document.getElementById('staff-queue-title')!.focus();});
  window.addEventListener('beforeunload',event=>{if(dialog.open && (busy || noteBusy || hasUnsavedChanges())){event.preventDefault();event.returnValue='';}});
  status.addEventListener('change',()=>{updateHint();updateDraft();});note.addEventListener('input',updateCount);
  [assignee,priority,targetDate,internalNote].forEach(input=>input.addEventListener('input',updateDraft));
  targetDate.addEventListener('input',()=>{targetDate.removeAttribute('aria-invalid');document.getElementById('review-date-error')!.textContent='';});
  document.getElementById('review-assign-me')!.addEventListener('click',()=>{
    if(Array.from(assignee.options).some(o=>o.value===currentUser)){assignee.value=currentUser;updateDraft();}
  });
  async function refreshQueue() {
    if(refreshing)throw new Error('A queue refresh is already running.');
    refreshing=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    const refreshButton=document.getElementById('staff-refresh') as HTMLButtonElement;refreshButton.disabled=true;
    const queue=document.querySelector('.staff-queue')!;queue.setAttribute('aria-busy','true');
    try {
      const response=await fetch(window.location.href,{headers:{Accept:'text/html'},cache:'no-store',signal:controller.signal});
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
    event.preventDefault();if(!active || busy || noteBusy || saved)return;
    const moveNext=(event as SubmitEvent).submitter===saveNext;
    if(moveNext && internalNote.value.trim()){selectTab('notes');internalMessage.textContent='Save or clear your private-note draft before moving to the next suggestion.';internalNote.focus();return;}
    selectTab('decision');
    if(!targetDate.validity.valid){targetDate.setAttribute('aria-invalid','true');document.getElementById('review-date-error')!.textContent='Choose a valid date between 2000 and 2100.';}
    if(!form.reportValidity())return;
    busy=true;discardWarning.hidden=true;fields.disabled=true;save.disabled=true;saveNext.disabled=true;save.textContent='Saving…';
    form.setAttribute('aria-busy','true');dialog.querySelectorAll<HTMLButtonElement>('[data-close-review]').forEach(b=>{b.disabled=true;});
    message.classList.remove('is-success');message.textContent='';
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    const savedId=active.id;let nextId:string | undefined;
    const candidates=[...items.slice(items.indexOf(active)+1),...items.slice(0,items.indexOf(active))].map(i=>i.id);
    try {
      const response=await fetch('/api/staff/submissions/'+encodeURIComponent(savedId)+'/review',{
        method:'PATCH',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({status:status.value,note:note.value.trim(),assignee:assignee.value || null,priority:priority.value,targetDate:targetDate.value || null,updatedAt:active.updated_at})
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok || body?.success!==true)throw new Error(response.status===409?'Someone changed this suggestion. Copy your draft, then refresh the queue before saving again.':response.status===401 || response.status===403?'Your staff session expired or access changed. Sign in again before retrying.':response.status===400?body?.error || 'Check your review values.':'The update was not saved. Try again; your draft is still here.');
      saved=true;reviewed.add(savedId);save.hidden=true;saveNext.hidden=true;document.getElementById('review-dismiss')!.textContent='Back to queue';
      message.classList.add('is-success');message.textContent='Review saved. Updating the queue…';updateDraft();void loadActivity();
      try {
        await refreshQueue();
        nextId=moveNext?candidates.find(id=>!reviewed.has(id) && items.some(i=>i.id===id)) || items.find(i=>i.id!==savedId && !reviewed.has(i.id))?.id:undefined;
        message.textContent=moveNext && !nextId?'Saved. You have reviewed every available suggestion on this page.':'Review saved. The queue is up to date.';
      } catch {message.textContent='Review saved, but the queue could not refresh. Close this panel and use Refresh before reviewing another suggestion.';}
    } catch(error) {
      message.textContent=error instanceof Error && error.name!=='AbortError' && !(error instanceof TypeError)?error.message:'We could not confirm the save. Your draft is still here. Refresh the queue before retrying.';
    } finally {
      clearTimeout(timer);busy=false;fields.disabled=saved;save.disabled=saved;saveNext.disabled=saved;save.textContent='Save update';
      form.removeAttribute('aria-busy');dialog.querySelectorAll<HTMLButtonElement>('[data-close-review]').forEach(b=>{b.disabled=false;});
      if(nextId)openReview(nextId);else message.focus();
    }
  });
  async function request(url: string, method: string, payload?: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: controller.signal });
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
      const response = await fetch('/api/staff/submissions/' + encodeURIComponent(active.id) + '/activity', { signal: controller.signal });
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
      if (!events.length) history.textContent = 'No review changes recorded yet.';
      if (!data.notes?.length) notes.textContent = 'No internal notes yet.';
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
    if (!active || busy || noteBusy || !internalForm.reportValidity()) return;
    noteBusy = true;
    const button = document.getElementById('review-add-note') as HTMLButtonElement;
    button.disabled = true; internalNote.disabled = true; internalMessage.textContent = 'Saving private note…';
    try {
      await request('/api/staff/submissions/' + encodeURIComponent(active.id) + '/notes', 'POST', { body: internalNote.value.trim() });
      internalNote.value = ''; internalMessage.textContent = 'Private note saved.'; updateDraft(); void loadActivity();
    } catch { internalMessage.textContent = 'Could not confirm the note was saved. Refresh notes before retrying to avoid a duplicate. Your draft is still here.'; }
    finally { noteBusy = false; button.disabled = false; internalNote.disabled = false; }
  });
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
