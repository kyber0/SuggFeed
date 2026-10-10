(() => {
  interface RoadmapItem { id: string; title: string; description: string; status: string; category: string; votes: number; comments: number; created_at: string; updated_at: string; }
  const items: RoadmapItem[] = JSON.parse(document.getElementById('sf-roadmap-data')!.textContent || '[]');
  const stages = ['approved', 'in_progress', 'resolved'];
  const labels: Record<string, string> = { approved: 'Planned', in_progress: 'In progress', resolved: 'Completed' };
  const hints: Record<string, string> = {
    approved: 'The school has approved this idea. A delivery date has not been announced.',
    in_progress: 'Work on this idea is underway. Follow the discussion for updates from your school.',
    resolved: 'The school has marked this idea as completed.',
  };
  const search = document.getElementById('roadmap-search') as HTMLInputElement;
  const category = document.getElementById('roadmap-category') as HTMLSelectElement;
  const board = document.getElementById('campus-roadmap-board')!;
  const dialog = document.getElementById('roadmap-dialog') as HTMLDialogElement;
  const clear = document.getElementById('roadmap-clear') as HTMLButtonElement;
  let returnFocus: HTMLElement | null = null;
  let syncingHistory = false;

  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = items.filter(item => (!query || [item.title, item.description, item.category].join(' ').toLocaleLowerCase().includes(query)) && (category.value === 'all' || item.category === category.value));
    const ids = new Set(matches.map(item => item.id));
    document.querySelectorAll<HTMLElement>('[data-roadmap-id]').forEach(card => { card.hidden = !ids.has(card.dataset.roadmapId!); });
    const filtered = Boolean(query || category.value !== 'all');
    clear.hidden = !filtered;
    document.getElementById('roadmap-result-count')!.textContent = matches.length + ' of ' + items.length + ' ideas';
    stages.forEach(stage => {
      const count = matches.filter(item => item.status === stage).length;
      document.querySelector<HTMLElement>('[data-lane-count="' + stage + '"]')!.textContent = String(count);
      document.querySelector<HTMLElement>('[data-mobile-count="' + stage + '"]')!.textContent = String(count);
      const empty = document.querySelector<HTMLElement>('[data-lane-empty="' + stage + '"]')!;
      empty.hidden = count > 0;
      empty.querySelector('h3')!.textContent = filtered ? 'No matching ideas' : 'Nothing here yet';
      empty.querySelector('p')!.textContent = filtered ? 'Try another category or clear your search.' : 'Ideas will appear here as their status changes.';
    });
  }
  search.addEventListener('input', filter);
  category.addEventListener('change', filter);
  clear.addEventListener('click', () => { search.value = ''; category.value = 'all'; filter(); search.focus(); });
  document.querySelectorAll<HTMLButtonElement>('[data-roadmap-view]').forEach(button => {
    button.addEventListener('click', () => {
      board.dataset.view = button.dataset.roadmapView;
      document.querySelectorAll<HTMLButtonElement>('[data-roadmap-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      (document.querySelector('.roadmap-stage-switch') as HTMLElement).hidden = button.dataset.roadmapView === 'list';
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      document.querySelectorAll<HTMLElement>('[data-lane]').forEach(lane => lane.classList.toggle('is-mobile-active', lane.dataset.lane === button.dataset.stage));
    });
  });

  function open(id: string, push = true) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    if (!dialog.open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const badge = document.getElementById('roadmap-detail-status')!;
    badge.textContent = labels[item.status]; badge.dataset.status = item.status;
    document.getElementById('roadmap-detail-title')!.textContent = item.title;
    document.getElementById('roadmap-detail-description')!.textContent = item.description;
    document.getElementById('roadmap-detail-meta')!.textContent = item.category + ' · ' + item.votes + ' votes · Updated ' + new Date(item.updated_at).toLocaleDateString('en-PH', { dateStyle: 'medium' });
    document.getElementById('roadmap-detail-hint')!.textContent = hints[item.status];
    (document.getElementById('roadmap-detail-link') as HTMLAnchorElement).href = '/idea/' + encodeURIComponent(item.id);
    document.querySelectorAll<HTMLElement>('[data-progress-stage]').forEach(step => {
      if (step.dataset.progressStage === item.status) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    if (!dialog.open) dialog.showModal();
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set('item', item.id); window.history.pushState(null, '', url);
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-roadmap-open]').forEach(button => button.addEventListener('click', () => open(button.dataset.roadmapOpen!)));
  document.getElementById('roadmap-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) dialog.close(); });
  dialog.addEventListener('close', () => {
    returnFocus?.focus();
    if (!syncingHistory) {
      const url = new URL(window.location.href); url.searchParams.delete('item'); window.history.replaceState(null, '', url);
    }
    syncingHistory = false;
  });
  window.addEventListener('popstate', () => {
    const id = new URL(window.location.href).searchParams.get('item');
    if (id) open(id, false);
    else if (dialog.open) { syncingHistory = true; dialog.close(); }
  });
  const initial = new URL(window.location.href).searchParams.get('item');
  if (initial) open(initial, false);
})();
