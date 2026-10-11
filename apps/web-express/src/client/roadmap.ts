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
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function normalizeView(view: string | null | undefined): string {
    if (view === 'tree' || view === 'list') return 'tree';
    if (view === 'done' || view === 'timeline') return 'done';
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
    document.getElementById('roadmap-detail-content')!.hidden = false;
    document.getElementById('roadmap-detail-error')!.textContent = '';
    const badge = document.getElementById('roadmap-detail-status')!;
    badge.textContent = labels[item.status] || item.status;
    badge.dataset.status = item.status;
    document.getElementById('roadmap-detail-title')!.textContent = item.title;
    document.getElementById('roadmap-detail-description')!.textContent = item.description;

    const blockedAlert = document.getElementById('roadmap-detail-blocked-alert');
    if (blockedAlert) {
      blockedAlert.hidden = !item.is_blocked;
    }

    const progressWrap = document.getElementById('roadmap-detail-progress-wrap');
    const progressBar = document.getElementById('roadmap-detail-bar-fill');
    const progressText = document.getElementById('roadmap-detail-progress-text');
    if (progressWrap && progressBar && progressText) {
      if (typeof item.progress_percent === 'number' && (item.status === 'in_progress' || item.status === 'resolved')) {
        progressWrap.hidden = false;
        progressBar.style.width = `${item.progress_percent}%`;
        progressText.textContent = `${item.progress_percent}% complete`;
      } else {
        progressWrap.hidden = true;
      }
    }

    const detailVote = document.getElementById('roadmap-detail-vote') as HTMLButtonElement | null;
    const detailVotes = document.getElementById('roadmap-detail-votes');
    if (detailVote && detailVotes) {
      detailVote.dataset.voteId = item.id;
      detailVotes.textContent = String(item.votes);
      const voted = hasVoted(item.id);
      detailVote.classList.toggle('is-voted', voted);
      detailVote.setAttribute('aria-pressed', String(voted));
    }

    const dateLabel = item.status === 'resolved'
      ? item.resolved_at ? `Completed ${item.resolved_at_estimated ? 'around ' : ''}${formatManilaDate(item.resolved_at)}` : 'Completion date not recorded'
      : `Updated ${formatManilaDate(item.updated_at)}`;
    document.getElementById('roadmap-detail-meta')!.textContent = `${item.category} · ${item.votes} votes · ${dateLabel}`;
    document.getElementById('roadmap-detail-response')!.textContent = item.response || 'The school has not posted a public response yet.';
    document.getElementById('roadmap-detail-hint')!.textContent = hints[item.status] || '';
    document.getElementById('roadmap-detail-estimate')!.textContent = [
      typeof item.progress_percent === 'number' ? `${item.progress_percent}% complete — school estimate` : '',
      item.is_blocked ? 'Work is currently blocked; see the school update below.' : '',
    ].filter(Boolean).join(' · ');
    (document.getElementById('roadmap-detail-link') as HTMLAnchorElement).href = '/idea/' + encodeURIComponent(item.id);
    const follow = document.getElementById('roadmap-follow') as HTMLButtonElement;
    follow.dataset.followIdea = item.id;
    document.dispatchEvent(new CustomEvent('sf:follow-context', { detail: follow }));

    document.querySelectorAll<HTMLElement>('[data-progress-stage]').forEach(step => {
      if (step.dataset.progressStage === item.status) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
  }

  function showUpdates(updates: PublicUpdate[]) {
    const list = document.getElementById('roadmap-history-list')!;
    list.replaceChildren();
    const names: Record<string, string> = { started: 'Work started', update: 'Progress update', milestone: 'Milestone', blocked: 'Work blocked', completed: 'Completed', correction: 'Correction' };
    for (const update of updates) {
      const entry = document.createElement('li');
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
        nextStep.textContent = 'Next step: ' + update.next_step;
        entry.append(nextStep);
      }
      list.append(entry);
    }
    document.getElementById('roadmap-history-status')!.textContent = updates.length
      ? updates.length === 50 ? 'Showing the latest 50 school updates.' : ''
      : 'The school has not posted a progress update yet.';
  }

  async function open(id: string, push = true) {
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
    if (item) {
      show(item);
    } else {
      document.getElementById('roadmap-detail-title')!.textContent = 'Loading idea…';
      document.getElementById('roadmap-detail-content')!.hidden = true;
      document.getElementById('roadmap-detail-status')!.textContent = '';
      document.getElementById('roadmap-detail-meta')!.textContent = '';
      document.getElementById('roadmap-detail-error')!.textContent = '';
    }
    document.getElementById('roadmap-history-list')!.replaceChildren();
    document.getElementById('roadmap-history-status')!.textContent = 'Loading school updates…';
    if (!uuid.test(id)) {
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
        throw new Error(response.status === 404 ? 'This idea is no longer on the public roadmap.' : 'This idea could not load. Close the panel and reopen it to retry.');
      }
      if (dialog.open && detailRequest === controller) {
        show(body.item);
        showUpdates(Array.isArray(body.updates) ? body.updates : []);
      }
    } catch (error) {
      if (dialog.open && detailRequest === controller) {
        document.getElementById('roadmap-detail-title')!.textContent = 'Idea unavailable';
        document.getElementById('roadmap-detail-content')!.hidden = true;
        document.getElementById('roadmap-detail-error')!.textContent = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Loading timed out. Close the panel and reopen it to retry.';
      }
    } finally {
      clearTimeout(timer);
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
    const matching = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-vote-id="${id}"]`));
    matching.forEach(b => { b.disabled = true; b.setAttribute('aria-busy', 'true'); });
    try {
      const res = await fetch('/api/vote/' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ action: 'up' }),
      });
      const data = await res.json();
      if (res.ok && data.success && typeof data.vote_count === 'number') {
        saveVotedId(id);
        matching.forEach(b => {
          b.classList.add('is-voted');
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
      }
    } catch {
      if (typeof (window as any).sfToast === 'function') {
        (window as any).sfToast('Could not record your support. Please try again.', 'error');
      }
    } finally {
      matching.forEach(b => { b.disabled = false; b.removeAttribute('aria-busy'); });
    }
  });

  const initial = new URL(window.location.href).searchParams.get('item');
  if (initial) void open(initial, false);
})();
