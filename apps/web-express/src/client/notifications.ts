(() => {
  const list = document.getElementById('notification-list');
  if (!list) return;
  const preferences=document.getElementById('notification-preferences') as HTMLFormElement;
  if(preferences) {
    const mode=preferences.elements.namedItem('update_mode') as HTMLSelectElement,digest=preferences.elements.namedItem('weekly_digest') as HTMLInputElement,save=preferences.querySelector<HTMLButtonElement>('button[type=submit]')!,status=document.getElementById('preferences-status')!;
    const paused=preferences.elements.namedItem('digest_paused') as HTMLInputElement;
    const kindControls=Array.from(preferences.querySelectorAll<HTMLInputElement>('input[name=digest_kinds]'));
    preferences.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select').forEach(control=>control.disabled=true);
    const prefRetry=document.createElement('button');prefRetry.type='button';prefRetry.className='workspace-button';prefRetry.textContent='Retry preferences';prefRetry.hidden=true;status.after(prefRetry);
    const loadPreferences=()=>{prefRetry.hidden=true;return sfSchoolFetch('/api/notifications/preferences',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)}).then(async response=>{
      const data=await response.json();if(!response.ok || !data.success) throw new Error();
      preferences.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select').forEach(control=>control.disabled=false);
      paused.checked=data.preferences.digest_paused===true;
      kindControls.forEach(control=>control.checked=!data.preferences.digest_kinds || data.preferences.digest_kinds.includes(control.value));
      document.getElementById('digest-window')!.textContent='Weekly scheduler window: after '+new Date(data.nextDigestWindow).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})+' Manila time. Delivery depends on your school’s configured scheduler.';
      mode.value=data.preferences.update_mode;digest.checked=data.preferences.weekly_digest;digest.disabled=!data.digestAvailable && !data.preferences.weekly_digest;save.disabled=false;
      document.getElementById('digest-availability')!.textContent=data.digestAvailable ? 'Opt-in only. A verified account email is required. No private messages are included.' : 'Your school has not enabled weekly email delivery yet. In-app updates work independently.';
    }).catch(()=>{status.textContent='Preferences could not load.';prefRetry.hidden=false;});};
    prefRetry.addEventListener('click',()=>void loadPreferences());void loadPreferences();
    preferences.addEventListener('submit',async e=>{e.preventDefault();if(save.disabled)return;save.disabled=true;status.textContent='Saving…';
      try {const response=await sfSchoolFetch('/api/notifications/preferences',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({update_mode:mode.value,weekly_digest:digest.checked,digest_paused:paused.checked,digest_kinds:kindControls.filter(control=>control.checked).map(control=>control.value)})});const data=await response.json();if(!response.ok || !data.success) throw new Error(data.error || 'Preferences not saved.');status.textContent=paused.checked?'Saved. Weekly emails are paused until you resume them. In-app updates still follow your chosen mode.':'Saved. Weekly email uses these update types and your current follows. In-app settings apply to new updates.';}catch(e){status.textContent=e.name==='TimeoutError' ? 'Saving timed out. Refresh to confirm preferences.' : e.message;}finally{save.disabled=false;}
    });
  }
  const summary = document.getElementById('notification-summary')!;
  const error = document.getElementById('notification-error')!;
  const more = document.getElementById('notification-more') as HTMLButtonElement;
  const retry = document.getElementById('notification-retry') as HTMLButtonElement;
  let cursor: string | null = null;
  let loading = false;
  const seen = new Set<string>();
  async function load() {
    if (loading) return;
    loading = true; more.disabled = true; retry.disabled = true; error.hidden = true; retry.hidden = true;
    list!.setAttribute('aria-busy','true');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await sfSchoolFetch('/api/notifications' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { signal: controller.signal, headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(response.status === 401 ? 'Please sign in again to see your updates.' : 'Your updates could not load. Please try again.');
      for (const notification of payload.notifications) {
        if (seen.has(notification.id)) continue;
        seen.add(notification.id);
        const entry = document.createElement('li');
        entry.className = 'notification-item';
        entry.dataset.unread = String(!notification.read_at);
        const unread=document.createElement('span');unread.className='notification-new';unread.textContent='New update';
        if(!notification.read_at)entry.append(unread);
        const link = document.createElement('a');
        link.href = sfSchoolPath('/roadmap?item=' + encodeURIComponent(notification.submission_id));
        link.textContent = notification.title;
        const meta = document.createElement('p');
        const kinds: Record<string, string> = { started: 'Work started', milestone: 'Milestone', blocked: 'Work paused', completed: 'Completed', update: 'Progress update', correction: 'Correction',resumed:'Work resumed',reopened:'Work reopened',withdrawn:'Idea withdrawn' };
        meta.textContent = `${kinds[notification.kind] || 'School update'} · ${notification.office_label} · ${new Date(notification.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}`;
        entry.append(link, meta);
        if (!notification.read_at) {
          const mark = document.createElement('button');
          mark.type = 'button'; mark.className = 'workspace-button'; mark.textContent = 'Mark as read';
          mark.addEventListener('click', async () => {
            mark.disabled = true;
            const readController = new AbortController();
            const readTimer = setTimeout(() => readController.abort(), 15000);
            try {
              const result = await sfSchoolFetch('/api/notifications/' + encodeURIComponent(notification.id) + '/read', { method: 'PATCH', signal: readController.signal, headers: { Accept: 'application/json' } });
              if (!result.ok) throw new Error();
              entry.dataset.unread = 'false'; mark.remove();unread.remove();
              summary.textContent = 'Update marked as read.';
            } catch { error.hidden = false; error.textContent = 'Could not mark this update as read. Please try again.'; mark.disabled = false; }
            finally { clearTimeout(readTimer); }
          });
          entry.append(mark);
        }
        list!.append(entry);
      }
      cursor = payload.nextCursor || null; more.hidden = !cursor;
      document.getElementById('notification-empty')?.remove();
      if(!seen.size){const empty=sfEmptyState({icon:'bell',heading:'Your next update starts with a follow',description:'Follow an idea on the roadmap. When your school shares progress, its updates will appear here.',href:'/roadmap',label:'Find ideas to follow'});empty.id='notification-empty';list!.after(empty);}
      summary.textContent = seen.size ? `${payload.unreadCount} unread · ${seen.size} updates shown` : '';
    } catch (failure) {
      error.hidden = false; error.textContent = failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Loading timed out. Please try again.'; retry.hidden = false;
    } finally { clearTimeout(timer); loading = false; more.disabled = false; retry.disabled = false; list!.removeAttribute('aria-busy'); }
  }
  more.addEventListener('click', () => void load()); retry.addEventListener('click', () => void load());
  void load();
})();
