(() => {
 const page=document.querySelector<HTMLElement>('[data-customization-editor]');if(!page)return;
 const form=document.getElementById('customization-form') as HTMLFormElement;
 const initial=JSON.parse(document.getElementById('customization-data')!.textContent||'{}');
 const feedback=document.getElementById('customization-feedback')!;
 let revision=Number(page.dataset.revision),dirty=false,busy=false;
 const say=(message:string)=>{feedback.textContent=message;feedback.scrollIntoView({block:'nearest',behavior:'smooth'});};
 const changed=(event?:Event)=>{if(event?.target instanceof Element&&event.target.hasAttribute('data-publish-confirm'))return;dirty=true;(page!.querySelector('[data-publish-confirm]') as HTMLInputElement).checked=false;page.querySelector('[data-dirty-message]')!.textContent='Unsaved changes. Save before previewing or publishing.';};
 const field=(row:Element,name:string)=>(row.querySelector('[data-field="'+name+'"]') as HTMLInputElement);
 function configuration(){const p=structuredClone(initial);delete p.formVersion;
  for(const input of form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-path]')){const keys=input.dataset.path!.split('.');let target=p;for(const key of keys.slice(0,-1))target=target[key];target[keys[keys.length-1]]=input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:input.value;}
  p.categories=Array.from(form.querySelectorAll('[data-category]')).map(row=>({id:field(row,'id').value,name:field(row,'name').value,slug:field(row,'slug').value,description:field(row,'description').value,icon:field(row,'icon').value,active:field(row,'active').checked}));
  p.form.questions=Array.from(form.querySelectorAll('[data-question]')).map(row=>({id:field(row,'id').value,label:field(row,'label').value,help:field(row,'help').value,type:field(row,'type').value,required:field(row,'required').checked,options:field(row,'type').value==='choice'?field(row,'options').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean):[]}));
  p.welcome.links=Array.from(form.querySelectorAll('[data-link]')).map(row=>({label:field(row,'label').value,url:field(row,'url').value}));return p;
 }
 async function request(action:string,body:unknown){const response=await fetch(page!.dataset.base+'/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'The change was not saved.');return result;}
 async function perform(action:string,extra:Record<string,unknown>={}){if(busy)return;if(dirty&&action!=='save'){say('Save your draft before this action. Your unsaved changes are still here.');return;}busy=true;form.setAttribute('aria-busy','true');try{
  if(action==='save'&&!form.reportValidity())return;
  if(action==='publish'&&!(page!.querySelector('[data-publish-confirm]') as HTMLInputElement).checked){say('Review the changes and confirm publication first.');return;}
  const result=await request(action,{revision,...extra,...(action==='save'?{configuration:configuration()}:{}),...(action==='publish'?{confirmed:true}:{})});
  if(action==='save'){revision=result.revision;dirty=false;page!.querySelectorAll('[data-revision-label]').forEach(el=>el.textContent=String(revision));page!.querySelector('[data-dirty-message]')!.textContent='Saved. Preview and publication use this revision.';
   for(const link of page!.querySelectorAll<HTMLAnchorElement>('[data-preview-link]'))link.href=page!.dataset.base+'/preview?revision='+revision;
   const frame=page!.querySelector<HTMLIFrameElement>('[data-preview-frame]');if(frame)frame.src=page!.dataset.base+'/preview/content?revision='+revision;
   const list=page!.querySelector('[data-change-list]')!;list.replaceChildren();for(const change of result.changes.length?result.changes:['No changes from the live version.']){const li=document.createElement('li');li.textContent=change;list.append(li);}say('Draft saved privately. Preview it, then publish when ready.');
  }else if(action==='request-review')say('Form review requested. The live workspace is unchanged. A platform operator reviews the form against the approved school policy.');else location.reload();
 }catch(error){say(error instanceof Error?error.message:'The change could not be saved.');}finally{busy=false;form.removeAttribute('aria-busy');}}
 form.addEventListener('input',changed);form.addEventListener('change',changed);form.addEventListener('submit',event=>{event.preventDefault();void perform('save');});
 page.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled||busy)return;
  if(button.dataset.action)void perform(button.dataset.action);
  if(button.dataset.restore)void perform('restore',{version:Number(button.dataset.restore)});
  if(button.hasAttribute('data-remove')){button.closest('[data-question],[data-link]')?.remove();changed();}
  if(button.dataset.move){const row=button.closest<HTMLElement>('.custom-repeat-row');if(!row)return;const sibling=button.dataset.move==='up'?row.previousElementSibling:row.nextElementSibling;if(sibling){if(button.dataset.move==='up')row.parentElement!.insertBefore(row,sibling);else row.parentElement!.insertBefore(sibling,row);changed();}}
  if(button.dataset.add){const kind=button.dataset.add,container=page!.querySelector('[data-'+(kind==='category'?'categories':kind==='question'?'questions':'links')+']')!;const max=kind==='category'?60:kind==='question'?8:5;if(container.children.length>=max){say('The limit for this list has been reached.');return;}const clone=(document.getElementById('custom-'+kind+'-template') as HTMLTemplateElement).content.cloneNode(true) as DocumentFragment;const id=clone.querySelector<HTMLInputElement>('[data-field="id"]');if(id)id.value=crypto.randomUUID();container.append(clone);(container.lastElementChild?.querySelector('input:not([type="hidden"])') as HTMLInputElement)?.focus();changed();}
  if(button.dataset.assetRemove){initial[button.dataset.assetRemove]=null;const img=page!.querySelector<HTMLImageElement>('[data-asset-preview="'+button.dataset.assetRemove+'"]')!;img.hidden=true;img.removeAttribute('src');changed();}
 });
 for(const input of page.querySelectorAll<HTMLInputElement>('[data-asset-upload]'))input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file||busy)return;const kind=input.dataset.assetUpload!;if(file.size>(kind==='logo'?2:5)*1024*1024){say('This image is too large. Logos support 2 MB and covers 5 MB.');return;}busy=true;say('Processing your school image…');try{const intent=await request('assets/intent',{kind,size:file.size});const uploaded=await fetch(intent.url,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});if(!uploaded.ok)throw new Error('The image did not upload. Choose it again.');const result=await request('assets/finalize',{kind,id:intent.id});initial[kind]=result.id;const img=page!.querySelector<HTMLImageElement>('[data-asset-preview="'+kind+'"]')!;img.src=result.url;img.hidden=false;changed();say('Image processed. Save the draft to use it.');}catch(error){say(error instanceof Error?error.message:'Image upload failed.');}finally{busy=false;input.value='';}});
 page.querySelector<HTMLSelectElement>('[data-section-picker]')?.addEventListener('change',event=>document.getElementById((event.target as HTMLSelectElement).value)?.scrollIntoView({block:'start',behavior:'smooth'}));
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
})();
