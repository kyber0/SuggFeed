(() => {
  const requests=new WeakMap<HTMLElement,AbortController>();
  const labels:Record<string,string>={approved:'Planned',in_progress:'In progress',resolved:'Completed',started:'Work started',update:'Progress update',milestone:'Milestone',blocked:'Work paused',completed:'Work completed',correction:'Correction',resumed:'Work resumed',reopened:'Work reopened',withdrawn:'Withdrawn'};
  async function load(container:HTMLElement,id:string){
    requests.get(container)?.abort();const controller=new AbortController();requests.set(container,controller);
    const heading=document.createElement('h3');heading.textContent='Public status and progress history';
    const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading public history…';
    container.replaceChildren(heading,status);container.setAttribute('aria-busy','true');
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await sfSchoolFetch('/api/idea/'+encodeURIComponent(id)+'/history',{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      const data=await response.json();if(!response.ok || !data.success)throw new Error(data.error || 'Public history could not load.');
      if(requests.get(container)!==controller)return;
      const entries=[...data.history.map(item=>({time:item.created_at,title:(item.old_status?labels[item.old_status]+' → ':'')+labels[item.new_status],body:'',occurred:null})),...data.updates.map(item=>({time:item.created_at,title:labels[item.kind] || 'School update',body:item.body,occurred:item.occurred_on}))].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
      status.textContent=entries.length?`${data.history.length} recorded status changes and ${data.updates.length} public updates shown (up to ${data.limit} of each).`:'';
      const list=document.createElement('ol');list.className='public-history-list';
      for(const entry of entries){
        const item=document.createElement('li'),title=document.createElement('strong'),date=document.createElement('p');title.textContent=entry.title;
        date.textContent='Recorded '+new Date(entry.time).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})+' Manila time';
        if(entry.occurred)date.textContent+=' · reported work date '+entry.occurred;
        item.append(title,date);
        if(entry.body){const body=document.createElement('p');body.textContent=entry.body;item.append(body);}list.append(item);
      }
      if(!entries.length)container.append(sfEmptyState({compact:true,icon:'clock',heading:'No public history yet',description:'Published status changes and work updates will appear here, with their recorded dates.'}));
      container.append(list);
    }catch(e){
      if(requests.get(container)!==controller)return;
      status.textContent=controller.signal.aborted?'History loading timed out. Try again.':e.message;status.setAttribute('role','alert');
      const retry=document.createElement('button');retry.type='button';retry.className='workspace-button';retry.textContent='Retry history';retry.addEventListener('click',()=>void load(container,id));container.append(retry);
    }finally{clearTimeout(timer);if(requests.get(container)===controller)container.removeAttribute('aria-busy');}
  }
  document.querySelectorAll<HTMLElement>('[data-public-history]').forEach(container=>{if(container.dataset.publicHistory)void load(container,container.dataset.publicHistory);});
  Object.assign(window,{sfLoadPublicHistory:load});
})();
