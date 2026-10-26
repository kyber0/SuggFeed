"use strict";
// Search, filtering, support, saved ideas, and deliberate pagination for the feed.
(function () {
    const config = document.getElementById('sf-feed-config');
    if (!config || config.dataset.feedReady === 'true')
        return;
    config.dataset.feedReady = 'true';
    const panes = ['.community-feed-main', '.community-left-nav'];
    // Document scroll restoration does not reliably restore independently scrolling panes.
    function rememberPanes() {
        if (window.innerWidth < 900)
            return;
        try {
            history.replaceState({ ...history.state, sfFeedScroll: panes.map(selector => document.querySelector(selector)?.scrollTop || 0) }, '');
        }
        catch { /* Navigation still works when history state is unavailable. */ }
    }
    let scrollSave;
    panes.forEach(selector => document.querySelector(selector)?.addEventListener('scroll', () => {
        clearTimeout(scrollSave);
        scrollSave = setTimeout(rememberPanes, 150);
    }, { passive: true }));
    window.addEventListener('pagehide', () => { clearTimeout(scrollSave); rememberPanes(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        rememberPanes(); });
    window.addEventListener('pageshow', () => {
        if (window.innerWidth < 900 || performance.getEntriesByType('navigation')[0]?.type !== 'back_forward')
            return;
        const positions = history.state?.sfFeedScroll;
        if (!Array.isArray(positions))
            return;
        panes.forEach((selector, index) => {
            const pane = document.querySelector(selector);
            if (pane && typeof positions[index] === 'number' && Number.isFinite(positions[index]))
                pane.scrollTop = Math.max(0, positions[index]);
        });
    });
    const following = new URLSearchParams(window.location.search).get('scope') === 'following';
    let _currentSort = config.dataset.sort || 'all';
    let _currentCat = config.dataset.category || 'All';
    let _appliedSearch = config.dataset.search ?? new URLSearchParams(window.location.search).get('search') ?? '';
    const searchInput = document.getElementById('feed-search');
    function updateFilterStates() {
        document.querySelectorAll('[data-feed-sort]').forEach(button => {
            const selected = button.dataset.feedSort === _currentSort ||
                (['all', 'latest'].includes(button.dataset.feedSort || '') && ['all', 'latest'].includes(_currentSort)) ||
                (['top', 'popular'].includes(button.dataset.feedSort || '') && ['top', 'popular'].includes(_currentSort));
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        document.querySelectorAll('[data-feed-category]').forEach(button => {
            const selected = button.dataset.feedCategory === _currentCat;
            button.classList.toggle('active', selected);
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    }
    function sfSetSort(sort) {
        _currentSort = sort;
        updateFilterStates();
        sfNavigate();
    }
    function sfSetTopic(category) {
        _currentCat = category || 'All';
        updateFilterStates();
        sfNavigate();
    }
    function sfSetLeftTopic(category) { sfSetTopic(category); }
    // Kept for older delegated bindings; category filters are now always available.
    function sfToggleTopicsChips() {
        const panel = document.getElementById('topic-chips-panel');
        if (panel)
            panel.hidden = false;
    }
    const filterDialog = document.getElementById('feed-filter-dialog');
    const filterForm = document.getElementById('feed-filter-form');
    const filterOpener = document.querySelector('[data-feed-filters-open]');
    filterOpener?.addEventListener('click', () => { if (!filterDialog || !filterForm)
        return; const radio = Array.from(filterForm.querySelectorAll('input[name="category"]')).find(input => input.value === _currentCat); if (radio)
        radio.checked = true; filterDialog.showModal(); });
    function sfCloseMobileFilter() { filterDialog?.close(); }
    document.querySelector('[data-feed-filters-close]')?.addEventListener('click', sfCloseMobileFilter);
    filterDialog?.addEventListener('close', () => filterOpener?.focus());
    document.querySelector('[data-feed-filters-reset]')?.addEventListener('click', () => { const all = filterForm?.querySelector('input[value="All"]'); if (all)
        all.checked = true; });
    filterForm?.addEventListener('submit', event => { event.preventDefault(); if (!filterForm)
        return; _currentCat = String(new FormData(filterForm).get('category') || 'All'); sfCloseMobileFilter(); sfNavigate(); });
    function sfFeedSearch(value) {
        const clearButton = document.getElementById('feed-search-clear');
        if (clearButton) {
            clearButton.hidden = !value.trim();
            clearButton.style.display = value.trim() ? '' : 'none';
        }
    }
    function sfClearSearch() {
        if (searchInput)
            searchInput.value = '';
        sfFeedSearch('');
        if (_appliedSearch) {
            _appliedSearch = '';
            sfNavigate();
        }
        else {
            searchInput?.focus();
        }
    }
    function sfNavigate() {
        // Sort/category navigation keeps the query applied to this result set.
        const url = new URL(sfSchoolPath('/feed'), window.location.origin);
        url.searchParams.set('sort', _currentSort);
        if (_currentCat !== 'All')
            url.searchParams.set('category', _currentCat);
        if (_appliedSearch.trim())
            url.searchParams.set('search', _appliedSearch.trim());
        if (following)
            url.searchParams.set('scope', 'following');
        window.location.href = url.toString();
    }
    document.querySelector('[data-feed-sort-select]')?.addEventListener('change', event => sfSetSort(event.target.value));
    const savedDialog = document.getElementById('saved-search-dialog');
    const savedOpener = document.querySelector('[data-feed-saved-open]');
    savedOpener?.addEventListener('click', () => savedDialog?.showModal());
    document.querySelector('[data-feed-saved-close]')?.addEventListener('click', () => savedDialog?.close());
    savedDialog?.addEventListener('close', () => savedOpener?.focus());
    document.getElementById('feed-search-form')?.addEventListener('submit', event => {
        event.preventDefault();
        _appliedSearch = searchInput?.value.trim() || '';
        sfNavigate();
    });
    searchInput?.addEventListener('input', () => sfFeedSearch(searchInput.value));
    document.addEventListener('keydown', event => {
        const active = document.activeElement;
        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName || '') || Boolean(active?.isContentEditable);
        if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            searchInput?.focus();
            searchInput?.select();
        }
        else if (event.key === 'Escape' && searchInput && active === searchInput) {
            if (searchInput.value !== _appliedSearch) {
                searchInput.value = _appliedSearch;
                sfFeedSearch(_appliedSearch);
            }
            else {
                searchInput.blur();
            }
        }
    });
    const knownVotes = new Map();
    const initialVotes = JSON.parse(config.dataset.votes || '[]');
    const votedIds = new Set(Array.isArray(initialVotes) ? initialVotes : []);
    if (config.dataset.voteState !== 'false')
        document.querySelectorAll('.post-card[data-idea-id]').forEach(card => knownVotes.set(card.dataset.ideaId, votedIds.has(card.dataset.ideaId)));
    let rememberedVotes = new Set();
    function readLocalSet(key) {
        try {
            const values = JSON.parse(localStorage.getItem(sfSchoolKey(key)) || '[]');
            return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
        }
        catch {
            return new Set();
        }
    }
    function sfGetVotedSet() {
        const values = new Set([...readLocalSet('sf_voted_ideas'), ...rememberedVotes]);
        knownVotes.forEach((voted, id) => voted ? values.add(id) : values.delete(id));
        return values;
    }
    function sfSaveVotedId(id) {
        rememberedVotes.add(id);
        try {
            localStorage.setItem(sfSchoolKey('sf_voted_ideas'), JSON.stringify([...sfGetVotedSet()]));
        }
        catch { }
    }
    const savedOnAccount = !!document.getElementById('sf-auth-config')?.dataset.user;
    let accountSaved = new Set();
    let accountBookmarksLoaded = !savedOnAccount;
    const pendingBookmarks = new Set();
    function sfGetSavedSet() { return savedOnAccount ? accountSaved : readLocalSet('sf_saved_ideas'); }
    function setSavedState(button, saved) {
        button.disabled = !accountBookmarksLoaded;
        button.classList.toggle('active', saved);
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute('title', saved ? 'Remove saved idea' : savedOnAccount ? 'Save this idea to your account' : 'Save this idea on this device');
        button.setAttribute('aria-label', saved ? 'Remove saved idea' : savedOnAccount ? 'Save idea to your account' : 'Save idea on this device');
        const label = button.querySelector('.action-label');
        if (label)
            label.textContent = saved ? 'Saved' : 'Save';
    }
    function setSupportedState(button, supported) {
        button.classList.toggle('active', supported);
        button.setAttribute('aria-pressed', String(supported));
        button.setAttribute('title', supported ? 'Undo your support' : 'Support this idea');
        const label = button.querySelector('.action-label');
        if (label)
            label.textContent = supported ? 'Supported' : 'Support';
    }
    async function sfBookmarkPost(id, button, event) {
        if (button.disabled || !accountBookmarksLoaded || pendingBookmarks.has(id))
            return;
        button.disabled = true;
        pendingBookmarks.add(id);
        event?.stopPropagation();
        const saved = new Set(sfGetSavedSet());
        const willSave = !saved.has(id);
        if (willSave)
            saved.add(id);
        else
            saved.delete(id);
        try {
            if (savedOnAccount) {
                const response = await sfSchoolFetch('/api/bookmarks/' + encodeURIComponent(id), { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: willSave ? 'add' : 'remove' }) });
                const data = await response.json();
                if (!response.ok || !data.success)
                    throw new Error('Account bookmark could not be confirmed.');
                if (willSave)
                    accountSaved.add(id);
                else
                    accountSaved.delete(id);
            }
            else
                localStorage.setItem(sfSchoolKey('sf_saved_ideas'), JSON.stringify([...saved]));
            document.querySelectorAll('.action-bookmark[data-id]').forEach(other => {
                if (other.dataset.id === id)
                    setSavedState(other, willSave);
            });
            if (window.sfToast)
                window.sfToast(willSave ? savedOnAccount ? 'Idea saved to your account.' : 'Idea saved on this device.' : 'Idea removed from saved ideas.', willSave ? 'success' : 'info');
        }
        catch {
            if (window.sfToast)
                window.sfToast('This bookmark could not be confirmed. Refresh to check before retrying.', 'error');
        }
        finally {
            button.disabled = false;
            pendingBookmarks.delete(id);
        }
    }
    let hydratedBookmarks = false;
    const initialAccountState = document.getElementById('sf-feed-account-state');
    if (savedOnAccount && initialAccountState?.dataset.user === document.getElementById('sf-auth-config')?.dataset.user) {
        try {
            const ids = JSON.parse(initialAccountState.dataset.bookmarks || 'null');
            if (Array.isArray(ids) && ids.every(id => typeof id === 'string')) {
                accountSaved = new Set(ids);
                accountBookmarksLoaded = true;
                hydratedBookmarks = true;
            }
        }
        catch { }
    }
    let bookmarkLoadBusy = false;
    async function loadBookmarks() {
        if (bookmarkLoadBusy)
            return;
        bookmarkLoadBusy = true;
        document.getElementById('bookmark-retry')?.remove();
        try {
            const response = await sfSchoolFetch('/profile/bookmarks', { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
            const data = await response.json();
            if (!response.ok || !data.success)
                throw new Error();
            accountSaved = new Set(data.ids);
            accountBookmarksLoaded = true;
            sfInitLocalStates();
        }
        catch {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.id = 'bookmark-retry';
            retry.className = 'workspace-button';
            retry.textContent = 'Saved state unavailable · Retry';
            retry.addEventListener('click', () => void loadBookmarks());
            document.getElementById('feed-posts-container')?.before(retry);
        }
        finally {
            bookmarkLoadBusy = false;
        }
    }
    if (savedOnAccount && !hydratedBookmarks)
        void loadBookmarks();
    function sfInitLocalStates() {
        const votes = sfGetVotedSet();
        const saved = sfGetSavedSet();
        document.querySelectorAll('.action-like[data-id]').forEach(button => { const id = button.dataset.id || ''; if (knownVotes.has(id)) {
            delete button.dataset.supportUnknown;
            setSupportedState(button, votes.has(id));
        }
        else
            markSupportUnknown(button); });
        document.querySelectorAll('.action-bookmark[data-id]').forEach(button => setSavedState(button, saved.has(button.dataset.id || '')));
    }
    document.addEventListener('sf:vote-changed', event => { const { id, voted } = event.detail; knownVotes.set(id, voted); if (voted)
        rememberedVotes.add(id);
    else
        rememberedVotes.delete(id); });
    function markSupportUnknown(button) { button.dataset.supportUnknown = 'true'; button.classList.remove('active'); const count = button.querySelector('.action-count'); if (count)
        count.textContent = '—'; button.removeAttribute('aria-pressed'); button.title = 'Refresh to check support'; const label = button.querySelector('.action-label'); if (label)
        label.textContent = 'Check support'; }
    const pendingVotes = new Set();
    async function sfVoteFeed(id, button) {
        if (!id || pendingVotes.has(id))
            return;
        if (button.dataset.supportUnknown === 'true') {
            location.reload();
            return;
        }
        const voted = !button.classList.contains('active');
        pendingVotes.add(id);
        const matchingButtons = Array.from(document.querySelectorAll('.action-like[data-id]')).filter(other => other.dataset.id === id);
        if (!matchingButtons.includes(button))
            matchingButtons.push(button);
        const previous = matchingButtons.map(other => ({ other, supported: other.classList.contains('active'), count: other.querySelector('.action-count')?.textContent || '0' }));
        previous.forEach(saved => { setSupportedState(saved.other, voted); const count = saved.other.querySelector('.action-count'); if (count)
            count.textContent = String(Math.max(0, (Number(saved.count) || 0) + (voted ? 1 : -1))); });
        matchingButtons.forEach(other => { other.disabled = true; other.setAttribute('aria-busy', 'true'); });
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
            const response = await sfSchoolFetch('/api/vote/' + encodeURIComponent(id), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ action: voted ? 'up' : 'unvote' }),
                signal: controller.signal
            });
            if (!response.ok)
                throw new Error(response.status === 429 ? 'rate-limit' : response.status < 500 ? 'rejected' : 'request-failed');
            const data = await response.json();
            if (!data.success || typeof data.voted !== 'boolean' || !Number.isFinite(Number(data.vote_count)))
                throw new Error('invalid-response');
            sfRememberVote(id, data.voted, data.vote_count);
            matchingButtons.forEach(other => {
                setSupportedState(other, data.voted);
                other.classList.add('vote-success');
                window.setTimeout(() => other.classList.remove('vote-success'), 350);
                const count = other.querySelector('.action-count');
                if (count)
                    count.textContent = String(Math.max(0, Number(data.vote_count)));
            });
            if (window.sfToast)
                window.sfToast(data.voted ? 'Your support has been recorded.' : 'Your support has been removed.', 'success');
        }
        catch (error) {
            previous.forEach(saved => { const count = saved.other.querySelector('.action-count'); if (count)
                count.textContent = saved.count; });
            if (['rate-limit', 'rejected'].includes(error.message)) {
                previous.forEach(saved => setSupportedState(saved.other, saved.supported));
            }
            else {
                knownVotes.delete(id);
                matchingButtons.forEach(markSupportUnknown);
            }
            const message = error?.message === 'rate-limit'
                ? 'Too many requests. Wait a moment, then try supporting this idea again.'
                : controller.signal.aborted
                    ? 'The request timed out. Refresh to check whether your support was saved.'
                    : 'Could not confirm your support. Refresh to check its current state.';
            if (window.sfToast)
                window.sfToast(message, 'error');
        }
        finally {
            window.clearTimeout(timeout);
            pendingVotes.delete(id);
            matchingButtons.forEach(other => { other.disabled = false; other.removeAttribute('aria-busy'); });
        }
    }
    async function sfSharePost(id, event, button) {
        event?.stopPropagation();
        const url = window.location.origin + sfSchoolPath('/idea/' + encodeURIComponent(id));
        try {
            if (navigator.share) {
                await navigator.share({ title: 'SuggFeed idea', url });
            }
            else {
                await navigator.clipboard.writeText(url);
                const label = button?.querySelector('.action-label');
                if (label) {
                    label.textContent = 'Copied!';
                    window.setTimeout(() => { label.textContent = 'Share'; }, 2000);
                }
                if (window.sfToast)
                    window.sfToast('Idea link copied.', 'success');
            }
            await window.sfRecordShare(id);
        }
        catch (error) {
            if (error?.name !== 'AbortError' && window.sfToast)
                window.sfToast('Could not share this idea. Open it to copy the page address.', 'error');
        }
    }
    let _currentPage = Math.max(1, Number(config.dataset.page) || 1);
    let _hasMore = config.dataset.hasMore === 'true';
    let _isLoading = false;
    const _feedContainer = document.getElementById('feed-posts-container');
    const _feedLoader = document.getElementById('feed-loader');
    const _feedEndMessage = document.getElementById('feed-end-message');
    const _feedLoadStatus = document.getElementById('feed-load-status');
    const _resultSummary = document.getElementById('feed-result-summary');
    function sfEscapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));
    }
    // ── Post card 3-dot dropdown menu ────────────────────────────────────
    function sfCloseAllPostMenus(except) {
        document.querySelectorAll('.post-menu-wrap').forEach(wrap => {
            if (wrap === except)
                return;
            const btn = wrap.querySelector('.post-menu-btn');
            const dropdown = wrap.querySelector('.post-menu-dropdown');
            if (dropdown && !dropdown.hidden) {
                dropdown.hidden = true;
                btn?.setAttribute('aria-expanded', 'false');
            }
        });
    }
    document.addEventListener('click', event => {
        const target = event.target;
        if (!target)
            return;
        const btn = target.closest('.post-menu-btn');
        if (btn) {
            const wrap = btn.closest('.post-menu-wrap');
            if (wrap) {
                const dropdown = wrap.querySelector('.post-menu-dropdown');
                if (dropdown) {
                    const opening = dropdown.hidden;
                    sfCloseAllPostMenus(opening ? wrap : undefined);
                    dropdown.hidden = !opening;
                    btn.setAttribute('aria-expanded', String(opening));
                    if (opening) {
                        const follow = dropdown.querySelector('[data-follow-idea]');
                        if (follow && follow.dataset.following === undefined)
                            document.dispatchEvent(new CustomEvent('sf:follow-context', { detail: follow }));
                        const items = Array.from(dropdown.querySelectorAll('.post-menu-item'));
                        const firstVisible = items.find(el => el.offsetWidth > 0 || el.offsetHeight > 0 || window.getComputedStyle(el).display !== 'none');
                        (firstVisible || items[0])?.focus();
                    }
                }
            }
            return;
        }
        const item = target.closest('.post-menu-item');
        if (item) {
            const wrap = item.closest('.post-menu-wrap');
            if (wrap) {
                const dropdown = wrap.querySelector('.post-menu-dropdown');
                const menuBtn = wrap.querySelector('.post-menu-btn');
                if (dropdown)
                    dropdown.hidden = true;
                menuBtn?.setAttribute('aria-expanded', 'false');
            }
            return;
        }
        // Close if clicked outside any open menu
        if (!target.closest('.post-menu-wrap'))
            sfCloseAllPostMenus();
    }, true /* capture phase so nothing can intercept menu toggle or outside click */);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const opener = document.activeElement?.closest('.post-menu-wrap')?.querySelector('.post-menu-btn');
            sfCloseAllPostMenus();
            opener?.focus();
        }
    });
    // ─────────────────────────────────────────────────────────────────────
    function updateResultSummary(total) {
        if (!_resultSummary || !_feedContainer)
            return;
        const shown = _feedContainer.querySelectorAll('.post-card[data-idea-id]').length;
        if (typeof total === 'number' && Number.isFinite(total))
            _resultSummary.dataset.total = String(total);
        const known = _resultSummary.dataset.total !== '';
        const count = Math.max(shown, Number(_resultSummary.dataset.total) || shown);
        _resultSummary.textContent = 'Showing ' + shown.toLocaleString() + (known ? ' of ' + count.toLocaleString() : '') + (_appliedSearch || _currentCat !== 'All' ? ' matching idea' : ' idea') + ((known ? count : shown) === 1 ? '' : 's');
    }
    async function sfLoadMoreFeed() {
        if (_isLoading || !_hasMore || !_feedContainer)
            return;
        _isLoading = true;
        const label = _feedLoader?.querySelector('.feed-loading-text');
        if (_feedLoader) {
            _feedLoader.disabled = true;
            _feedLoader.setAttribute('aria-busy', 'true');
        }
        if (label)
            label.textContent = 'Loading more ideas…';
        if (_feedLoadStatus)
            _feedLoadStatus.textContent = '';
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
            const nextPage = _currentPage + 1;
            const params = new URLSearchParams({ cards: '1', page: String(nextPage), sort: _currentSort, category: _currentCat, search: _appliedSearch });
            if (following)
                params.set('scope', 'following');
            else
                params.set('total', 'skip');
            const response = await sfSchoolFetch('/api/feed?' + params.toString(), { headers: { Accept: 'application/json' }, signal: controller.signal });
            if (!response.ok)
                throw new Error('request-failed');
            const data = await response.json();
            const items = data?.feed ?? data?.data;
            if (data?.success === false || !Array.isArray(items))
                throw new Error('invalid-response');
            const loadedIds = new Set(Array.from(_feedContainer.querySelectorAll('.post-card[data-idea-id]')).map(card => card.dataset.ideaId));
            const fresh = items.filter(item => {
                if (!item || typeof item.id !== 'string' || loadedIds.has(item.id))
                    return false;
                loadedIds.add(item.id);
                return true;
            });
            const previousCount = _feedContainer.children.length;
            if (typeof data.cardsHtml !== 'string')
                throw new Error('missing-card-markup');
            const pageTemplate = document.createElement('template');
            pageTemplate.innerHTML = data.cardsHtml;
            const freshIds = new Set(fresh.map(item => String(item.id))), votes = new Set(data.votedIds || []);
            const fragment = document.createDocumentFragment();
            for (const card of Array.from(pageTemplate.content.querySelectorAll('article.post-card[data-idea-id]'))) {
                const id = card.dataset.ideaId;
                if (!freshIds.has(id))
                    continue;
                freshIds.delete(id);
                if (data.voteStateKnown !== false)
                    knownVotes.set(id, votes.has(id));
                fragment.append(card);
            }
            _feedContainer.appendChild(fragment);
            // Keep keyboard users at the start of the newly added results.
            _feedContainer.children[previousCount]?.querySelector('.post-title-link')?.focus({ preventScroll: true });
            _currentPage = nextPage;
            _hasMore = items.length > 0 && (typeof data.hasMore === 'boolean' ? data.hasMore : items.length >= 15);
            updateResultSummary(typeof data.totalCount === 'number' ? data.totalCount : data.count);
            sfInitLocalStates();
            if (_feedLoadStatus)
                _feedLoadStatus.textContent = fresh.length ? fresh.length + ' more idea' + (fresh.length === 1 ? '' : 's') + ' loaded.' : _hasMore ? 'This page contained ideas already shown. Load more to continue.' : 'You have reached the end of these ideas.';
            if (_feedLoader) {
                _feedLoader.hidden = !_hasMore;
                _feedLoader.style.display = _hasMore ? '' : 'none';
            }
            if (_feedEndMessage) {
                _feedEndMessage.hidden = _hasMore;
                _feedEndMessage.style.display = _hasMore ? 'none' : '';
            }
            if (label)
                label.textContent = 'Load more ideas';
        }
        catch {
            if (label)
                label.textContent = 'Try loading again';
            if (_feedLoadStatus)
                _feedLoadStatus.textContent = controller.signal.aborted ? 'Loading took too long. Your current ideas are still here. Try again.' : 'Could not load more ideas. Your current ideas are still here. Try again.';
        }
        finally {
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
    if (config.dataset.highlights !== 'true' && !following && config.dataset.total === '') {
        const params = new URLSearchParams({ category: _currentCat, search: _appliedSearch });
        void sfSchoolFetch('/api/feed-total?' + params, { credentials: 'omit', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } })
            .then(response => { if (!response.ok)
            throw new Error(); return response.json(); })
            .then(data => { if (data.success && typeof data.count === 'number')
            updateResultSummary(data.count); })
            .catch(() => undefined); // A missing total never blocks ideas, saving or pagination.
    }
    Object.assign(window, { sfSetSort, sfSetTopic, sfSetLeftTopic, sfToggleTopicsChips, sfFeedSearch, sfClearSearch, sfNavigate, sfGetVotedSet, sfSaveVotedId, sfGetSavedSet, sfBookmarkPost, sfInitLocalStates, sfVoteFeed, sfSharePost, sfCloseMobileFilter, sfEscapeHtml, sfLoadMoreFeed });
})();
