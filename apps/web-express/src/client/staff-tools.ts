(() => {
 const boardData=document.getElementById('staff-board-data');
 const queueData=document.getElementById('staff-queue-data');
 if(!boardData && !queueData) return;
 const message=document.getElementById('staff-tools-message') || document.getElementById('staff-page-message');
 const tell=(text:string)=>{if(message) message.textContent=text;};
 let busy=false, dragging:string|null=null;
 async function save(url:string,data:unknown,method='POST') {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {const response=await fetch(url,{method,signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});const payload=await response.json();if(!response.ok || !payload.success) throw new Error(payload.error || 'Change not saved. Refresh and try again.');return payload;}
  finally{clearTimeout(timer);}
 }
 if(boardData) {
  const items:any[]=JSON.parse(boardData.textContent || '[]');
  const selected=new Set<string>();
  const controls=()=>document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('.staff-flow-board input,.staff-flow-board select,#staff-bulk-assign,#staff-bulk-assignee').forEach(el=>{el.disabled=busy;});
  async function move(id:string,stage:string) {
   const item=items.find(x=>x.id===id);if(!item || item.status===stage || busy) return;
   const labels:Record<string,string>={pending:'Needs review',approved:'Planned',in_progress:'In progress',resolved:'Completed',rejected:'Declined'};
   if(!window.confirm(`Move “${item.title}” to ${labels[stage]}? Planned, In progress and Completed are public. The current response, assignment and target date are preserved. Use detailed review to explain a decision.`)) {const select=document.querySelector<HTMLSelectElement>(`[data-stage-select="${id}"]`);if(select) select.value=item.status;return;}
   busy=true;controls();tell('Saving stage…');
   try {await save('/api/staff/submissions/'+id+'/review',{status:stage,note:item.staff_note || '',assignee:item.assignee_id || null,priority:item.priority || 'normal',targetDate:item.target_date || null,updatedAt:item.updated_at},'PATCH');window.location.reload();}
   catch(e){tell(e.name==='AbortError' ? 'Request timed out. Refresh to confirm the saved stage before retrying.' : e.message);const select=document.querySelector<HTMLSelectElement>(`[data-stage-select="${id}"]`);if(select) select.value=item.status;}
   finally{busy=false;controls();}
  }
  document.querySelectorAll<HTMLSelectElement>('[data-stage-select]').forEach(select=>select.addEventListener('change',()=>void move(select.dataset.stageSelect!,select.value)));
  document.querySelectorAll<HTMLElement>('[data-board-id]').forEach(card=>{
   card.addEventListener('dragstart',event=>{if(busy || (event.target as HTMLElement).closest('input,select,a,button')) {event.preventDefault();return;}dragging=card.dataset.boardId!;event.dataTransfer?.setData('text/plain',dragging);});
   card.addEventListener('dragend',()=>{dragging=null;document.querySelectorAll('.is-drop-target').forEach(el=>el.classList.remove('is-drop-target'));});
  });
  document.querySelectorAll<HTMLElement>('[data-drop-stage]').forEach(lane=>{
   lane.addEventListener('dragover',e=>{if(dragging && !busy){e.preventDefault();lane.classList.add('is-drop-target');}});
   lane.addEventListener('dragleave',()=>lane.classList.remove('is-drop-target'));
   lane.addEventListener('drop',e=>{e.preventDefault();lane.classList.remove('is-drop-target');if(dragging) void move(dragging,lane.dataset.dropStage!);dragging=null;});
  });
  document.querySelectorAll<HTMLInputElement>('[data-bulk-id]').forEach(input=>input.addEventListener('change',()=>{
   if(input.checked && selected.size>=25) {input.checked=false;tell('Select no more than 25 ideas for one assignment.');return;}
   if(input.checked) selected.add(input.dataset.bulkId!);else selected.delete(input.dataset.bulkId!);
   document.getElementById('staff-selection-count')!.textContent=`${selected.size} selected · maximum 25`;
  }));
  document.getElementById('staff-bulk-assign')?.addEventListener('click',async()=>{
   if(!selected.size || busy) {tell('Select at least one idea.');return;}
   const assignee=document.getElementById('staff-bulk-assignee') as HTMLSelectElement;
   if(!window.confirm(`Assign ${selected.size} selected ideas to ${assignee.selectedOptions[0].textContent}? No statuses or public responses will change. If any selection changed, nothing is saved.`)) return;
   busy=true;controls();tell('Saving assignments…');
   try {await save('/api/community/staff/bulk_assign',{assigneeId:assignee.value || null,items:items.filter(x=>selected.has(x.id)).map(x=>({id:x.id,updatedAt:x.updated_at}))});window.location.reload();}
   catch(e){tell(e.name==='AbortError' ? 'Request timed out. Refresh to confirm assignments.' : e.message);}finally{busy=false;controls();}
  });
 }
 document.getElementById('staff-response-template')?.addEventListener('change',e=>{
  const select=e.target as HTMLSelectElement, note=document.getElementById('review-note') as HTMLTextAreaElement;
  if(!select.value || !note) return;
  const templates:Record<string,string>={planned:'Thank you for raising this idea. We have approved it for planning. We will publish an update when the next step is confirmed.',clarify:'Thank you for your feedback. We need more detail before making a decision. Please check your private School messages for our question.',declined:'Thank you for this suggestion. We are unable to proceed at this time. Reason: [explain the decision]. Alternative or next step: [provide a helpful option].'};
  if(note.value && !window.confirm('Replace the current draft response with this template?')) {select.value='';return;}
  note.value=templates[select.value] || '';note.dispatchEvent(new Event('input',{bubbles:true}));note.focus();select.value='';
 });
 document.addEventListener('keydown',e=>{
  if(e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
  if(e.key==='/') {const search=document.querySelector<HTMLInputElement>('.staff-search-form input[type=search]');if(search){e.preventDefault();search.focus();}}
  if(e.key==='j' || e.key==='k') {const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.staff-review-button'));const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='j' ? current+1 : current-1;if(buttons.length){e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,next))].focus();}}
 });
})();
