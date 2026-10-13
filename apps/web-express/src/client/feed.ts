// Search, filtering, support, saved ideas, and deliberate pagination for the feed.
(function () {
  const config = document.getElementById('sf-feed-config');
  if (!config) return;
  const following = new URLSearchParams(window.location.search).get('scope') === 'following';
  let _currentSort = config.dataset.sort || 'all';
  let _currentCat = config.dataset.category || 'All';
  let _appliedSearch = config.dataset.search ?? new URLSearchParams(window.location.search).get('search') ?? '';
  const searchInput = document.getElementById('feed-search') as HTMLInputElement | null;

  function updateFilterStates() {
    document.querySelectorAll<HTMLElement>('[data-feed-sort]').forEach(button => {
      const selected = button.dataset.feedSort === _currentSort ||
        (['all', 'latest'].includes(button.dataset.feedSort || '') && ['all', 'latest'].includes(_currentSort)) ||
        (['top', 'popular'].includes(button.dataset.feedSort || '') && ['top', 'popular'].includes(_currentSort));
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll<HTMLElement>('[data-feed-category]').forEach(button => {
      const selected = button.dataset.feedCategory === _currentCat;
      button.classList.toggle('active', selected);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function sfSetSort(sort: string) {
    _currentSort = sort;
    updateFilterStates();
    sfNavigate();
  }

  function sfSetTopic(category: string) {
    _currentCat = category || 'All';
    updateFilterStates();
    sfNavigate();
  }

  function sfSetLeftTopic(category: string) { sfSetTopic(category); }

  // Kept for older delegated bindings; category filters are now always available.
  function sfToggleTopicsChips() {
    const panel = document.getElementById('topic-chips-panel');
    if (panel) panel.hidden = false;
  }
  function sfCloseMobileFilter() {}

  function sfFeedSearch(value: string) {
    const clearButton = document.getElementById('feed-search-clear') as HTMLButtonElement | null;
    if (clearButton) {
      clearButton.hidden = !value.trim();
      clearButton.style.display = value.trim() ? '' : 'none';
    }
  }

  function sfClearSearch() {
    if (searchInput) searchInput.value = '';
    sfFeedSearch('');
    if (_appliedSearch) {
      _appliedSearch = '';
      sfNavigate();
    } else {
      searchInput?.focus();
    }
  }

  function sfNavigate() {
    const url = new URL('/feed', window.location.origin);
    url.searchParams.set('sort', _currentSort);
    if (_currentCat !== 'All') url.searchParams.set('category', _currentCat);
    if (_appliedSearch.trim()) url.searchParams.set('search', _appliedSearch.trim());
    if (following) url.searchParams.set('scope','following');
    window.location.href = url.toString();
  }

  document.getElementById('feed-search-form')?.addEventListener('submit', event => {
    event.preventDefault();
    _appliedSearch = searchInput?.value.trim() || '';
    sfNavigate();
  });
  searchInput?.addEventListener('input', () => sfFeedSearch(searchInput.value));

  document.addEventListener('keydown', event => {
    const active = document.activeElement as HTMLElement | null;
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName || '') || Boolean(active?.isContentEditable);
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (event.key === 'Escape' && searchInput && active === searchInput) {
      if (searchInput.value !== _appliedSearch) {
        searchInput.value = _appliedSearch;
        sfFeedSearch(_appliedSearch);
      } else {
        searchInput.blur();
      }
    }
  });

  let rememberedVotes = new Set<string>();
  function readLocalSet(key: string): Set<string> {
    try {
      const values: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []);
    } catch { return new Set(); }
  }

  function sfGetVotedSet(): Set<string> {
    return new Set([...readLocalSet('sf_voted_ideas'), ...rememberedVotes]);
  }
  function sfSaveVotedId(id: string) {
    rememberedVotes.add(id);
    try { localStorage.setItem('sf_voted_ideas', JSON.stringify([...sfGetVotedSet()])); } catch {}
  }
  const savedOnAccount=!!document.getElementById('sf-auth-config')?.dataset.user;
  let accountSaved=new Set<string>();
  let accountBookmarksLoaded=!savedOnAccount;
  const pendingBookmarks=new Set<string>();
  function sfGetSavedSet(): Set<string> { return savedOnAccount?accountSaved:readLocalSet('sf_saved_ideas'); }

  function setSavedState(button: HTMLElement, saved: boolean) {
    (button as HTMLButtonElement).disabled=!accountBookmarksLoaded;
    button.classList.toggle('active', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('title', saved ? 'Remove saved idea' : savedOnAccount?'Save this idea to your account':'Save this idea on this device');
    button.setAttribute('aria-label', saved ? 'Remove saved idea' : savedOnAccount?'Save idea to your account':'Save idea on this device');
    const label = button.querySelector<HTMLElement>('.action-label');
    if (label) label.textContent = saved ? 'Saved' : 'Save';
  }
  function setSupportedState(button: HTMLElement, supported: boolean) {
    button.classList.toggle('active', supported);
    button.setAttribute('aria-pressed', String(supported));
    button.setAttribute('title', supported ? 'You supported this idea' : 'Support this idea');
    const label = button.querySelector<HTMLElement>('.action-label');
    if (label) label.textContent = supported ? 'Supported' : 'Support';
  }

  async function sfBookmarkPost(id: string, button: HTMLButtonElement, event?: Event) {
    if(button.disabled || !accountBookmarksLoaded || pendingBookmarks.has(id))return;button.disabled=true;pendingBookmarks.add(id);
    event?.stopPropagation();
    const saved = new Set(sfGetSavedSet());
    const willSave = !saved.has(id);
    if (willSave) saved.add(id); else saved.delete(id);
    try {
      if(savedOnAccount){const response=await fetch('/api/bookmarks/'+encodeURIComponent(id),{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({action:willSave?'add':'remove'})});const data=await response.json();if(!response.ok || !data.success)throw new Error('Account bookmark could not be confirmed.');accountSaved=saved;}
      else localStorage.setItem('sf_saved_ideas', JSON.stringify([...saved]));
      document.querySelectorAll<HTMLElement>('.action-bookmark[data-id]').forEach(other => {
        if (other.dataset.id === id) setSavedState(other, willSave);
      });
      if (window.sfToast) window.sfToast(willSave ? savedOnAccount?'Idea saved to your account.':'Idea saved on this device.' : 'Idea removed from saved ideas.', willSave ? 'success' : 'info');
    } catch {
      if (window.sfToast) window.sfToast('This bookmark could not be confirmed. Refresh to check before retrying.', 'error');
    }finally{button.disabled=false;pendingBookmarks.delete(id);}
  }

  if(savedOnAccount)void fetch('/profile/bookmarks',{cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)}).then(response=>response.json()).then(data=>{if(!data.success)throw new Error();accountSaved=new Set(data.ids);accountBookmarksLoaded=true;sfInitLocalStates();}).catch(()=>window.sfToast?.('Account bookmarks could not load. Refresh to check saved state.','error'));
  function sfInitLocalStates() {
    const votes = sfGetVotedSet();
    const saved = sfGetSavedSet();
    document.querySelectorAll<HTMLElement>('.action-like[data-id]').forEach(button => setSupportedState(button, votes.has(button.dataset.id || '')));
    document.querySelectorAll<HTMLElement>('.action-bookmark[data-id]').forEach(button => setSavedState(button, saved.has(button.dataset.id || '')));
  }

  const pendingVotes = new Set<string>();
  async function sfVoteFeed(id: string, button: HTMLButtonElement) {
    if (!id || pendingVotes.has(id)) return;
    pendingVotes.add(id);
    const matchingButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.action-like[data-id]')).filter(other => other.dataset.id === id);
    if (!matchingButtons.includes(button)) matchingButtons.push(button);
    const previous=matchingButtons.map(other=>({other,supported:other.classList.contains('active'),count:other.querySelector<HTMLElement>('.action-count')?.textContent || '0'}));
    previous.forEach(saved=>{setSupportedState(saved.other,true);const count=saved.other.querySelector<HTMLElement>('.action-count');if(count && !saved.supported)count.textContent=String((Number(saved.count)||0)+1);});
    matchingButtons.forEach(other => { other.disabled = true; other.setAttribute('aria-busy', 'true'); });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/vote/' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'up' }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(response.status === 429 ? 'rate-limit' : 'request-failed');
      const data = await response.json();
      if (!data.success || !Number.isFinite(Number(data.vote_count))) throw new Error('invalid-response');
      sfSaveVotedId(id);
      matchingButtons.forEach(other => {
        setSupportedState(other, true);
        other.classList.add('vote-success');window.setTimeout(()=>other.classList.remove('vote-success'),350);
        const count = other.querySelector<HTMLElement>('.action-count');
        if (count) count.textContent = String(Math.max(0, Number(data.vote_count)));
      });
      if (window.sfToast) window.sfToast(data.already_voted ? 'You already supported this idea.' : 'Your support has been recorded. Thank you!', data.already_voted ? 'info' : 'success');
    } catch (error) {
      previous.forEach(saved=>{setSupportedState(saved.other,saved.supported);const count=saved.other.querySelector<HTMLElement>('.action-count');if(count)count.textContent=saved.count;});
      const message = (error as any)?.message === 'rate-limit'
        ? 'Too many requests. Wait a moment, then try supporting this idea again.'
        : controller.signal.aborted
          ? 'The request timed out. Try again to confirm your support.'
          : 'Could not confirm your support. Please try again.';
      if (window.sfToast) window.sfToast(message, 'error');
    } finally {
      window.clearTimeout(timeout);
      pendingVotes.delete(id);
      matchingButtons.forEach(other => { other.disabled = false; other.removeAttribute('aria-busy'); });
    }
  }

  async function sfSharePost(id: string, event: Event, button: HTMLButtonElement) {
    event?.stopPropagation();
    const url = window.location.origin + '/idea/' + encodeURIComponent(id);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SuggFeed idea', url });
      } else {
        await navigator.clipboard.writeText(url);
        const label = button?.querySelector<HTMLElement>('.action-label');
        if (label) {
          label.textContent = 'Copied!';
          window.setTimeout(() => { label.textContent = 'Share'; }, 2000);
        }
        if (window.sfToast) window.sfToast('Idea link copied.', 'success');
      }
      await window.sfRecordShare(id);
    } catch (error) {
      if ((error as any)?.name !== 'AbortError' && window.sfToast) window.sfToast('Could not share this idea. Open it to copy the page address.', 'error');
    }
  }

  let _currentPage = Math.max(1, Number(config.dataset.page) || 1);
  let _hasMore = config.dataset.hasMore === 'true';
  let _isLoading = false;
  const _feedContainer = document.getElementById('feed-posts-container');
  const _feedLoader = document.getElementById('feed-loader') as HTMLButtonElement | null;
  const _feedEndMessage = document.getElementById('feed-end-message');
  const _feedLoadStatus = document.getElementById('feed-load-status');
  const _resultSummary = document.getElementById('feed-result-summary');

  function sfEscapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (character: string) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } as Record<string, string>)[character] || character));
  }

  function sfCreatePostCardHtml(item: any) {
    const category = String(item.category || item.categories?.name || 'Other');
    const categoryClass = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const statuses: Record<string, string> = { approved: 'Planned', in_progress: 'In progress', resolved: 'Completed' };
    const status = ['approved', 'in_progress', 'resolved'].includes(item.status) ? item.status : 'approved';
    const anonymous = item.is_anonymous || !item.author?.display_name;
    const author = anonymous ? 'Anonymous student' : String(item.author.display_name);
    const votes = Math.max(0, Number(item.vote_count) || 0);
    const comments = Math.max(0, Number(item.comment_count) || 0);
    const id = sfEscapeHtml(item.id);
    const href = '/idea/' + encodeURIComponent(String(item.id));
    const created = new Date(item.created_at);
    const validDate = Number.isFinite(created.getTime());
    const secondsAgo = validDate ? Math.max(0, Math.floor((Date.now() - created.getTime()) / 1000)) : 0;
    const relativeTime = !validDate ? '' : secondsAgo < 60 ? 'Just now' : secondsAgo < 3600 ? Math.floor(secondsAgo / 60) + 'm ago' : secondsAgo < 86400 ? Math.floor(secondsAgo / 3600) + 'h ago' : secondsAgo < 604800 ? Math.floor(secondsAgo / 86400) + 'd ago' : created.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const title = sfEscapeHtml(item.title);
    const description = sfEscapeHtml(item.description);
    const supported = sfGetVotedSet().has(String(item.id));
    const saved = sfGetSavedSet().has(String(item.id));
    const attachmentCount = Array.isArray(item.attachments) ? item.attachments.length : 0;
    return `
      <article class="post-card" data-idea-id="${id}" aria-label="Idea: ${title}">
        <div class="post-header">
          <div class="post-avatar${anonymous ? ' is-anon' : ''}" aria-hidden="true">${anonymous ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>' : sfEscapeHtml(author.charAt(0).toUpperCase())}</div>
          <div class="post-author-meta"><div class="post-author-row">
            <span class="post-author-name">${sfEscapeHtml(author)}</span>
            ${validDate ? `<span class="post-dot" aria-hidden="true">·</span><time class="post-timestamp" datetime="${created.toISOString()}" title="${sfEscapeHtml(created.toLocaleString('en-PH'))}">${relativeTime}</time>` : ''}
          </div></div>
          <span class="post-badge-status status-${status}"><span class="badge-dot" aria-hidden="true"></span>${statuses[status]}</span>
          <div class="post-menu-wrap">
            <button type="button" class="post-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="More options" title="More options">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            <div class="post-menu-dropdown" hidden>
              <button type="button" class="post-menu-item action-bookmark${saved ? ' active' : ''}" data-id="${id}" data-sf-click="bookmark-feed" aria-pressed="${saved}" aria-label="${saved ? 'Remove saved idea from this device' : 'Save idea on this device'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                <span class="action-label">${saved ? 'Saved' : 'Save'}</span>
              </button>
              <button type="button" class="post-menu-item action-share" data-sf-click="share-feed" data-id="${id}" aria-label="Share idea">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98m0-10.98-6.83 3.98"/></svg>
                <span>Share</span>
              </button>
              <div class="post-menu-divider" role="separator"></div>
              <button type="button" class="post-menu-item post-menu-item--danger care-report" data-report-idea="${id}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Report</span>
              </button>
            </div>
          </div>
        </div>
        <div class="post-content">
          <span class="post-badge-category cat-${categoryClass}"><span class="badge-dot" aria-hidden="true"></span>${sfEscapeHtml(category)}</span>
          <h2 class="post-title"><a class="post-title-link" href="${href}" data-sf-click="open-detail" data-idea-id="${id}">${title}</a></h2>
          <p class="post-body">${description}</p>
        </div>
        ${attachmentCount ? `<div class="post-media-container"><a class="post-attachment-pill" href="${href}" data-sf-click="open-detail" data-idea-id="${id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span>${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}</span><span class="attachment-cta">View files →</span>
        </a></div>` : ''}
        <div class="post-footer" data-sf-click="stop">
          <button type="button" class="care-report" data-report-idea="${id}">Report</button>
          <button type="button" class="action-btn action-like${supported ? ' active' : ''}" data-id="${id}" data-sf-click="vote-feed" aria-pressed="${supported}" title="${supported ? 'You supported this idea' : 'Support this idea'}">
            <svg class="heart-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="action-count">${votes}</span><span class="action-label">${supported ? 'Supported' : 'Support'}</span>
          </button>
          <button type="button" class="action-btn action-comment" data-sf-click="comment-feed" data-idea-id="${id}" aria-label="Open discussion, ${comments} comments" title="Open discussion">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="action-count">${comments}</span><span class="action-label">Comments</span>
          </button>
          <button type="button" class="action-btn action-bookmark${saved ? ' active' : ''}" data-id="${id}" data-sf-click="bookmark-feed" aria-pressed="${saved}" aria-label="${saved ? 'Remove saved idea from this device' : 'Save idea on this device'}" title="${saved ? 'Remove from saved ideas on this device' : 'Save this idea on this device'}">
            <svg class="bookmark-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg><span class="action-label">${saved ? 'Saved' : 'Save'}</span>
          </button>
          <button type="button" class="action-btn action-share" data-sf-click="share-feed" data-id="${id}" aria-label="Share idea" title="Share idea link">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span class="action-label">Share</span>
          </button>
        </div>
      </article>`;
  }

  // ── Post card 3-dot dropdown menu ────────────────────────────────────
  function sfCloseAllPostMenus(except?: Element) {
    document.querySelectorAll<HTMLElement>('.post-menu-wrap').forEach(wrap => {
      if (wrap === except) return;
      const btn = wrap.querySelector<HTMLButtonElement>('.post-menu-btn');
      const dropdown = wrap.querySelector<HTMLElement>('.post-menu-dropdown');
      if (dropdown && !dropdown.hidden) { dropdown.hidden = true; btn?.setAttribute('aria-expanded', 'false'); }
    });
  }

  document.addEventListener('click', event => {
    const target = event.target as Element;
    if (!target) return;
    const btn = target.closest<HTMLButtonElement>('.post-menu-btn');
    if (btn) {
      const wrap = btn.closest('.post-menu-wrap');
      if (wrap) {
        const dropdown = wrap.querySelector<HTMLElement>('.post-menu-dropdown');
        if (dropdown) {
          const opening = dropdown.hidden;
          sfCloseAllPostMenus(opening ? wrap : undefined);
          dropdown.hidden = !opening;
          btn.setAttribute('aria-expanded', String(opening));
          if (opening) {
            const items = Array.from(dropdown.querySelectorAll<HTMLElement>('.post-menu-item'));
            const firstVisible = items.find(el => el.offsetWidth > 0 || el.offsetHeight > 0 || window.getComputedStyle(el).display !== 'none');
            (firstVisible || items[0])?.focus();
          }
        }
      }
      return;
    }
    const item = target.closest<HTMLElement>('.post-menu-item');
    if (item) {
      const wrap = item.closest('.post-menu-wrap');
      if (wrap) {
        const dropdown = wrap.querySelector<HTMLElement>('.post-menu-dropdown');
        const menuBtn = wrap.querySelector<HTMLButtonElement>('.post-menu-btn');
        if (dropdown) dropdown.hidden = true;
        menuBtn?.setAttribute('aria-expanded', 'false');
      }
      return;
    }
    // Close if clicked outside any open menu
    if (!target.closest('.post-menu-wrap')) sfCloseAllPostMenus();
  }, true /* capture phase so nothing can intercept menu toggle or outside click */);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') sfCloseAllPostMenus();
  });
  // ─────────────────────────────────────────────────────────────────────

  function updateResultSummary(total?: number) {
    if (!_resultSummary || !_feedContainer) return;
    const shown = _feedContainer.querySelectorAll('.post-card[data-idea-id]').length;
    if (typeof total === 'number' && Number.isFinite(total)) _resultSummary.dataset.total = String(total);
    const count = Math.max(shown, Number(_resultSummary.dataset.total) || shown);
    _resultSummary.textContent = 'Showing ' + shown.toLocaleString() + ' of ' + count.toLocaleString() + (_appliedSearch || _currentCat !== 'All' ? ' matching idea' : ' idea') + (count === 1 ? '' : 's');
  }

  async function sfLoadMoreFeed() {
    if (_isLoading || !_hasMore || !_feedContainer) return;
    _isLoading = true;
    const label = _feedLoader?.querySelector<HTMLElement>('.feed-loading-text');
    if (_feedLoader) {
      _feedLoader.disabled = true;
      _feedLoader.setAttribute('aria-busy', 'true');
    }
    if (label) label.textContent = 'Loading more ideas…';
    if (_feedLoadStatus) _feedLoadStatus.textContent = '';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const nextPage = _currentPage + 1;
      const params = new URLSearchParams({ page: String(nextPage), sort: _currentSort, category: _currentCat, search: _appliedSearch });
      if (following) params.set('scope','following');
      const response = await fetch('/api/feed?' + params.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('request-failed');
      const data = await response.json();
      const items = data?.feed ?? data?.data;
      if (data?.success === false || !Array.isArray(items)) throw new Error('invalid-response');
      const loadedIds = new Set(Array.from(_feedContainer.querySelectorAll<HTMLElement>('.post-card[data-idea-id]')).map(card => card.dataset.ideaId));
      const fresh = items.filter(item => {
        if (!item || typeof item.id !== 'string' || loadedIds.has(item.id)) return false;
        loadedIds.add(item.id);
        return true;
      });
      const previousCount = _feedContainer.children.length;
      const fragment = document.createDocumentFragment();
      fresh.forEach(item => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = sfCreatePostCardHtml(item);
        if (wrapper.firstElementChild) fragment.appendChild(wrapper.firstElementChild);
      });
      _feedContainer.appendChild(fragment);
      // Keep keyboard users at the start of the newly added results.
      (_feedContainer.children[previousCount]?.querySelector('.post-title-link') as HTMLElement | null)?.focus({ preventScroll: true });
      _currentPage = nextPage;
      _hasMore = items.length > 0 && (typeof data.hasMore === 'boolean' ? data.hasMore : items.length >= 15);
      updateResultSummary(typeof data.totalCount === 'number' ? data.totalCount : data.count);
      sfInitLocalStates();
      if (_feedLoadStatus) _feedLoadStatus.textContent = fresh.length ? fresh.length + ' more idea' + (fresh.length === 1 ? '' : 's') + ' loaded.' : _hasMore ? 'This page contained ideas already shown. Load more to continue.' : 'You have reached the end of these ideas.';
      if (_feedLoader) {
        _feedLoader.hidden = !_hasMore;
        _feedLoader.style.display = _hasMore ? '' : 'none';
      }
      if (_feedEndMessage) {
        _feedEndMessage.hidden = _hasMore;
        _feedEndMessage.style.display = _hasMore ? 'none' : '';
      }
      if (label) label.textContent = 'Load more ideas';
    } catch {
      if (label) label.textContent = 'Try loading again';
      if (_feedLoadStatus) _feedLoadStatus.textContent = controller.signal.aborted ? 'Loading took too long. Your current ideas are still here. Try again.' : 'Could not load more ideas. Your current ideas are still here. Try again.';
    } finally {
      window.clearTimeout(timeout);
      _isLoading = false;
      if (_feedLoader) {
        _feedLoader.disabled = false;
        _feedLoader.removeAttribute('aria-busy');
      }
    }
  }

  updateFilterStates();
  sfFeedSearch(searchInput?.value || '');
  updateResultSummary();
  sfInitLocalStates();
  Object.assign(window, { sfSetSort, sfSetTopic, sfSetLeftTopic, sfToggleTopicsChips, sfFeedSearch, sfClearSearch, sfNavigate, sfGetVotedSet, sfSaveVotedId, sfGetSavedSet, sfBookmarkPost, sfInitLocalStates, sfVoteFeed, sfSharePost, sfCloseMobileFilter, sfEscapeHtml, sfCreatePostCardHtml, sfLoadMoreFeed });
})();
