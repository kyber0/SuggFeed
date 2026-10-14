(() => {
  interface RoadmapItem {
    id: string;
    title: string;
    description: string;
    status: string;
    category: string;
    votes: number;
    comments: number;
    created_at: string;
    updated_at: string;
    resolved_at?: string | null;
    resolved_at_estimated?: boolean;
    progress_percent?: number | null;
    is_blocked?: boolean;
    response?: string;
  }
  interface PublicUpdate {
    id: string;
    kind: string;
    body: string;
    percent: number | null;
    blocked_reason: string | null;
    next_step: string | null;
    occurred_on: string;
    office_label: string;
    created_at: string;
    files?: Array<{ id: string; display_name: string; mime_type: string; size_bytes: number; alt: string | null }>;
  }

  const items: RoadmapItem[] = JSON.parse(document.getElementById('sf-roadmap-data')!.textContent || '[]');
  const board = document.getElementById('campus-roadmap-board')!;
  const dialog = document.getElementById('roadmap-dialog') as HTMLDialogElement;
  const labels: Record<string, string> = { approved: 'Planned', in_progress: 'In progress', resolved: 'Completed' };
  const hints: Record<string, string> = {
    approved: 'The school has approved this idea. A delivery date has not been announced.',
    in_progress: 'Work on this idea is underway. Follow the discussion for updates from your school.',
    resolved: 'The school has marked this idea as completed.'
  };

  let returnFocus: HTMLElement | null = null;
  let syncingHistory = false;
  let detailRequest: AbortController | undefined;
  const voting = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let currentIdeaId = '';
  function drawerState(ready: boolean, retry = false) {
    const footer = document.getElementById('roadmap-detail-footer');
    const retryButton = document.getElementById('roadmap-detail-retry');
    if (footer) footer.hidden = !ready;
    if (retryButton) retryButton.hidden = !retry;
  }
  const calendar=document.getElementById('work-calendar-scroll');
  const chart=calendar?.querySelector<HTMLElement>('.work-timeline-chart');
  if(chart)chart.style.setProperty('--chart-width',Math.max(1040,Number(chart.dataset.timelineDays)*22)+'px');
  if(!calendar)document.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('[data-timeline-pan],#timeline-jump-today,#timeline-zoom').forEach(control=>{control.disabled=true;control.title='There are no recorded work dates in this window.';});
  const smooth=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const;
  document.getElementById('timeline-zoom')?.addEventListener('change',e=>{
    if(!calendar || !chart) return;
    const scale=(e.target as HTMLSelectElement).value, midpoint=(calendar.scrollLeft+calendar.clientWidth/2)/calendar.scrollWidth;
    chart.style.setProperty('--chart-width',Math.max(1040,Number(chart.dataset.timelineDays)*({week:48,month:22,term:9}[scale] || 22))+'px');
    calendar.scrollLeft=midpoint*calendar.scrollWidth-calendar.clientWidth/2;
  });
  document.querySelectorAll<HTMLElement>('[data-timeline-pan]').forEach(button=>button.addEventListener('click',()=>calendar?.scrollBy({left:Number(button.dataset.timelinePan)*calendar.clientWidth*.8,behavior:smooth()})));
  let pan:{id:number;x:number;left:number}|null=null;
  calendar?.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse' || e.button!==0 || (e.target as HTMLElement).closest('button,a,input,select')) return;
    pan={id:e.pointerId,x:e.clientX,left:calendar.scrollLeft};calendar.setPointerCapture(e.pointerId);calendar.classList.add('is-panning');
  });
  calendar?.addEventListener('pointermove',e=>{if(pan && e.pointerId===pan.id){calendar.scrollLeft=pan.left-(e.clientX-pan.x);e.preventDefault();}});
  const endPan=()=>{pan=null;calendar?.classList.remove('is-panning');};
  calendar?.addEventListener('pointerup',endPan);calendar?.addEventListener('pointercancel',endPan);calendar?.addEventListener('lostpointercapture',endPan);
  document.getElementById('timeline-jump-today')?.addEventListener('click', () => {
    const calendar = document.getElementById('work-calendar-scroll');
    if (!calendar) return;
    calendar.scrollTo({ left: calendar.scrollWidth * Number(calendar.dataset.todayLeft) / 100 - calendar.clientWidth / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  function normalizeView(view: string | null | undefined): string {
    if (view === 'tree' || view === 'list') return 'tree';
    if (view === 'done' || view === 'outcomes') return 'done';
    if (view === 'timeline') return 'timeline';
    return 'board';
  }

  // Layout links navigate normally: each view has a different server-side dataset.
  // A real button supplies native Enter/Space behavior without duplicate key handlers.
  document.querySelectorAll<HTMLButtonElement>('.roadmap-tree-header').forEach(header => {
    header.addEventListener('click', () => {
      const panel = document.getElementById(header.getAttribute('aria-controls') || '');
      if (!panel) return;
      const expanded = header.getAttribute('aria-expanded') !== 'false';
      header.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });
  });

  function formatManilaDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function getVotedSet(): Set<string> {
    try {
      const raw = localStorage.getItem('sf_voted_ideas');
      return new Set(Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : []);
    } catch {
      return new Set();
    }
  }

  function saveVotedId(id: string) {
    try {
      const set = getVotedSet();
      set.add(id);
      localStorage.setItem('sf_voted_ideas', JSON.stringify(Array.from(set)));
    } catch {}
  }

  function hasVoted(id: string): boolean {
    return getVotedSet().has(id);
  }

  function show(item: RoadmapItem) {
    drawerState(true);
    document.getElementById('roadmap-detail-content')!.hidden = false;
    document.getElementById('roadmap-detail-error')!.textContent = '';
    const badge = document.getElementById('roadmap-detail-status')!;
    badge.textContent = labels[item.status] || item.status;
    badge.dataset.status = item.status;
    const category = document.getElementById('roadmap-detail-category');
    if (category) category.textContent = item.category;
    document.getElementById('roadmap-detail-title')!.textContent = item.title;
    document.getElementById('roadmap-detail-description')!.textContent = item.description;
    let report=document.getElementById('roadmap-report-idea') as HTMLButtonElement;
    if(!report){report=document.createElement('button');report.id='roadmap-report-idea';report.type='button';report.className='care-report';report.textContent='Report this idea';document.getElementById('roadmap-detail-description')!.after(report);}
    report.dataset.reportIdea=item.id;

    const blockedAlert = document.getElementById('roadmap-detail-blocked-alert');
    if (blockedAlert) {
      blockedAlert.hidden = !item.is_blocked;
      document.getElementById('roadmap-detail-blocked-reason')!.textContent = 'Check the latest school update for the reason.';
    }

    const progressWrap = document.getElementById('roadmap-detail-progress-wrap');
    const progressBar = document.getElementById('roadmap-detail-bar-fill');
    const progressText = document.getElementById('roadmap-detail-progress-text');
    if (progressWrap && progressBar && progressText) {
      if (typeof item.progress_percent === 'number' && (item.status === 'in_progress' || item.status === 'resolved')) {
        progressWrap.hidden = false;
        progressBar.style.width = `${item.progress_percent}%`;
        progressText.textContent = `${item.progress_percent}%`;
        const accessibleBar = document.getElementById('roadmap-detail-bar-el');
        accessibleBar?.setAttribute('aria-valuenow', String(item.progress_percent));
        accessibleBar?.setAttribute('aria-valuetext', `${item.progress_percent}% complete, school estimate`);
      } else {
        progressWrap.hidden = true;
      }
    }

    const detailVote = document.getElementById('roadmap-detail-vote') as HTMLButtonElement | null;
    const detailVotes = document.getElementById('roadmap-detail-votes');
    if (detailVote && detailVotes) {
      detailVote.dataset.voteId = item.id;
      detailVote.disabled = voting.has(item.id);
      detailVotes.textContent = String(item.votes);
      const voted = hasVoted(item.id);
      detailVote.classList.toggle('is-voted', voted);
      detailVote.setAttribute('aria-pressed', String(voted));
    }

    const dateLabel = item.status === 'resolved'
      ? item.resolved_at ? `Completed ${item.resolved_at_estimated ? 'around ' : ''}${formatManilaDate(item.resolved_at)}` : 'Completion date not recorded'
      : `Updated ${formatManilaDate(item.updated_at)}`;
    document.getElementById('roadmap-detail-meta')!.textContent = dateLabel;
    document.getElementById('roadmap-detail-response')!.textContent = item.response || 'The school has not posted a public response yet.';
    document.getElementById('roadmap-detail-hint')!.textContent = hints[item.status] || '';
    document.getElementById('roadmap-detail-estimate')!.textContent = [
      item.is_blocked ? 'Work is currently blocked; see the school update below.' : '',
    ].filter(Boolean).join(' · ');
    (document.getElementById('roadmap-detail-link') as HTMLAnchorElement).href = '/idea/' + encodeURIComponent(item.id);
    const follow = document.getElementById('roadmap-follow') as HTMLButtonElement;
    follow.dataset.followIdea = item.id;
    document.dispatchEvent(new CustomEvent('sf:follow-context', { detail: follow }));

    document.querySelectorAll<HTMLElement>('[data-progress-stage]').forEach(step => {
      const stages = ['approved', 'in_progress', 'resolved'];
      const index = stages.indexOf(step.dataset.progressStage || '');
      step.dataset.state = index < stages.indexOf(item.status) ? 'complete' : index === stages.indexOf(item.status) ? 'current' : 'upcoming';
      if (step.dataset.progressStage === item.status) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
  }

  function showUpdates(updates: PublicUpdate[]) {
    const paused = updates.find(update => update.kind === 'blocked' && update.blocked_reason);
    if (paused && !document.getElementById('roadmap-detail-blocked-alert')!.hidden) document.getElementById('roadmap-detail-blocked-reason')!.textContent = paused.blocked_reason || '';
    const list = document.getElementById('roadmap-history-list')!;
    list.replaceChildren();
    const earlier=updates.filter(u=>u.kind==='started').sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)).flatMap(u=>(u.files || []).map(file=>({file,update:u}))).find(x=>x.file.mime_type.startsWith('image/') && uuid.test(x.file.id));
    const later=updates.filter(u=>u.kind==='completed').sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).flatMap(u=>(u.files || []).map(file=>({file,update:u}))).find(x=>x.file.mime_type.startsWith('image/') && uuid.test(x.file.id));
    if(earlier && later && earlier.update.occurred_on<=later.update.occurred_on) {
      const comparison=document.createElement('li'),heading=document.createElement('h4'),help=document.createElement('p'),images=document.createElement('div');
      heading.textContent='From work started to completed';help.textContent='School-published evidence. Dates refer to updates, not verified photo capture times; images may show different viewpoints.';images.className='evidence-comparison';
      for(const [label,entry] of [['Work started',earlier],['Completed',later]] as const){const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src='/api/progress-evidence/'+encodeURIComponent(entry.file.id);image.alt=entry.file.alt || entry.file.display_name;image.loading='lazy';image.referrerPolicy='no-referrer';caption.textContent=label+' · '+entry.update.occurred_on+' · '+(entry.file.alt || entry.file.display_name);image.addEventListener('error',()=>{image.remove();caption.textContent+=' · Image unavailable. Open the evidence link in the update below.';});figure.append(image,caption);images.append(figure);}
      comparison.append(heading,help,images);list.append(comparison);
    }
    const names: Record<string, string> = { started: 'Work started', update: 'Progress update', milestone: 'Milestone', blocked: 'Work paused', completed: 'Completed', correction: 'Correction', resumed:'Work resumed', reopened:'Work reopened',withdrawn:'Idea withdrawn' };
    for (const update of updates) {
      const entry = document.createElement('li');
      entry.dataset.kind = update.kind;
      const title = document.createElement('h4');
      title.textContent = names[update.kind] || 'School update';
      const meta = document.createElement('p');
      meta.className = 'workspace-detail-meta';
      meta.textContent = `${update.office_label} · ${formatManilaDate(update.occurred_on + 'T00:00:00+08:00')}`;
      const body = document.createElement('p');
      body.textContent = update.body;
      entry.append(title, meta, body);
      if (update.percent !== null) {
        const estimate = document.createElement('p');
        estimate.className = 'workspace-detail-meta';
        estimate.textContent = `${update.percent}% complete — school estimate`;
        entry.append(estimate);
      }
      if (update.blocked_reason) {
        const reason = document.createElement('p');
        reason.textContent = 'Waiting on: ' + update.blocked_reason;
        entry.append(reason);
      }
      if (update.next_step) {
        const nextStep = document.createElement('p');
        nextStep.className = 'roadmap-history-next';
        nextStep.textContent = 'Next step: ' + update.next_step;
        entry.append(nextStep);
      }
      if (update.files?.length) {
        const files = document.createElement('ul');
        files.className = 'roadmap-evidence-list';
        for (const file of update.files) {
          if (!uuid.test(file.id)) continue;
          const row = document.createElement('li');
          const link = document.createElement('a');
          link.href = '/api/progress-evidence/' + encodeURIComponent(file.id);
          link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.textContent = `${file.mime_type === 'application/pdf' ? 'PDF' : 'Image'} · ${file.display_name} · ${Math.ceil(file.size_bytes / 1024)} KB ↗`;
          if (file.alt) link.setAttribute('aria-label', `${file.display_name}: ${file.alt}`);
          row.append(link); files.append(row);
        }
        entry.append(files);
      }
      list.append(entry);
    }
    document.getElementById('roadmap-history-status')!.textContent = updates.length
      ? updates.length >= 100 ? 'Showing the latest 100 school updates.' : ''
      : 'The school has not posted a progress update yet.';
  }

  async function open(id: string, push = true) {
    currentIdeaId = id;
    drawerState(false);
    detailRequest?.abort();
    detailRequest = undefined;
    if (!dialog.open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set('item', id);
      window.history.pushState(null, '', url);
    }
    const item = items.find(i => i.id === id);
    dialog.setAttribute('aria-busy','true');
    document.getElementById('roadmap-detail-skeleton')!.hidden=!!item;
    document.getElementById('roadmap-history-skeleton')!.hidden=false;
    if (item) {
      show(item);
    } else {
      document.getElementById('roadmap-detail-title')!.textContent = 'Loading idea…';
      document.getElementById('roadmap-detail-content')!.hidden = true;
      document.getElementById('roadmap-detail-status')!.textContent = '';
      document.getElementById('roadmap-detail-meta')!.textContent = '';
      const category = document.getElementById('roadmap-detail-category');
      if (category) category.textContent = '';
      document.getElementById('roadmap-detail-error')!.textContent = '';
    }
    document.getElementById('roadmap-history-list')!.replaceChildren();
    document.getElementById('roadmap-history-status')!.textContent = 'Loading school updates…';
    if (!uuid.test(id)) {
      dialog.setAttribute('aria-busy','false');document.getElementById('roadmap-detail-skeleton')!.hidden=true;document.getElementById('roadmap-history-skeleton')!.hidden=true;
      document.getElementById('roadmap-detail-title')!.textContent = 'Idea unavailable';
      document.getElementById('roadmap-detail-error')!.textContent = 'This link does not contain a valid idea ID.';
      return;
    }
    const controller = new AbortController();
    detailRequest = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/roadmap/idea/' + encodeURIComponent(id), { signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(response.status === 404 ? 'This idea is no longer on the public roadmap.' : 'This idea could not load. Please try again.');
      }
      if (dialog.open && detailRequest === controller) {
        show(body.item);
        showUpdates(Array.isArray(body.updates) ? body.updates : []);
        void fetch('/api/community/merges/'+encodeURIComponent(id),{headers:{Accept:'application/json'},signal:controller.signal}).then(async response=>{
          if(!response.ok) return;const data=await response.json();if(detailRequest!==controller || !dialog.open) return;
          for(const merge of data.merges || []){const entry=document.createElement('li');entry.textContent='Merged public idea: '+merge.source_title+' · '+merge.reason;document.getElementById('roadmap-history-list')!.append(entry);}
        }).catch(()=>undefined);
      }
    } catch (error) {
      if (dialog.open && detailRequest === controller) {
        dialog.setAttribute('aria-busy','false');document.getElementById('roadmap-detail-skeleton')!.hidden=true;document.getElementById('roadmap-history-skeleton')!.hidden=true;
      document.getElementById('roadmap-detail-title')!.textContent = 'Idea unavailable';
        document.getElementById('roadmap-detail-content')!.hidden = true;
        drawerState(false, true);
        document.getElementById('roadmap-detail-error')!.textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Loading timed out. Please try again.';
      }
    } finally {
      clearTimeout(timer);
      if(detailRequest===controller){dialog.setAttribute('aria-busy','false');document.getElementById('roadmap-detail-skeleton')!.hidden=true;document.getElementById('roadmap-history-skeleton')!.hidden=true;}
    }
  }

  document.addEventListener('click', event => {
    const btn = (event.target as HTMLElement)?.closest<HTMLButtonElement>('[data-roadmap-open]');
    if (btn && btn.dataset.roadmapOpen) {
      event.preventDefault();
      void open(btn.dataset.roadmapOpen);
    }
  });

  document.getElementById('roadmap-close')!.addEventListener('click', () => dialog.close());
  document.getElementById('roadmap-detail-retry')?.addEventListener('click', () => { void open(currentIdeaId, false); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) dialog.close();
  });
  dialog.addEventListener('close', () => {
    detailRequest?.abort();
    returnFocus?.focus();
    if (!syncingHistory) {
      const url = new URL(window.location.href);
      url.searchParams.delete('item');
      window.history.replaceState(null, '', url);
    }
    syncingHistory = false;
  });

  window.addEventListener('popstate', () => {
    const url = new URL(window.location.href);
    if (normalizeView(url.searchParams.get('view')) !== board.dataset.view) {
      window.location.reload();
      return;
    }
    const id = url.searchParams.get('item');
    if (url.searchParams.has('work')) {
      if (dialog.open) {syncingHistory = true; dialog.close();}
      return;
    }
    if (id) void open(id, false);
    else if (dialog.open) {
      syncingHistory = true;
      dialog.close();
    }
  });

  // Sync initial voted states from local storage
  document.querySelectorAll<HTMLButtonElement>('[data-vote-id]').forEach(btn => {
    if (btn.dataset.voteId && hasVoted(btn.dataset.voteId)) {
      btn.classList.add('is-voted');
      btn.setAttribute('aria-pressed', 'true');
    }
  });

  document.addEventListener('click', async event => {
    const btn = (event.target as HTMLElement)?.closest<HTMLButtonElement>('[data-vote-id]');
    if (!btn || !btn.dataset.voteId || btn.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const id = btn.dataset.voteId;
    if (!uuid.test(id) || voting.has(id)) return;
    voting.add(id);
    const matching = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-vote-id="${id}"]`));
    const previous=matching.map(button=>({button,pressed:button.getAttribute('aria-pressed'),voted:button.classList.contains('is-voted'),counts:Array.from(button.querySelectorAll<HTMLElement>('.roadmap-card-vote-count,#roadmap-detail-votes')).map(el=>({el,text:el.textContent}))}));
    previous.forEach(saved=>{saved.button.classList.add('is-voted');saved.button.setAttribute('aria-pressed','true');saved.counts.forEach(({el,text})=>{if(!saved.voted)el.textContent=String((Number(text)||0)+1);});});
    matching.forEach(b => { b.disabled = true; b.setAttribute('aria-busy', 'true'); });
    const voteStatus = document.getElementById('roadmap-vote-status');
    if (voteStatus) voteStatus.textContent = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('/api/vote/' + encodeURIComponent(id), {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ action: 'up' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || typeof data.vote_count !== 'number') throw new Error();
      if (data.success) {
        saveVotedId(id);
        matching.forEach(b => {
          if (b.dataset.voteId !== id) return;
          b.classList.add('is-voted');
          b.classList.add('vote-success');setTimeout(()=>b.classList.remove('vote-success'),350);
          b.setAttribute('aria-pressed', 'true');
          const countEl = b.querySelector('.roadmap-card-vote-count');
          if (countEl) countEl.textContent = String(data.vote_count);
        });
        const cached = items.find(i => i.id === id);
        if (cached) cached.votes = data.vote_count;
        const detailVotes = document.getElementById('roadmap-detail-votes');
        if (detailVotes && (document.getElementById('roadmap-detail-vote') as HTMLElement)?.dataset.voteId === id) {
          detailVotes.textContent = String(data.vote_count);
        }
        if (typeof (window as any).sfToast === 'function') {
          (window as any).sfToast(data.already_voted ? 'You already supported this idea.' : 'Your support has been recorded. Thank you!', data.already_voted ? 'info' : 'success');
        }
        if (voteStatus) voteStatus.textContent = data.already_voted ? 'You already supported this idea.' : 'Your support has been recorded.';
      }
    } catch {
      previous.forEach(saved=>{if(saved.button.dataset.voteId!==id)return;saved.button.classList.toggle('is-voted',saved.voted);saved.button.setAttribute('aria-pressed',saved.pressed || 'false');saved.counts.forEach(({el,text})=>{el.textContent=text;});});
      if (voteStatus) voteStatus.textContent = 'Could not record your support. Please try again.';
      if (typeof (window as any).sfToast === 'function') {
        (window as any).sfToast('Could not record your support. Please try again.', 'error');
      }
    } finally {
      clearTimeout(timer);
      voting.delete(id);
      matching.forEach(b => { if (b.dataset.voteId === id) { b.disabled = false; b.removeAttribute('aria-busy'); } });
    }
  });

  const initial = new URL(window.location.href).searchParams.get('item');
  if (initial && !new URL(window.location.href).searchParams.has('work')) void open(initial, false);
})();
