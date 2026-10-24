// Browser source extracted from views/idea.eta.
(function () {
let activeReplyingToId = null;

  const SF_AVATAR_COLORS = [
    ['#0b3857','#1e5a8a'],['#0d9488','#0a7a6e'],['#7c3aed','#6026c0'],
    ['#d97706','#b45309'],['#be185d','#9d174d'],['#0369a1','#0284c7']
  ];
  function sfAvatarGrad(name) {
    const idx = ((name && name.charCodeAt(0)) || 0) % SF_AVATAR_COLORS.length;
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

  document.addEventListener('DOMContentLoaded', () => {
    const votedIds = JSON.parse(localStorage.getItem(sfSchoolKey('sf_voted_ideas')) || '[]');
    if (votedIds.includes((document.getElementById('sf-idea-config') as HTMLElement).dataset.id)) {
      const btn = (document.getElementById('detail-vote-btn') as HTMLButtonElement);
      if (btn && (document.getElementById('sf-idea-config') as HTMLElement).dataset.status !== 'pending') {
        btn.classList.add('voted');btn.setAttribute('aria-pressed','true');btn.title='Undo your support';
        const textEl = (document.getElementById('detail-vote-text') as HTMLElement);
        if (textEl) textEl.textContent = 'Supported';
        const iconEl = (document.getElementById('detail-vote-icon') as unknown as SVGElement);
        if (iconEl) iconEl.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
      }
    }
  });

  function sfSetMobileDetailTab(tab) {
    const isComments = tab === 'comments';
    const tabDetails = (document.getElementById('mob-tab-details') as HTMLButtonElement);
    const tabComments = (document.getElementById('mob-tab-comments') as HTMLButtonElement);
    const cols = (document.getElementById('detail-columns') as HTMLElement);

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

  async function sfShareIdea() {
    const url = window.location.href;
    try{await navigator.clipboard.writeText(url);}catch{window.sfToast?.('The link could not be copied.','error');return;}
    const btn = (document.getElementById('share-btn') as HTMLButtonElement);
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
    if (window.sfToast) sfToast('Link copied to clipboard!', 'success');
    await window.sfRecordShare(document.getElementById('sf-idea-config')!.dataset.id);
  }

  function sfCommentInputChanged(textarea) {
    const len = textarea.value.length;
    const countSpan = (document.getElementById('comment-char-count') as HTMLElement);
    if (countSpan) {
      countSpan.textContent = `${len}/500${len < 10 ? ' · Min 10 chars' : ''}`;
    }
  }

  function sfReplyTo(commentId, author) {
    activeReplyingToId = commentId;
    (document.getElementById('replying-author') as HTMLElement).textContent = `@${author}`;
    (document.getElementById('replying-banner') as HTMLElement).removeAttribute('hidden');
    const input = (document.getElementById('comment-input') as HTMLTextAreaElement);
    input.placeholder = `Reply to @${author}…`;
    input.focus();
  }

  function sfCancelReply() {
    activeReplyingToId = null;
    const banner = (document.getElementById('replying-banner') as HTMLElement);
    if (banner) banner.setAttribute('hidden', '');
    const input = (document.getElementById('comment-input') as HTMLTextAreaElement);
    if (input) input.placeholder = 'Add a constructive thought…';
  }

  function sfCollapseComposer() {
    const composer = (document.getElementById('comment-composer') as HTMLFormElement);
    const input = (document.getElementById('comment-input') as HTMLTextAreaElement);
    if (composer) composer.classList.remove('expanded');
    if (input) { input.value = ''; input.blur(); }
    sfCancelReply();
    sfCommentInputChanged(input);
  }

  async function sfVoteDetail(id) {
    const btn=document.getElementById('detail-vote-btn') as HTMLButtonElement;
    if(!btn || btn.disabled)return;
    const voted=!btn.classList.contains('voted');btn.disabled=true;btn.setAttribute('aria-busy','true');
    const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),15000);
    try {
      const response=await sfSchoolFetch('/api/vote/'+encodeURIComponent(id),{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:voted?'up':'unvote'})});
      const data=await response.json();if(!response.ok||!data.success||typeof data.voted!=='boolean'||typeof data.vote_count!=='number')throw new Error();
      sfRememberVote(id,data.voted,data.vote_count);
      btn.classList.toggle('voted',data.voted);btn.setAttribute('aria-pressed',String(data.voted));btn.title=data.voted?'Undo your support':'Support this idea';
      for(const name of ['detail-vote-count','detail-vote-summary']){const node=document.getElementById(name);if(node)node.textContent=String(data.vote_count);}
      const label=document.getElementById('detail-vote-text');if(label)label.textContent=data.voted?'Supported':'Support this idea';
      const icon=document.getElementById('detail-vote-icon');if(icon)icon.innerHTML=data.voted?'<polyline points="20 6 9 17 4 12"/>':'<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>';
      window.sfToast?.(data.voted?'Your support has been recorded.':'Your support has been removed.','success');
    }catch{window.sfToast?.('Could not update your support. Try again to confirm its status.','error');}
    finally{clearTimeout(timer);{btn.disabled=false;btn.removeAttribute('aria-busy');}}
  }

  function sfCreateStandaloneCommentCardEl(c, isReply = false) {
    const card = document.createElement('div');
    card.className = `comment-card${isReply ? ' comment-reply-card' : ''}`;
    card.id = `comment-${c.id}`;
    card.style.cssText = 'animation: commentSlideIn 200ms cubic-bezier(.22,.85,.4,1) both;';

    const author = c.display_name || (c.author && (c.author.display_name || c.author.full_name)) || 'Student';
    const isStaff = c.author && (c.author.role === 'staff' || c.author.role === 'admin');
    const grad = isStaff
      ? 'linear-gradient(135deg, #7c3aed 0%, #6026c0 100%)'
      : sfAvatarGrad(author);

    card.innerHTML = `
      <div class="comment-card-header">
        <div class="comment-avatar" style="background:${grad}">${sfEscapeAttribute(String((author[0] || 'S').toUpperCase()))}</div>
        <strong class="comment-author-name">${sfEscapeAttribute(String(author))}</strong>
        ${isStaff ? '<span class="comment-staff-tag">STAFF</span>' : ''}
        <span class="comment-date">${sfRelTime(c.created_at || new Date().toISOString())}</span>
      </div>
      <div class="comment-body">${sfEscapeAttribute(String(c.body || ''))}</div>
      <div class="comment-actions">
        ${c.user_id && c.user_id===document.getElementById('sf-auth-config')?.dataset.user ? `<button type="button" class="care-report" data-edit-comment="${sfEscapeAttribute(String(c.id))}" data-comment-version="${Number(c.version)||1}">Edit</button>` : ''}
        <button type="button" class="care-report" data-report-comment="${sfEscapeAttribute(c.id)}">Report</button>
        <button type="button" class="comment-reply-btn" data-sf-click="reply-idea" data-reply-id="${sfEscapeAttribute(String(c.id))}" data-reply-author="${sfEscapeAttribute(author)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
          Reply
        </button>
      </div>
    `;
    return card;
  }

  async function sfSubmitComment(e, submissionId) {
    e.preventDefault();
    const input = (document.getElementById('comment-input') as HTMLTextAreaElement);
    const body = input.value.trim();
    if (body.length < 10) {
      if (window.sfToast) sfToast('Comment must be at least 10 characters.', 'error');
      return;
    }

    const btn = (document.getElementById('comment-submit-btn') as HTMLButtonElement);
    btn.disabled = true;
    btn.innerHTML = '<span>Posting…</span>';

    try {
      const res = await sfSchoolFetch(`/api/comments/${submissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          parentId: activeReplyingToId
        })
      });
      const data = await res.json();
      if (!data.success && !data.data) {
        throw new Error(data.error || 'Failed to post comment');
      }

      if(data.data?.status && data.data.status!=='published'){
        input.value='';sfCancelReply();sfCommentInputChanged(input);
        window.sfToast?.('Your comment was saved privately for administrator review.','success');return;
      }
      const empty = (document.getElementById('comment-empty') as HTMLElement);
      if (empty) empty.remove();

      const newComment = data.data || {
        id: 'new-' + Date.now(),
        body,
        display_name: 'You',
        created_at: new Date().toISOString(),
        parent_id: activeReplyingToId
      };

      const card = sfCreateStandaloneCommentCardEl(newComment, !!activeReplyingToId);
      const list = (document.getElementById('comments-list') as HTMLElement);

      if (activeReplyingToId) {
        const parentCard = (document.getElementById(`comment-${activeReplyingToId}`) as HTMLElement);
        if (parentCard) {
          let thread = parentCard.nextElementSibling as HTMLElement | null;
          if (!thread || !thread.classList.contains('comment-replies-thread')) {
            thread = document.createElement('div');
            thread.className = 'comment-replies-thread';
            parentCard.after(thread);
          }
          thread.appendChild(card);
        } else {
          list.appendChild(card);
        }
      } else {
        list.appendChild(card);
      }

      input.value = '';
      sfCancelReply();
      sfCommentInputChanged(input);

      // Increment counts
      const mobCount = (document.getElementById('mob-comment-count') as HTMLElement);
      const headCount = (document.getElementById('comments-header-count') as HTMLElement);
      const jumpCount = (document.getElementById('jump-comment-count') as HTMLElement);
      const nextCount = Number(headCount?.textContent || 0) + 1;
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
Object.assign(window, { sfAvatarGrad, sfRelTime, sfSetMobileDetailTab, sfShareIdea, sfCommentInputChanged, sfReplyTo, sfCancelReply, sfCollapseComposer, sfVoteDetail, sfCreateStandaloneCommentCardEl, sfSubmitComment });
})();
