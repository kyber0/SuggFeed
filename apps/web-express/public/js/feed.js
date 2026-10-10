"use strict";
// Browser source extracted from views/feed.eta.
(function () {
    let _currentSort = document.getElementById('sf-feed-config').dataset.sort || 'all';
    let _currentCat = document.getElementById('sf-feed-config').dataset.category || 'All';
    function sfSetSort(sort) {
        _currentSort = sort;
        document.querySelectorAll('.sort-tab').forEach(b => b.classList.remove('active'));
        const idx = (sort === 'latest' || sort === 'all') ? 0 : (sort === 'popular' || sort === 'top') ? 1 : 2;
        document.querySelectorAll('.sort-tab')[idx]?.classList.add('active');
        sfNavigate();
    }
    function sfSetTopic(cat) {
        _currentCat = cat;
        document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.topic-item-btn').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('.sheet-pills .sheet-pill').forEach(b => {
            if (b.textContent.trim() === cat || (cat === 'All' && b.textContent.trim() === 'All'))
                b.classList.add('active');
        });
        const label = document.getElementById('topics-tab-label');
        if (label)
            label.textContent = cat === 'All' ? 'Topics' : cat;
        sfNavigate();
    }
    function sfSetLeftTopic(cat) {
        sfSetTopic(cat);
    }
    function sfToggleTopicsChips() {
        const panel = document.getElementById('topic-chips-panel');
        if (panel) {
            panel.hidden = !panel.hidden;
            document.getElementById('topics-sort-tab')?.classList.toggle('active', !panel.hidden);
        }
    }
    let _searchDebounce;
    function sfFeedSearch(val) {
        const clearBtn = document.getElementById('feed-search-clear');
        if (clearBtn)
            clearBtn.style.display = val && val.trim() ? 'block' : 'none';
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => sfNavigate(), 350);
    }
    function sfClearSearch() {
        const input = document.getElementById('feed-search');
        if (input) {
            input.value = '';
            const clearBtn = document.getElementById('feed-search-clear');
            if (clearBtn)
                clearBtn.style.display = 'none';
            sfNavigate();
        }
    }
    function sfNavigate() {
        const q = document.getElementById('feed-search')?.value ?? '';
        const url = new URL('/feed', window.location.origin);
        url.searchParams.set('sort', _currentSort);
        if (_currentCat && _currentCat !== 'All')
            url.searchParams.set('category', _currentCat);
        if (q.trim())
            url.searchParams.set('search', q.trim());
        window.location.href = url.toString();
    }
    // Keyboard shortcut: Press / to focus search
    document.addEventListener('keydown', function (e) {
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            e.preventDefault();
            const input = document.getElementById('feed-search');
            if (input) {
                input.focus();
                input.select();
            }
        }
        else if (e.key === 'Escape' && document.activeElement?.id === 'feed-search') {
            const input = document.getElementById('feed-search');
            if (input && input.value) {
                sfClearSearch();
            }
            else {
                input?.blur();
            }
        }
    });
    // Local vote persistence
    function sfGetVotedSet() {
        try {
            return new Set(JSON.parse(localStorage.getItem('sf_voted_ideas') || '[]'));
        }
        catch {
            return new Set();
        }
    }
    function sfSaveVotedId(id) {
        try {
            const set = sfGetVotedSet();
            set.add(id);
            localStorage.setItem('sf_voted_ideas', JSON.stringify([...set]));
        }
        catch { }
    }
    // Local bookmark persistence
    function sfGetSavedSet() {
        try {
            return new Set(JSON.parse(localStorage.getItem('sf_saved_ideas') || '[]'));
        }
        catch {
            return new Set();
        }
    }
    function sfBookmarkPost(id, btn, e) {
        if (e)
            e.stopPropagation();
        try {
            const set = sfGetSavedSet();
            const isSaved = set.has(id);
            if (isSaved) {
                set.delete(id);
                btn.classList.remove('active');
                if (window.sfToast)
                    sfToast('Proposal removed from bookmarks.', 'info');
            }
            else {
                set.add(id);
                btn.classList.add('active');
                if (window.sfToast)
                    sfToast('Proposal saved to bookmarks!', 'success');
            }
            localStorage.setItem('sf_saved_ideas', JSON.stringify([...set]));
        }
        catch { }
    }
    function sfInitLocalStates() {
        const votedSet = sfGetVotedSet();
        const savedSet = sfGetSavedSet();
        document.querySelectorAll('.action-like[data-id]').forEach(btn => {
            const id = btn.getAttribute('data-id');
            if (id && votedSet.has(id))
                btn.classList.add('active');
        });
        document.querySelectorAll('.action-bookmark[data-id]').forEach(btn => {
            const id = btn.getAttribute('data-id');
            if (id && savedSet.has(id))
                btn.classList.add('active');
        });
    }
    async function sfVoteFeed(id, btn) {
        const votedSet = sfGetVotedSet();
        const countEl = btn.querySelector('.action-count');
        const prevCount = parseInt(countEl?.textContent || '0', 10);
        // Optimistic toggle
        btn.classList.add('active');
        sfSaveVotedId(id);
        try {
            const res = await fetch(`/api/vote/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'up' })
            });
            const data = await res.json();
            if (data.success) {
                if (countEl)
                    countEl.textContent = data.vote_count;
                if (data.already_voted) {
                    if (window.sfToast)
                        sfToast('You already supported this idea!', 'info');
                }
                else {
                    if (window.sfToast)
                        sfToast('Support recorded! Thank you for voting.', 'success');
                }
            }
            else {
                if (window.sfToast)
                    sfToast(data.error || 'Could not record vote.', 'error');
            }
        }
        catch {
            if (countEl)
                countEl.textContent = String(prevCount);
            if (window.sfToast)
                sfToast('Network error while voting.', 'error');
        }
    }
    function sfSharePost(id, e, btn) {
        if (e)
            e.stopPropagation();
        const url = window.location.origin + '/idea/' + id;
        if (navigator.share) {
            navigator.share({ title: 'SuggFeed Proposal', url }).catch(() => { });
        }
        else {
            navigator.clipboard.writeText(url).then(() => {
                if (btn) {
                    const label = btn.querySelector('.action-label');
                    if (label) {
                        const original = label.textContent;
                        label.textContent = 'Copied!';
                        setTimeout(() => { label.textContent = original; }, 2000);
                    }
                }
                if (window.sfToast)
                    sfToast('Proposal link copied to clipboard!', 'success');
            });
        }
    }
    // Mobile filter dialog
    document.getElementById('mobile-filter-btn')?.addEventListener('click', function () {
        document.getElementById('mobile-filter-backdrop').hidden = false;
    });
    function sfCloseMobileFilter() {
        document.getElementById('mobile-filter-backdrop').hidden = true;
    }
    // Delegated click fallback for post cards
    document.addEventListener('click', function (e) {
        const target = e.target;
        if (!(target instanceof Element))
            return;
        const card = target.closest('.post-card');
        if (!card)
            return;
        if (target.closest('.post-footer') || target.closest('.post-media-container') || target.closest('button') || target.closest('a')) {
            return;
        }
        const ideaId = card.getAttribute('data-idea-id');
        if (ideaId && typeof sfOpenIdeaDetail === 'function') {
            e.preventDefault();
            sfOpenIdeaDetail(ideaId);
        }
    });
    // ── Lazy Loading / Infinite Scroll ──
    let _currentPage = Number(document.getElementById('sf-feed-config').dataset.page || 1);
    let _hasMore = document.getElementById('sf-feed-config').dataset.hasMore === 'true';
    let _isLoading = false;
    const _feedContainer = document.getElementById('feed-posts-container');
    const _feedLoader = document.getElementById('feed-loader');
    const _feedEndMessage = document.getElementById('feed-end-message');
    function sfEscapeHtml(str) {
        if (!str)
            return '';
        return str.replace(/[&<>"']/g, function (m) {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#039;';
                default: return m;
            }
        });
    }
    function sfCreatePostCardHtml(item) {
        const catName = item.category || (item.categories && item.categories.name) || 'Other';
        const catColors = {
            Facilities: { bg: 'rgba(59,130,246,0.12)', text: '#2563EB', border: 'rgba(59,130,246,0.25)', dot: '#3B82F6' },
            Learning: { bg: 'rgba(16,185,129,0.12)', text: '#059669', border: 'rgba(16,185,129,0.25)', dot: '#10B981' },
            Safety: { bg: 'rgba(239,68,68,0.12)', text: '#DC2626', border: 'rgba(239,68,68,0.25)', dot: '#EF4444' },
            'Student life': { bg: 'rgba(245,158,11,0.12)', text: '#D97706', border: 'rgba(245,158,11,0.25)', dot: '#F59E0B' },
            Other: { bg: 'rgba(100,116,139,0.12)', text: '#64748B', border: 'rgba(100,116,139,0.25)', dot: '#94A3B8' }
        };
        const cat = catColors[catName] || catColors.Other;
        const statusConfig = {
            pending: { color: '#F59E0B', label: 'Pending Review', dot: '#F59E0B' },
            approved: { color: '#10B981', label: 'Approved', dot: '#10B981' },
            in_progress: { color: '#3B82F6', label: 'In Progress', dot: '#3B82F6' },
            resolved: { color: '#0D9488', label: 'Resolved', dot: '#0D9488' }
        };
        const statusInfo = statusConfig[item.status] || statusConfig.pending;
        const isAnon = !item.author || !item.author.display_name;
        const authorName = isAnon ? 'Anonymous' : item.author.display_name;
        const authorHandle = isAnon ? '@anon' : '@' + item.author.display_name.toLowerCase().replace(/\s+/g, '');
        const voteCount = item.vote_count || 0;
        const commentCount = item.comment_count || 0;
        let timeStr = 'just now';
        if (item.created_at) {
            const d = new Date(item.created_at);
            const diff = Math.floor((Date.now() - d.getTime()) / 1000);
            if (diff < 60)
                timeStr = 'just now';
            else if (diff < 3600)
                timeStr = Math.floor(diff / 60) + 'm';
            else if (diff < 86400)
                timeStr = Math.floor(diff / 3600) + 'h';
            else if (diff < 604800)
                timeStr = Math.floor(diff / 86400) + 'd';
            else
                timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        const safeTitle = sfEscapeHtml(item.title);
        const safeDesc = sfEscapeHtml(item.description || '');
        const trendingBadge = voteCount >= 50 ? `
      <span class="post-trending-badge" title="High campus engagement">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
        Trending
      </span>` : '';
        const attachmentsHtml = (item.attachments && item.attachments.length > 0) ? `
      <div class="post-media-container" data-sf-click="stop">
        <div class="post-attachment-pill" data-sf-click="open-detail" data-idea-id="${item.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <span>${item.attachments.length} attachment${item.attachments.length > 1 ? 's' : ''}</span>
          <span class="attachment-cta">View files →</span>
        </div>
      </div>` : '';
        const isVoted = sfGetVotedSet().has(item.id) ? ' active' : '';
        const isSaved = sfGetSavedSet().has(item.id) ? ' active' : '';
        return `
      <article
        class="post-card"
        data-idea-id="${item.id}"
        data-sf-click="open-detail"
        role="article"
        aria-label="Proposal: ${safeTitle}"
        tabindex="0"
        data-sf-keydown="open-detail-key"
      >
        <div class="post-header">
          <div class="post-avatar" style="background:${isAnon ? 'linear-gradient(135deg,#64748B 0%,#475569 100%)' : 'linear-gradient(135deg,#0B3857 0%,#2563EB 100%)'}">
            ${isAnon ? '?' : authorName[0].toUpperCase()}
          </div>
          <div class="post-author-meta">
            <div class="post-author-row">
              <span class="post-author-name">${sfEscapeHtml(authorName)}</span>
              <span class="post-author-handle">${sfEscapeHtml(authorHandle)}</span>
              <span class="post-dot">&middot;</span>
              <time class="post-timestamp">${timeStr}</time>
              ${trendingBadge}
            </div>
            <div class="post-badges-row">
              <span class="post-badge-category cat-${catName.toLowerCase().replace(/\s+/g, '-')}" style="background-color:${cat.bg};color:${cat.text};border-color:${cat.border}">
                <span class="badge-dot" style="background-color:${cat.dot}"></span>
                ${catName}
              </span>
              <span class="post-badge-status status-${item.status}" style="background-color:${statusInfo.color}15;color:${statusInfo.color};border-color:${statusInfo.color}35">
                <span class="badge-dot" style="background-color:${statusInfo.dot}"></span>
                ${statusInfo.label}
              </span>
            </div>
          </div>
        </div>
        <div class="post-content">
          <h3 class="post-title">${safeTitle}</h3>
          <p class="post-body">${safeDesc}</p>
        </div>
        ${attachmentsHtml}
        <div class="post-footer" data-sf-click="stop">
          <button type="button" class="action-btn action-like${isVoted}" data-id="${item.id}" data-sf-click="vote-feed" aria-label="Support proposal" title="Support this proposal">
            <svg class="heart-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span class="action-count">${voteCount}</span>
            <span class="action-label">Support</span>
          </button>
          <button type="button" class="action-btn action-comment" data-sf-click="comment-feed" data-idea-id="${item.id}" aria-label="View ${commentCount} comments" title="Open discussion">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="action-count">${commentCount}</span>
            <span class="action-label">Comments</span>
          </button>
          <button type="button" class="action-btn action-bookmark${isSaved}" data-id="${item.id}" data-sf-click="bookmark-feed" aria-label="Bookmark proposal" title="Save to bookmarks">
            <svg class="bookmark-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
            <span class="action-label">Save</span>
          </button>
          <button type="button" class="action-btn action-share" data-sf-click="share-feed" data-id="${item.id}" aria-label="Share proposal" title="Copy shareable link">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span class="action-label">Share</span>
          </button>
        </div>
      </article>`;
    }
    async function sfLoadMoreFeed() {
        if (_isLoading || !_hasMore)
            return;
        _isLoading = true;
        if (_feedLoader) {
            _feedLoader.disabled = true;
            _feedLoader.setAttribute('aria-busy', 'true');
            _feedLoader.style.display = 'flex';
            _feedLoader.querySelector('.feed-loading-text').textContent = 'Loading more ideas…';
        }
        try {
            const nextPage = _currentPage + 1;
            const q = (document.getElementById('feed-search')?.value || '').trim();
            const params = new URLSearchParams({
                page: String(nextPage),
                sort: _currentSort,
                category: _currentCat,
                search: q,
            });
            const res = await fetch('/api/feed?' + params.toString());
            if (!res.ok)
                throw new Error('Failed to load feed');
            const data = await res.json();
            const items = (data && (data.feed || data.data)) || [];
            if (items.length > 0) {
                _currentPage = nextPage;
                _hasMore = typeof data.hasMore === 'boolean' ? data.hasMore : (items.length >= 15);
                if (_feedContainer) {
                    const fragment = document.createDocumentFragment();
                    items.forEach(item => {
                        const temp = document.createElement('div');
                        temp.innerHTML = sfCreatePostCardHtml(item);
                        if (temp.firstElementChild) {
                            fragment.appendChild(temp.firstElementChild);
                        }
                    });
                    _feedContainer.appendChild(fragment);
                }
            }
            else {
                _hasMore = false;
            }
            if (!_hasMore) {
                if (_feedLoader)
                    _feedLoader.style.display = 'none';
                if (_feedEndMessage)
                    _feedEndMessage.style.display = 'flex';
            }
        }
        catch (err) {
            console.error('Error loading more ideas:', err);
            if (_feedLoader)
                _feedLoader.querySelector('.feed-loading-text').textContent = 'Could not load ideas. Select to retry.';
        }
        finally {
            _isLoading = false;
            if (_feedLoader) {
                _feedLoader.disabled = false;
                _feedLoader.removeAttribute('aria-busy');
                if (_hasMore && _feedLoader.querySelector('.feed-loading-text').textContent === 'Loading more ideas…') {
                    _feedLoader.querySelector('.feed-loading-text').textContent = 'Load more ideas';
                }
            }
            if (!_hasMore && _feedLoader) {
                _feedLoader.style.display = 'none';
            }
        }
    }
    if ('IntersectionObserver' in window && _feedLoader) {
        const _feedObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !_isLoading && _hasMore) {
                    sfLoadMoreFeed();
                }
            });
        }, { rootMargin: '200px 0px' });
        _feedObserver.observe(_feedLoader);
    }
    // Restore states
    document.addEventListener('DOMContentLoaded', sfInitLocalStates);
    sfInitLocalStates();
    Object.assign(window, { sfSetSort, sfSetTopic, sfSetLeftTopic, sfToggleTopicsChips, sfFeedSearch, sfClearSearch, sfNavigate, sfGetVotedSet, sfSaveVotedId, sfGetSavedSet, sfBookmarkPost, sfInitLocalStates, sfVoteFeed, sfSharePost, sfCloseMobileFilter, sfEscapeHtml, sfCreatePostCardHtml, sfLoadMoreFeed });
})();
