(() => {
  const form=document.getElementById('submit-idea-form') as HTMLFormElement;
  if(!form)return;
  const storage=(window as any).sfSubmissionStorage;
  const remember=document.getElementById('sip-remember-draft') as HTMLInputElement;
  const status=document.getElementById('sip-recovery-status')!;
  const list=document.getElementById('sip-queue-list')!;
  const restore=document.getElementById('sip-restore-draft') as HTMLButtonElement;
  const discard=document.getElementById('sip-discard-draft') as HTMLButtonElement;
  const receiptButton=document.getElementById('sip-check-receipt') as HTMLButtonElement;
  const title=document.getElementById('sip-title') as HTMLInputElement,description=document.getElementById('sip-description') as HTMLTextAreaElement,anon=document.getElementById('sip-anon') as HTMLInputElement;
  const receiptKey='sf:submission-receipt:v1';
  let context:any=null, savedDraft:any=null, currentReceipt:any=null,dirty=false,saving=false,saveAgain=false,savedFingerprint='',busy=false;
  const tell=(text:string)=>status.textContent=text;
  const payload=()=>({title:title.value.trim(),description:description.value.trim(),category:document.querySelector<HTMLInputElement>('input[name="sip-category"]:checked')?.value || '',isAnonymous:anon.checked});
  const fingerprint=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  async function request(path:string,body?:unknown){
    const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();if(!response.ok || !data.success){const error=new Error(data.error || 'The request could not finish. Check its receipt before retrying.');Object.assign(error,{status:response.status});throw error;}return data;
  }
  async function getContext(){context=await request('submission-context');return context;}
  try {
    const value=JSON.parse(sessionStorage.getItem(receiptKey) || 'null');
    if(value?.version===1 && /^[0-9a-f-]{36}$/i.test(value.key) && /^[a-f0-9]{64}$/.test(value.actor) && /^[a-f0-9]{64}$/.test(value.fingerprint))currentReceipt=value;
  }catch{}
  function keepReceipt(operation:any,hash:string){
    currentReceipt={version:1,key:operation.key,actor:operation.actor,fingerprint:hash};
    try{sessionStorage.setItem(receiptKey,JSON.stringify(currentReceipt));}catch{tell('Receipt kept for this visit only. Browser storage is unavailable.');}
    receiptButton.disabled=false;
  }
  function clearReceipt(){currentReceipt=null;try{sessionStorage.removeItem(receiptKey);}catch{}receiptButton.disabled=true;}
  async function prepare(value:any,queued?:any){
    const current=await getContext(),hash=await fingerprint(value);
    if(queued && queued.actor!==current.actor)throw new Error('Account changed. Return to the original account and browser to send this queued idea.');
    if(currentReceipt && (currentReceipt.actor!==current.actor || currentReceipt.fingerprint!==hash || (queued && currentReceipt.key!==queued.key)))throw new Error('Check the previous submission receipt before sending different content or using another account.');
    if(!queued){try{queued=(await storage.records()).find(row=>row.kind==='operation' && row.actor===current.actor && (!currentReceipt || row.key===currentReceipt.key) && JSON.stringify(row.payload)===JSON.stringify(value));}catch{}}
    const operation=queued || {key:currentReceipt?.key || crypto.randomUUID(),version:1,kind:'operation',actor:current.actor,payload:value,state:'Sending',createdAt:Date.now(),expiresAt:Date.now()+storage.lifetime};
    keepReceipt(operation,hash);
    return operation;
  }
  function failed(error:any){
    if([400,401,403,410].includes(error.status))clearReceipt();
    tell('Needs attention. '+(error.message || 'Check the previous receipt before retrying.'));
  }
  async function finish(data:any,operation?:any){
    clearReceipt();dirty=false;savedFingerprint='';remember.checked=false;saveAgain=false;
    while(saving)await new Promise(resolve=>setTimeout(resolve,25));
    try{
      if(savedDraft && JSON.stringify(savedDraft.payload)===JSON.stringify(operation?.payload || payload()))await storage.remove('draft');
      if(operation)await storage.remove(operation.key);
      await renderQueue();tell('Sent. Your idea is recorded. Save its tracking code explicitly if you need anonymous access later.');
    }catch{tell('Sent, but local cleanup failed. Remove the saved item before sharing this device.');}
  }
  async function renderQueue(normalize=false){
    const rows=await storage.records(normalize);savedDraft=rows.find(x=>x.kind==='draft');restore.hidden=!savedDraft;discard.hidden=!savedDraft;
    list.replaceChildren();
    for(const row of rows.filter(x=>x.kind==='operation')){
      const item=document.createElement('li'),label=document.createElement('p');
      const state=row.state==='Ready to send' && !navigator.onLine?'Waiting for connection':row.state==='Waiting for connection' && navigator.onLine?'Ready to send':row.state;
      label.textContent=row.payload.title+' · '+state;item.append(label);
      const send=document.createElement('button');send.type='button';send.className='workspace-button';send.textContent='Send now';send.disabled=busy || !navigator.onLine;
      const remove=document.createElement('button');remove.type='button';remove.className='workspace-button';remove.textContent='Remove';remove.disabled=busy;
      send.addEventListener('click',()=>void sendQueued(row));
      remove.addEventListener('click',async()=>{
        if(busy || !confirm('Remove this queued idea? A previous timed-out send may already have been recorded. Check its receipt before removing it.'))return;
        try{await storage.remove(row.key);await renderQueue();tell('Queue item removed.');}catch(e){tell(e.message);}
      });item.append(send,remove);list.append(item);
    }
    if(!list.children.length){const empty=document.createElement('li');empty.textContent='No queued ideas.';list.append(empty);}
  }
  async function sendQueued(row:any){
    if(busy)return;busy=true;await renderQueue();tell('Sending queued idea…');
    try{
      const operation=await prepare(row.payload,row);await storage.put({...row,state:'Sending'});await renderQueue();
      const data=await request('submit',{...row.payload,requestId:operation.key,actor:operation.actor});
      await finish(data,operation);(window as any).sfShowSubmissionSuccess(data);
    }catch(e){try{await storage.put({...row,state:'Needs attention'});}catch{}failed(e);}
    finally{busy=false;await renderQueue();}
  }
  async function saveDraft(){
    if(!remember.checked || !dirty)return;
    if(saving){saveAgain=true;return;}saving=true;
    try{
      const value=payload(),now=Date.now();
      await storage.put({key:'draft',version:1,kind:'draft',createdAt:now,expiresAt:now+storage.lifetime,payload:value});
      savedFingerprint=JSON.stringify(value);tell('Draft saved on this device for seven days. Attachments are not saved.');
      await renderQueue();
    }catch(e){savedFingerprint='';tell(e.message);}
    finally{saving=false;if(saveAgain){saveAgain=false;void saveDraft();}}
  }
  form.addEventListener('input',e=>{if(e.target!==title && e.target!==description && e.target!==anon && !(e.target as HTMLElement).matches('input[name="sip-category"]'))return;dirty=true;void saveDraft();});
  remember.addEventListener('change',async()=>{
    if(remember.checked){
      if(savedDraft && JSON.stringify(savedDraft.payload)!==JSON.stringify(payload()) && !confirm('Replace the saved draft with this draft?')){remember.checked=false;return;}
      dirty=true;void saveDraft();
    }else{
      // Wait for an in-flight write before deleting, preventing late autosave from restoring it.
      while(saving)await new Promise(resolve=>setTimeout(resolve,25));
      try{await storage.remove('draft');savedDraft=null;savedFingerprint='';await renderQueue();tell('Draft recovery disabled and saved draft removed. Queued ideas remain until you send or remove them.');}catch(e){tell(e.message);}
    }
  });
  restore.addEventListener('click',()=>{
    if(!savedDraft)return;if((title.value || description.value) && !confirm('Replace the current text with the saved draft?'))return;
    title.value=savedDraft.payload.title;description.value=savedDraft.payload.description;anon.checked=savedDraft.payload.isAnonymous;
    document.querySelectorAll<HTMLInputElement>('input[name="sip-category"]').forEach(radio=>radio.checked=radio.value===savedDraft.payload.category);
    onCategorySelected(savedDraft.payload.category);handleTitleInput();handleDescInput();handleAnonToggle();remember.checked=true;dirty=true;savedFingerprint=JSON.stringify(payload());tell('Draft restored. Review it before sending.');(window as any).sfRestoreSubmissionStep(!!savedDraft.payload.category);
  });
  discard.addEventListener('click',async()=>{if(!confirm('Discard the saved draft on this device?'))return;try{await storage.remove('draft');savedFingerprint='';remember.checked=false;await renderQueue();tell('Saved draft discarded. Current editable text is unchanged.');}catch(e){tell(e.message);}});
  document.getElementById('sip-queue-btn')?.addEventListener('click',async()=>{
    if(busy)return;
    const value=payload();
    if(value.title.length<10 || value.description.length<20 || !document.querySelector<HTMLInputElement>('input[name="sip-category"]:checked') || !(document.getElementById('sip-consent') as HTMLInputElement).checked){tell('Complete the idea and accept the community notice before queueing.');return;}
    if(!remember.checked){tell('Enable saving on this device before queueing. Queue contents can be seen by others using this browser.');remember.focus();return;}
    busy=true;
    try{
      const current=navigator.onLine?await getContext():context;if(!current)throw new Error('Connect once to identify this browser. Your draft can still be saved offline.');
      if(!value.isAnonymous && !current.signedIn)throw new Error('Sign in before queueing a named idea.');
      const hash=await fingerprint(value);
      if(currentReceipt && (currentReceipt.actor!==current.actor || currentReceipt.fingerprint!==hash))throw new Error('Check the previous submission receipt before queueing different content.');
      const existing=(await storage.records()).find(x=>x.kind==='operation' && x.actor===current.actor && JSON.stringify(x.payload)===JSON.stringify(value));
      const key=currentReceipt?.key || existing?.key || crypto.randomUUID(),now=existing?.createdAt || Date.now();
      await storage.put({key,version:1,kind:'operation',actor:current.actor,payload:value,state:navigator.onLine?'Ready to send':'Waiting for connection',createdAt:now,expiresAt:now+storage.lifetime});
      tell('Queued on this device for seven days. Reconnect and choose Send now; queued ideas are never sent automatically.');await renderQueue();
    }catch(e){tell(e.message);}finally{busy=false;}
  });
  receiptButton.disabled=!currentReceipt;
  receiptButton.addEventListener('click',async()=>{
    if(!currentReceipt || busy)return;busy=true;receiptButton.disabled=true;tell('Checking the previous receipt…');
    try{
      const current=await getContext();if(current.actor!==currentReceipt.actor)throw new Error('Return to the original account and browser to recover this receipt.');
      const data=await request('submission-receipt',{requestId:currentReceipt.key,actor:currentReceipt.actor});
      if(data.found){let operation:any={key:currentReceipt.key};try{operation=(await storage.records()).find(row=>row.key===currentReceipt.key) || operation;}catch{}await finish(data,operation);(window as any).sfShowSubmissionSuccess(data);}
      else tell('No recorded submission yet. Retry the same content with the same receipt; it may still be in flight.');
    }catch(e){if(e.status===410){clearReceipt();tell(e.message+' Start a new idea if needed.');}else tell(e.message);}finally{busy=false;receiptButton.disabled=!currentReceipt;}
  });
  window.addEventListener('beforeunload',e=>{if(dirty && JSON.stringify(payload())!==savedFingerprint){e.preventDefault();e.returnValue='';}});
  window.addEventListener('online',()=>{void renderQueue().catch(e=>tell(e.message));tell('Connection restored. Review queued ideas and choose Send now.');});
  window.addEventListener('offline',()=>{void renderQueue().catch(e=>tell(e.message));tell('Offline. Save your draft here; reconnect before sending.');});
  void getContext().catch(()=>{});
  void renderQueue(true).catch(e=>tell(e.message));
  Object.assign(window,{sfSubmissionRecovery:{prepare,finish,failed,request,tell}});
})();
