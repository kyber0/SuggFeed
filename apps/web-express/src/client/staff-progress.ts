interface StaffProgressSnapshot {
  id:string; status:string; updated_at:string; staff_note:string | null; assignee_id:string | null;
  priority:string | null; target_date:string | null; progress_percent:number | null;
  started_at:string | null; is_blocked:boolean; resolved_at:string | null;
}
interface StaffProgressHost {
  canPost():boolean;
  applySnapshot(submission:StaffProgressSnapshot):boolean;
  afterPost(submission:StaffProgressSnapshot):Promise<void>;
  changed():void;
  posting(busy:boolean):void;
}
interface Window {
  sfStaffProgress?:{
    bind(host:StaffProgressHost):void;
    open(item:{id:string;status:string;title:string}):void;
    refresh():Promise<void>;
    hasDraft():boolean;
    isBusy():boolean;
    focusDraft():void;
    close():void;
  };
}

(() => {
  const form=document.getElementById('staff-progress-form') as HTMLFormElement;
  if(!form)return;
  interface ProgressEvent {
    id:string; kind:string; body:string; visibility:string; percent:number | null; blocked_reason:string | null;
    next_step:string | null; occurred_on:string; office_label:string; created_at:string; request_id?:string;
  }
  const fields=document.getElementById('staff-progress-fields') as HTMLFieldSetElement;
  const kind=document.getElementById('staff-progress-kind') as HTMLSelectElement;
  const visibility=document.getElementById('staff-progress-visibility') as HTMLSelectElement;
  const body=document.getElementById('staff-progress-body') as HTMLTextAreaElement;
  const percent=document.getElementById('staff-progress-percent') as HTMLSelectElement;
  const blocked=document.getElementById('staff-progress-blocked-reason') as HTMLSelectElement;
  const nextStep=document.getElementById('staff-progress-next-step') as HTMLInputElement;
  const date=document.getElementById('staff-progress-date') as HTMLInputElement;
  const notify=document.getElementById('staff-progress-notify') as HTMLInputElement;
  const state=document.getElementById('staff-progress-state')!;
  const message=document.getElementById('staff-progress-message')!;
  const history=document.getElementById('staff-progress-history')!;
  const summary=document.getElementById('staff-progress-summary')!;
  const refresh=document.getElementById('staff-progress-refresh') as HTMLButtonElement;
  const post=document.getElementById('staff-progress-post') as HTMLButtonElement;
  const labels:Record<string,string>={started:'Work started',update:'Progress update',milestone:'Milestone reached',blocked:'Work is blocked',completed:'Work completed',correction:'Correction'};
  const reasons:Record<string,string>={budget:'Budget',parts:'Parts or supplies',approval:'Approval',scheduling:'Scheduling',other:'Other'};
  const hints:Record<string,string>={
    started:'Tell the community that work has begun.',update:'Share what changed. Leave the progress estimate blank to keep it unchanged.',
    milestone:'Record a meaningful step toward completion.',blocked:'Explain the delay and choose the reason the work is blocked.',
    completed:'Confirm the work is finished. A public completion update marks progress as 100%.',correction:'Explain what was incorrect and give the correct information. The original update stays visible.'
  };
  let host:StaffProgressHost | undefined;
  let active:{id:string;status:string;title:string} | undefined;
  let snapshot:StaffProgressSnapshot | undefined;
  let controller:AbortController | undefined;
  let loading=false,posting=false,baseline='',generation=0;
  let retry:{payload:string;requestId:string} | undefined;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const published=()=>!!snapshot && ['approved','in_progress','resolved'].includes(snapshot.status);
  const value=()=>JSON.stringify({kind:kind.value,body:body.value,visibility:visibility.value,percent:percent.value,blocked:blocked.value,nextStep:nextStep.value,date:date.value,notify:notify.checked});
  const hasDraft=()=>Boolean(active && baseline && value()!==baseline);
  function setMessage(text:string,success=false){message.textContent=text;message.classList.toggle('is-success',success);}
  function dateText(value:string){const parsed=new Date(value.length===10?value+'T12:00:00+08:00':value);return Number.isFinite(parsed.getTime())?parsed.toLocaleDateString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium'}):'Date unavailable';}
  function resetDraft(){
    form.reset();kind.value='update';visibility.value=published()?'public':'staff';percent.value='';blocked.value='';nextStep.value='';
    date.value=today();date.max=today();date.min=new Date(Date.parse(today()+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);
    (document.getElementById('staff-progress-advanced') as HTMLDetailsElement).open=false;
    retry=undefined;updateComposer();baseline=value();host?.changed();
  }
  function updateComposer(){
    const privateOnly=!published();const staffOnly=visibility.value==='staff';
    visibility.querySelector<HTMLOptionElement>('option[value="public"]')!.disabled=privateOnly;
    document.getElementById('staff-progress-audience-hint')!.textContent=staffOnly
      ?'Only school staff can see this update. It will not change public status, progress, or dates.'
      :'This message, next step, and event date will be visible on the public roadmap. Check for private details before publishing.';
    document.getElementById('staff-progress-kind-hint')!.textContent=hints[kind.value] || '';
    document.getElementById('staff-progress-blocked-field')!.hidden=kind.value!=='blocked';
    blocked.required=kind.value==='blocked';blocked.disabled=kind.value!=='blocked';
    const isCompleted=kind.value==='completed';
    percent.disabled=staffOnly || isCompleted || snapshot?.status==='resolved';
    percent.querySelector<HTMLOptionElement>('option[value="100"]')!.disabled=!isCompleted;
    if(isCompleted && !staffOnly)percent.value='100';
    notify.disabled=staffOnly;document.getElementById('staff-progress-notify-field')!.hidden=staffOnly;
    document.getElementById('staff-progress-percent-hint')!.textContent=staffOnly?'Staff-only updates do not change public progress.':isCompleted?'Completion sets public progress to 100%.':snapshot?.status==='resolved'?'Completed ideas keep their completion estimate. Reopen the idea in Review to change progress.':'Blank keeps the current estimate. Use increments of 5%.';
    document.getElementById('staff-progress-count')!.textContent=body.value.length+' / 600';
    document.getElementById('staff-progress-preview-title')!.textContent=staffOnly?'Staff-only preview':'Public preview';
    const preview=document.getElementById('staff-progress-preview')!;preview.dataset.visibility=visibility.value;
    document.getElementById('staff-progress-preview-kind')!.textContent=labels[kind.value] || 'Progress update';
    document.getElementById('staff-progress-preview-body')!.textContent=body.value.trim() || 'Your update will appear here before you publish it.';
    const next=document.getElementById('staff-progress-preview-next')!;next.hidden=!nextStep.value.trim();next.textContent='Next: '+nextStep.value.trim();
    const previewMeta=[date.value?dateText(date.value):'Choose an event date'];
    if((!staffOnly && percent.value && !percent.disabled) || (!staffOnly && isCompleted))previewMeta.push(percent.value+'% complete');
    if(kind.value==='blocked' && blocked.value)previewMeta.push('Blocked: '+reasons[blocked.value]);
    previewMeta.push(staffOnly?'Staff only':'Posted by the school');
    document.getElementById('staff-progress-preview-meta')!.textContent=previewMeta.join(' · ');
    post.textContent=posting?'Posting…':staffOnly?'Post staff update':kind.value==='correction'?'Publish correction':'Publish update';
    host?.changed();
  }
  function drawSummary(){
    if(!snapshot){summary.hidden=true;return;}
    const progress=snapshot.progress_percent===null?'No progress estimate':snapshot.progress_percent+'% complete';
    summary.textContent=progress+(snapshot.is_blocked?' · Work is blocked':'')+(snapshot.status==='resolved'?' · Completed':'');summary.hidden=false;
  }
  function drawHistory(updates:ProgressEvent[]){
    history.replaceChildren();document.getElementById('staff-progress-history-limit')!.hidden=updates.length<100;
    if(!updates.length){const empty=document.createElement('p');empty.className='staff-progress-empty';empty.textContent='No progress updates yet. Add the first update when there is something to share.';history.append(empty);return;}
    for(const update of updates){
      const article=document.createElement('article');article.className='staff-progress-event';article.dataset.visibility=update.visibility;
      const heading=document.createElement('div');heading.className='staff-progress-event-heading';
      const title=document.createElement('strong');title.textContent=labels[update.kind] || 'Progress update';
      const audience=document.createElement('span');audience.className='workspace-tag';audience.textContent=update.visibility==='public'?'Public':'Staff only';heading.append(title,audience);
      const text=document.createElement('p');text.className='staff-progress-event-body';text.textContent=update.body;
      const time=document.createElement('time');time.dateTime=update.created_at;time.textContent='Happened '+dateText(update.occurred_on)+' · Posted '+dateText(update.created_at);
      article.append(heading,text,time);
      const details:string[]=[];
      if(update.percent!==null && update.percent!==undefined)details.push(update.percent+'% complete');
      if(update.blocked_reason)details.push('Blocked: '+(reasons[update.blocked_reason] || update.blocked_reason));
      if(update.next_step)details.push('Next: '+update.next_step);
      if(details.length){const detail=document.createElement('p');detail.className='staff-progress-event-details';detail.textContent=details.join(' · ');article.append(detail);}
      const office=document.createElement('small');office.textContent=update.office_label || 'School staff';article.append(office);
      if(update.visibility==='public'){
        const correction=document.createElement('button');correction.type='button';correction.className='workspace-text-link staff-progress-correct';correction.textContent='Write a correction';
        correction.addEventListener('click',()=>{
          if(posting)return;
          if(hasDraft()){setMessage('Your current draft is still here. Post it or clear it before starting a correction.');message.focus();return;}
          kind.value='correction';visibility.value=published()?'public':'staff';body.value='Correction to the update from '+dateText(update.occurred_on)+': ';updateComposer();body.focus();
        });article.append(correction);
      }
      history.append(article);
    }
  }
  async function load(){
    if(!active || posting)return;
    controller?.abort();const request=new AbortController();controller=request;const ownGeneration=generation;
    const timer=setTimeout(()=>request.abort(),20000);loading=true;refresh.disabled=true;fields.disabled=true;
    state.textContent='Loading progress and update history…';history.setAttribute('aria-busy','true');
    try{
      const response=await fetch('/staff/workspace/'+encodeURIComponent(active.id)+'/updates',{headers:{Accept:'application/json'},cache:'no-store',signal:request.signal});
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success || !data.submission)throw new Error(response.status===401 || response.status===403?'Your staff session expired or access changed. Sign in again.':'Progress could not load. Use Refresh to try again.');
      if(generation!==ownGeneration || controller!==request)return;
      const hadDraft=hasDraft();snapshot=data.submission;
      const synchronized=host?.applySnapshot(snapshot)!==false;
      const updates:ProgressEvent[]=Array.isArray(data.updates)?data.updates:[];
      const confirmedRetry=retry && updates.some(update=>update.request_id===retry!.requestId);
      drawSummary();drawHistory(updates);
      if(!hadDraft || confirmedRetry){resetDraft();}else updateComposer();
      if(confirmedRetry)setMessage('Your previous update was posted successfully. The history and review are now current.',true);
      state.textContent=!synchronized?'The review has unsaved changes and a newer version is available. Save or discard those changes before posting progress.':!published()?'This idea is not public. Approve it in Review before posting updates to the community.':'';
      fields.disabled=false;
    }catch(error){if(generation===ownGeneration && controller===request)state.textContent=error instanceof Error && error.name!=='AbortError'?error.message:'Progress request timed out. Use Refresh to retry; your draft is safe.';}
    finally{clearTimeout(timer);if(generation===ownGeneration && controller===request){loading=false;refresh.disabled=false;history.removeAttribute('aria-busy');}}
  }
  for(const input of [kind,visibility,body,percent,blocked,nextStep,date,notify])input.addEventListener('input',()=>{setMessage('');updateComposer();});
  kind.addEventListener('change',()=>{if(kind.value!=='completed' && percent.value==='100' && snapshot?.progress_percent!==100)percent.value='';notify.checked=['started','milestone','blocked','completed'].includes(kind.value);updateComposer();});
  refresh.addEventListener('click',()=>void load());
  document.getElementById('staff-progress-clear')!.addEventListener('click',()=>{if(!posting){resetDraft();setMessage('Draft cleared.');body.focus();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(posting || loading || !active || !snapshot)return;
    if(host?.canPost()===false){setMessage('Save or discard changes in Review before posting a progress update. Your progress draft is safe here.');message.focus();return;}
    if(!body.value.trim()){body.setCustomValidity('Write a short update before posting.');body.reportValidity();body.setCustomValidity('');return;}
    if(!date.validity.valid)(document.getElementById('staff-progress-advanced') as HTMLDetailsElement).open=true;
    if(!form.reportValidity())return;
    if(visibility.value==='public' && snapshot.status==='resolved' && !['update','correction'].includes(kind.value)){
      setMessage('This idea is completed. Choose Progress update or Correction, or reopen it in Review first.');kind.focus();return;
    }
    const payload={updatedAt:snapshot.updated_at,kind:kind.value,body:body.value.trim(),visibility:visibility.value,
      percent:visibility.value==='staff' || (percent.disabled && kind.value!=='completed')?null:percent.value===''?null:Number(percent.value),
      blockedReason:kind.value==='blocked'?blocked.value:null,nextStep:nextStep.value.trim() || null,occurredOn:date.value,notify:visibility.value==='public' && notify.checked};
    const serialized=JSON.stringify(payload);
    if(!retry || retry.payload!==serialized)retry={payload:serialized,requestId:crypto.randomUUID()};
    const requestId=retry.requestId;const ownGeneration=generation;
    posting=true;fields.disabled=true;refresh.disabled=true;form.setAttribute('aria-busy','true');host?.posting(true);updateComposer();setMessage('Posting update…');
    const request=new AbortController();const timer=setTimeout(()=>request.abort(),20000);
    try{
      const response=await fetch('/staff/workspace/'+encodeURIComponent(active.id)+'/updates',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({...payload,requestId}),signal:request.signal});
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success || !data.submission){
        if(response.status===409)throw new Error('This idea changed before your update was posted. Refresh progress, review the latest information, then retry. Your draft has been kept.');
        if(response.status===401 || response.status===403)throw new Error('Your staff session expired or access changed. Sign in again; your draft is still here.');
        if(response.status===400)throw new Error(data?.error || 'Check the update type, message, estimate, and event date.');
        throw new Error('We could not confirm the update. Retry the same draft to safely check and complete this post.');
      }
      if(generation!==ownGeneration)return;
      snapshot=data.submission;host?.applySnapshot(snapshot);resetDraft();drawSummary();
      try{await host?.afterPost(snapshot);setMessage(payload.visibility==='public'?'Public update posted. The review queue has been refreshed.':'Staff-only update posted. The public roadmap is unchanged.',true);}
      catch{setMessage('Update posted, but the queue could not refresh. Use Refresh before reviewing another idea.',true);}
    }catch(error){if(generation===ownGeneration)setMessage(error instanceof Error && error.name!=='AbortError' && !(error instanceof TypeError)?error.message:'We could not confirm the update. Your draft is safe. Retry this same draft to avoid a duplicate.');}
    finally{
      clearTimeout(timer);posting=false;host?.posting(false);form.removeAttribute('aria-busy');fields.disabled=!snapshot;refresh.disabled=false;updateComposer();host?.changed();
      if(generation===ownGeneration){if(message.classList.contains('is-success'))await load();message.focus();}
    }
  });
  window.sfStaffProgress={
    bind(value){host=value;},
    open(item){generation++;controller?.abort();active=item;snapshot=undefined;baseline='';history.replaceChildren();summary.hidden=true;fields.disabled=true;setMessage('');resetDraft();void load();},
    refresh:load,hasDraft,isBusy:()=>posting,
    focusDraft(){body.focus();},
    close(){generation++;controller?.abort();active=undefined;snapshot=undefined;baseline='';retry=undefined;loading=false;}
  };
})();
