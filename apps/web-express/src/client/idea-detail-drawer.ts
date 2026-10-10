// Browser source extracted from views/partials/idea-detail-drawer.eta.
(function () {
let sfCurrentIdea = null;
  let sfDrawerActiveReplyId = null;
  let sfDrawerOriginalPath = null;
  let sfTouchStartY = 0;

  const SF_CATEGORY_THEMES = {
    Facilities:    { bg: "rgba(11, 56, 87, 0.08)", text: "var(--navy)", border: "rgba(11, 56, 87, 0.2)" },
    Learning:      { bg: "rgba(16, 185, 129, 0.08)", text: "#10b981", border: "rgba(16, 185, 129, 0.2)" },
    Safety:        { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
    "Student life":{ bg: "rgba(245, 158, 11, 0.08)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.2)" },
    Other:         { bg: "rgba(100, 116, 139, 0.08)", text: "#64748b", border: "rgba(100, 116, 139, 0.2)" }
  };

  const SF_STATUS_CONFIG = {
    resolved: {
      label: "Resolved",
      dotColor: "#0d9488",
      badgeBg: "rgba(13, 148, 136, 0.12)",
      badgeText: "#0d9488",
      bannerTitle: "Resolution Completed",
      bannerDesc: "This suggestion has been addressed and marked as completed by campus administration.",
      iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
    },
    in_progress: {
      label: "In Progress",
      dotColor: "var(--navy)",
      badgeBg: "rgba(11, 56, 87, 0.1)",
      badgeText: "var(--navy)",
      bannerTitle: "Under Active Development",
      bannerDesc: "Campus teams are currently working on planning and implementing this proposal.",
      iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    },
    approved: {
      label: "Approved",
      dotColor: "#10b981",
      badgeBg: "rgba(16, 185, 129, 0.12)",
      badgeText: "#10b981",
      bannerTitle: "Proposal Approved",
      bannerDesc: "This proposal has been accepted and scheduled for upcoming campus improvements.",
      iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>'
    },
    pending: {
      label: "Pending Review",
      dotColor: "#f59e0b",
      badgeBg: "rgba(245, 158, 11, 0.12)",
      badgeText: "#f59e0b",
      bannerTitle: "Pending Staff Review",
      bannerDesc: "This proposal has been submitted and is currently being reviewed by campus staff before being published to the community feed.",
      iconSvg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    }
  };

  const SF_LIFECYCLE_ORDER = ["pending", "approved", "in_progress", "resolved"];

  async function sfOpenIdeaDetail(ideaId, initialTab = 'details') {
    if (!sfDrawerOriginalPath) {
      sfDrawerOriginalPath = window.location.pathname + window.location.search;
    }

    const overlay = (document.getElementById('idea-drawer-overlay') as HTMLElement);
    const drawer = (document.getElementById('idea-detail-drawer') as HTMLElement);
    const skeleton = (document.getElementById('drawer-skeleton') as HTMLElement);
    const columns = (document.getElementById('drawer-columns') as HTMLElement);

    overlay.removeAttribute('hidden');
    drawer.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';

    // Update URL history without full reload
    history.pushState({ ideaDrawerId: ideaId }, '', `/idea/${ideaId}`);

    // Show skeleton
    skeleton.style.display = 'block';
    columns.style.display = 'none';

    sfSetDrawerMobileTab(initialTab);

    try {
      const res = await fetch(`/api/idea/${ideaId}`);
      if (!res.ok) throw new Error('Idea not found');
      const data = await res.json();
      if (!data.success || !data.submission) throw new Error(data.error || 'Failed to load idea');

      sfCurrentIdea = data.submission;
      sfPopulateDrawerUI(data.submission, data.comments || []);

      skeleton.style.display = 'none';
      columns.style.display = 'flex';
    } catch (err) {
      if (window.sfToast) sfToast(err.message || 'Failed to load idea details', 'error');
      sfCloseIdeaDrawer();
    }
  }

  function sfPopulateDrawerUI(idea, comments) {
    const catName = idea.category || (idea.categories && idea.categories.name) || 'Other';
    const catTheme = SF_CATEGORY_THEMES[catName] || SF_CATEGORY_THEMES.Other;
    const stConfig = SF_STATUS_CONFIG[idea.status] || SF_STATUS_CONFIG.pending;

    // Badges
    const catBadge = (document.getElementById('drawer-cat-badge') as HTMLElement);
    catBadge.style.background = catTheme.bg;
    catBadge.style.color = catTheme.text;
    catBadge.style.borderColor = catTheme.border;
    (document.getElementById('drawer-cat-name') as HTMLElement).textContent = catName;

    const statusPill = (document.getElementById('drawer-status-pill') as HTMLElement);
    statusPill.style.background = stConfig.badgeBg;
    statusPill.style.color = stConfig.badgeText;
    (document.getElementById('drawer-status-dot') as HTMLElement).style.background = stConfig.dotColor;
    (document.getElementById('drawer-status-label') as HTMLElement).textContent = stConfig.label;

    // Permalink
    (document.getElementById('drawer-permalink') as HTMLAnchorElement).href = `/idea/${idea.id}`;

    // Author & Date
    const isAnon = !idea.author || (!idea.author.display_name && !idea.author.full_name);
    const authorName = isAnon ? "Anonymous Student" : (idea.author.display_name || idea.author.full_name);
    const authorAvatar = (document.getElementById('drawer-author-avatar') as HTMLElement);
    if (isAnon) {
      authorAvatar.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
    } else {
      authorAvatar.textContent = authorName[0].toUpperCase();
    }
    (document.getElementById('drawer-author-name') as HTMLElement).textContent = authorName;

    const d = new Date(idea.created_at);
    (document.getElementById('drawer-date-text') as HTMLElement).textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

    // Title & Description
    (document.getElementById('drawer-title') as HTMLElement).textContent = idea.title;
    (document.getElementById('drawer-description') as HTMLElement).textContent = idea.description;

    // Status Banner
    const banner = (document.getElementById('drawer-status-banner') as HTMLElement);
    banner.className = `detail-status-banner ${idea.status || 'pending'}`;
    (document.getElementById('drawer-banner-icon-wrap') as HTMLElement).innerHTML = stConfig.iconSvg;
    (document.getElementById('drawer-banner-title') as HTMLElement).textContent = stConfig.bannerTitle;
    (document.getElementById('drawer-banner-desc') as HTMLElement).textContent = idea.staff_note || stConfig.bannerDesc;

    // Stepper
    const currentIdx = SF_LIFECYCLE_ORDER.indexOf(idea.status || 'pending');
    SF_LIFECYCLE_ORDER.forEach((key, idx) => {
      const stepEl = (document.getElementById(`drawer-step-${key}`) as HTMLElement);
      const dotEl = (document.getElementById(`drawer-dot-${key}`) as HTMLElement);
      if (!stepEl || !dotEl) return;

      const isDone = idx < currentIdx;
      const isActive = idx === currentIdx;

      stepEl.classList.toggle('done', isDone);
      stepEl.classList.toggle('active', isActive);

      if (isDone) {
        dotEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (isActive) {
        dotEl.innerHTML = '<span style="width:8px; height:8px; border-radius:50%; background:currentColor;"></span>';
      } else {
        dotEl.textContent = String(idx + 1);
      }
    });

    // Support Hero Card
    const voteBtn = (document.getElementById('drawer-vote-btn') as HTMLButtonElement);
    const voteCount = idea.vote_count ?? 0;
    (document.getElementById('drawer-vote-count') as HTMLElement).textContent = voteCount;
    (document.getElementById('drawer-vote-summary') as HTMLElement).textContent = voteCount;

    const votedIds = JSON.parse(localStorage.getItem('sf_voted_ideas') || '[]');
    const hasVoted = votedIds.includes(idea.id);

    if (idea.status === 'pending') {
      voteBtn.classList.remove('voted');
      voteBtn.disabled = true;
      voteBtn.title = "Voting opens once approved by staff";
      (document.getElementById('drawer-vote-label') as HTMLElement).textContent = "Pending Review";
      (document.getElementById('drawer-vote-icon') as unknown as SVGElement).innerHTML = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
    } else if (hasVoted) {
      voteBtn.classList.add('voted');
      voteBtn.disabled = false;
      (document.getElementById('drawer-vote-label') as HTMLElement).textContent = "Supported";
      (document.getElementById('drawer-vote-icon') as unknown as SVGElement).innerHTML = '<polyline points="20 6 9 17 4 12"/>';
    } else {
      voteBtn.classList.remove('voted');
      voteBtn.disabled = false;
      (document.getElementById('drawer-vote-label') as HTMLElement).textContent = "Support this idea";
      (document.getElementById('drawer-vote-icon') as unknown as SVGElement).innerHTML = '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>';
    }

    // Context Header
    (document.getElementById('drawer-context-tag') as HTMLElement).textContent = catName;
    (document.getElementById('drawer-context-title') as HTMLElement).textContent = idea.title;

    // Comments & Discussion
    const commentCount = comments.length;
    (document.getElementById('drawer-mob-comment-count') as HTMLElement).textContent = commentCount;
    (document.getElementById('drawer-jump-comment-count') as HTMLElement).textContent = commentCount;
    (document.getElementById('drawer-comments-header-count') as HTMLElement).textContent = commentCount;

    // Pending discussion lock
    const pendingNotice = (document.getElementById('drawer-pending-notice') as HTMLElement);
    const composer = (document.getElementById('drawer-comment-composer') as HTMLFormElement);
    if (idea.status === 'pending') {
      pendingNotice.style.display = 'flex';
      composer.style.display = 'none';
    } else {
      pendingNotice.style.display = 'none';
      composer.style.display = 'flex';
    }

    sfRenderDrawerComments(comments);
  }

  function sfRenderDrawerComments(comments) {
    const list = (document.getElementById('drawer-comments-list') as HTMLElement);
    list.innerHTML = '';

    if (!comments || comments.length === 0) {
      list.innerHTML = `
        <div class="comment-empty-state" id="drawer-comment-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="comment-empty-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p class="comment-empty-text">No comments yet. Be the first to share your constructive perspective!</p>
        </div>
      `;
      return;
    }

    // Build thread tree: roots and replies
    const roots = comments.filter(c => !c.parent_id);
    const repliesMap = {};
    comments.filter(c => c.parent_id).forEach(c => {
      repliesMap[c.parent_id] = repliesMap[c.parent_id] || [];
      repliesMap[c.parent_id].push(c);
    });

    roots.forEach(c => {
      const card = sfCreateCommentCardEl(c);
      list.appendChild(card);

      const replies = repliesMap[c.id] || [];
      if (replies.length > 0) {
        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'comment-replies-thread';
        repliesContainer.style.cssText = 'margin-left: 24px; padding-left: 12px; border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: 8px; margin-top: 6px;';
        replies.forEach(rc => {
          repliesContainer.appendChild(sfCreateCommentCardEl(rc, true));
        });
        list.appendChild(repliesContainer);
      }
    });
  }

  // Avatar colours — cycle through a palette so different users get different colours
  const SF_AVATAR_COLORS = [
    ['#0b3857','#1e5a8a'],['#0d9488','#0a7a6e'],['#7c3aed','#6026c0'],
    ['#d97706','#b45309'],['#be185d','#9d174d'],['#0369a1','#0284c7']
  ];
  function sfAvatarGrad(name) {
    const idx = (name.charCodeAt(0) || 0) % SF_AVATAR_COLORS.length;
    const [a, b] = SF_AVATAR_COLORS[idx];
    return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
  }
  function sfRelTime(dateStr) {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function sfCreateCommentCardEl(c, isReply = false) {
    const card = document.createElement('div');
    card.className = `comment-card${isReply ? ' comment-reply-card' : ''}`;
    card.id = `drawer-comment-${c.id}`;
    card.style.cssText = 'animation: commentSlideIn 200ms cubic-bezier(.22,.85,.4,1) both;';

    const author = c.display_name || (c.author && (c.author.display_name || c.author.full_name)) || 'Student';
    const isStaff = c.author && (c.author.role === 'staff' || c.author.role === 'admin');
    const grad = isStaff
      ? 'linear-gradient(135deg, #7c3aed 0%, #6026c0 100%)'
      : sfAvatarGrad(author);

    card.innerHTML = `
      <div class="comment-card-header">
        <div class="comment-avatar" style="background:${grad}">${author[0].toUpperCase()}</div>
        <strong class="comment-author-name">${author}</strong>
        ${isStaff ? '<span class="comment-staff-tag">STAFF</span>' : ''}
        <span class="comment-date">${sfRelTime(c.created_at)}</span>
      </div>
      <div class="comment-body">${(c.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div class="comment-actions">
        <button type="button" class="comment-reply-btn" data-sf-click="reply-drawer" data-reply-id="${c.id}" data-reply-author="${sfEscapeAttribute(author)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
          Reply
        </button>
      </div>
    `;
    return card;
  }

  function sfCloseIdeaDrawer() {
    const overlay = (document.getElementById('idea-drawer-overlay') as HTMLElement);
    const drawer = (document.getElementById('idea-detail-drawer') as HTMLElement);
    if (overlay) overlay.setAttribute('hidden', '');
    if (drawer) drawer.setAttribute('hidden', '');
    document.body.style.overflow = '';

    // Reset composer state
    const composer = (document.getElementById('drawer-comment-composer') as HTMLFormElement);
    if (composer) composer.classList.remove('expanded');

    sfDrawerActiveReplyId = null;
    const banner = (document.getElementById('drawer-replying-banner') as HTMLElement);
    if (banner) banner.setAttribute('hidden', '');

    // Restore URL
    if (window.location.pathname.startsWith('/idea/')) {
      const target = sfDrawerOriginalPath || '/feed';
      sfDrawerOriginalPath = null;
      history.pushState(null, '', target);
    }
  }

  function sfSetDrawerMobileTab(tab) {
    const isComments = tab === 'comments';
    const tabDetails = (document.getElementById('drawer-mob-tab-details') as HTMLButtonElement);
    const tabComments = (document.getElementById('drawer-mob-tab-comments') as HTMLButtonElement);
    const cols = (document.getElementById('drawer-columns') as HTMLElement);

    if (tabDetails) {
      tabDetails.classList.toggle('active', !isComments);
      tabDetails.setAttribute('aria-selected', String(!isComments));
    }
    if (tabComments) {
      tabComments.classList.toggle('active', isComments);
      tabComments.setAttribute('aria-selected', String(isComments));
    }
    if (cols) {
      cols.setAttribute('data-mobile-tab', tab);
    }
  }

  function sfDrawerShare() {
    if (!sfCurrentIdea) return;
    const url = `${window.location.origin}/idea/${sfCurrentIdea.id}`;
    navigator.clipboard.writeText(url);

    const btn = (document.getElementById('drawer-share-btn') as HTMLButtonElement);
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => { btn.innerHTML = origHtml; }, 2000);

    if (window.sfToast) sfToast('Link copied to clipboard!', 'success');
  }

  async function sfDrawerVote() {
    if (!sfCurrentIdea) return;
    if (sfCurrentIdea.status === 'pending') {
      if (window.sfToast) sfToast('This idea is pending staff review. Voting opens once approved.', 'info');
      return;
    }

    const btn = (document.getElementById('drawer-vote-btn') as HTMLButtonElement);
    if (btn.classList.contains('voted')) return;

    try {
      const res = await fetch(`/api/vote/${sfCurrentIdea.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'up' })
      });
      const data = await res.json();
      if (data.success) {
        btn.classList.add('voted');
        (document.getElementById('drawer-vote-count') as HTMLElement).textContent = data.vote_count;
        (document.getElementById('drawer-vote-summary') as HTMLElement).textContent = data.vote_count;
        (document.getElementById('drawer-vote-label') as HTMLElement).textContent = 'Supported';
        (document.getElementById('drawer-vote-icon') as unknown as SVGElement).innerHTML = '<polyline points="20 6 9 17 4 12"/>';

        // Remember vote locally
        const votedIds = JSON.parse(localStorage.getItem('sf_voted_ideas') || '[]');
        if (!votedIds.includes(sfCurrentIdea.id)) {
          votedIds.push(sfCurrentIdea.id);
          localStorage.setItem('sf_voted_ideas', JSON.stringify(votedIds));
        }

        // Also reflect on feed cards if present
        const feedCardVote = document.querySelector<HTMLElement>(`[data-idea-id="${sfCurrentIdea.id}"] .action-like .action-count`);
        if (feedCardVote) feedCardVote.textContent = data.vote_count;

        if (window.sfToast) sfToast('Vote recorded! Thank you.', 'success');
      }
    } catch {
      if (window.sfToast) sfToast('Could not record vote.', 'error');
    }
  }

  function sfDrawerReplyTo(commentId, author) {
    sfDrawerActiveReplyId = commentId;
    (document.getElementById('drawer-replying-author') as HTMLElement).textContent = `@${author}`;
    (document.getElementById('drawer-replying-banner') as HTMLElement).removeAttribute('hidden');
    const input = (document.getElementById('drawer-comment-input') as HTMLTextAreaElement);
    input.placeholder = `Reply to @${author}…`;
    input.focus();
  }

  function sfCancelDrawerReply() {
    sfDrawerActiveReplyId = null;
    (document.getElementById('drawer-replying-banner') as HTMLElement).setAttribute('hidden', '');
    const input = (document.getElementById('drawer-comment-input') as HTMLTextAreaElement);
    input.placeholder = 'Add a constructive thought…';
  }

  function sfCollapseDrawerComposer() {
    const composer = (document.getElementById('drawer-comment-composer') as HTMLFormElement);
    const input = (document.getElementById('drawer-comment-input') as HTMLTextAreaElement);
    if (composer) composer.classList.remove('expanded');
    if (input) { input.value = ''; input.blur(); }
    sfCancelDrawerReply();
    sfDrawerCommentInputChanged(input);
  }

  function sfDrawerCommentInputChanged(textarea) {
    const len = textarea.value.length;
    const countSpan = (document.getElementById('drawer-char-count') as HTMLElement);
    if (countSpan) {
      countSpan.textContent = `${len}/500${len < 10 ? ' · Min 10 chars' : ''}`;
    }
  }

  async function sfSubmitDrawerComment(e) {
    e.preventDefault();
    if (!sfCurrentIdea) return;

    const input = (document.getElementById('drawer-comment-input') as HTMLTextAreaElement);
    const body = input.value.trim();
    if (body.length < 10) {
      if (window.sfToast) sfToast('Comment must be at least 10 characters.', 'error');
      return;
    }

    const btn = (document.getElementById('drawer-comment-submit-btn') as HTMLButtonElement);
    btn.disabled = true;
    btn.innerHTML = '<span>Posting…</span>';

    try {
      const res = await fetch(`/api/comments/${sfCurrentIdea.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parentId: sfDrawerActiveReplyId })
      });
      const data = await res.json();
      if (!data.success && !data.data) {
        throw new Error(data.error || 'Failed to post comment');
      }

      const empty = (document.getElementById('drawer-comment-empty') as HTMLElement);
      if (empty) empty.remove();

      const newComment = data.data || {
        id: 'new-' + Date.now(),
        body,
        display_name: 'You',
        created_at: new Date().toISOString(),
        parent_id: sfDrawerActiveReplyId
      };

      const card = sfCreateCommentCardEl(newComment, !!sfDrawerActiveReplyId);
      const list = (document.getElementById('drawer-comments-list') as HTMLElement);
      list.appendChild(card);

      input.value = '';
      sfCancelDrawerReply();
      sfDrawerCommentInputChanged(input);

      // Increment counts
      const mobCount = (document.getElementById('drawer-mob-comment-count') as HTMLElement);
      const headCount = (document.getElementById('drawer-comments-header-count') as HTMLElement);
      const jumpCount = (document.getElementById('drawer-jump-comment-count') as HTMLElement);
      const nextCount = Number(headCount.textContent || 0) + 1;
      if (mobCount) mobCount.textContent = String(nextCount);
      if (headCount) headCount.textContent = String(nextCount);
      if (jumpCount) jumpCount.textContent = String(nextCount);

      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (window.sfToast) sfToast('Comment posted successfully!', 'success');
    } catch (err) {
      if (window.sfToast) sfToast(err.message || 'Could not post comment.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Post</span>';
    }
  }

  // Keyboard and History Listeners
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = (document.getElementById('idea-detail-drawer') as HTMLElement);
      if (drawer && !drawer.hasAttribute('hidden')) {
        sfCloseIdeaDrawer();
      }
    }
  });

  window.addEventListener('popstate', (e) => {
    const drawer = (document.getElementById('idea-detail-drawer') as HTMLElement);
    if (drawer && !drawer.hasAttribute('hidden')) {
      sfCloseIdeaDrawer();
    }
  });

  // Mobile Touch Swipe Down to Dismiss
  document.addEventListener('DOMContentLoaded', () => {
    const handle = (document.getElementById('drawer-drag-handle') as HTMLElement);
    const drawer = (document.getElementById('idea-detail-drawer') as HTMLElement);
    if (!handle || !drawer) return;

    handle.addEventListener('touchstart', (e) => {
      sfTouchStartY = e.touches[0].clientY;
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      if (touchEndY - sfTouchStartY > 70) {
        sfCloseIdeaDrawer();
      }
    }, { passive: true });
  });
Object.assign(window, { sfOpenIdeaDetail, sfPopulateDrawerUI, sfRenderDrawerComments, sfAvatarGrad, sfRelTime, sfCreateCommentCardEl, sfCloseIdeaDrawer, sfSetDrawerMobileTab, sfDrawerShare, sfDrawerVote, sfDrawerReplyTo, sfCancelDrawerReply, sfCollapseDrawerComposer, sfDrawerCommentInputChanged, sfSubmitDrawerComment });
})();
