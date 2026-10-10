"use strict";
// Browser source extracted from views/idea.eta.
(function () {
    let activeReplyingToId = null;
    const SF_AVATAR_COLORS = [
        ['#0b3857', '#1e5a8a'], ['#0d9488', '#0a7a6e'], ['#7c3aed', '#6026c0'],
        ['#d97706', '#b45309'], ['#be185d', '#9d174d'], ['#0369a1', '#0284c7']
    ];
    function sfAvatarGrad(name) {
        const idx = ((name && name.charCodeAt(0)) || 0) % SF_AVATAR_COLORS.length;
        const [a, b] = SF_AVATAR_COLORS[idx];
        return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
    }
    function sfRelTime(dateStr) {
        const d = new Date(dateStr);
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 60)
            return 'just now';
        if (diff < 3600)
            return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400)
            return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800)
            return `${Math.floor(diff / 86400)}d ago`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    document.addEventListener('DOMContentLoaded', () => {
        const votedIds = JSON.parse(localStorage.getItem('sf_voted_ideas') || '[]');
        if (votedIds.includes(document.getElementById('sf-idea-config').dataset.id)) {
            const btn = document.getElementById('detail-vote-btn');
            if (btn && document.getElementById('sf-idea-config').dataset.status !== 'pending') {
                btn.classList.add('voted');
                const textEl = document.getElementById('detail-vote-text');
                if (textEl)
                    textEl.textContent = 'Supported';
                const iconEl = document.getElementById('detail-vote-icon');
                if (iconEl)
                    iconEl.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
            }
        }
    });
    function sfSetMobileDetailTab(tab) {
        const isComments = tab === 'comments';
        const tabDetails = document.getElementById('mob-tab-details');
        const tabComments = document.getElementById('mob-tab-comments');
        const cols = document.getElementById('detail-columns');
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
    function sfShareIdea() {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        const btn = document.getElementById('share-btn');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => { btn.innerHTML = orig; }, 2000);
        }
        if (window.sfToast)
            sfToast('Link copied to clipboard!', 'success');
    }
    function sfCommentInputChanged(textarea) {
        const len = textarea.value.length;
        const countSpan = document.getElementById('comment-char-count');
        if (countSpan) {
            countSpan.textContent = `${len}/500${len < 10 ? ' · Min 10 chars' : ''}`;
        }
    }
    function sfReplyTo(commentId, author) {
        activeReplyingToId = commentId;
        document.getElementById('replying-author').textContent = `@${author}`;
        document.getElementById('replying-banner').removeAttribute('hidden');
        const input = document.getElementById('comment-input');
        input.placeholder = `Reply to @${author}…`;
        input.focus();
    }
    function sfCancelReply() {
        activeReplyingToId = null;
        const banner = document.getElementById('replying-banner');
        if (banner)
            banner.setAttribute('hidden', '');
        const input = document.getElementById('comment-input');
        if (input)
            input.placeholder = 'Add a constructive thought…';
    }
    function sfCollapseComposer() {
        const composer = document.getElementById('comment-composer');
        const input = document.getElementById('comment-input');
        if (composer)
            composer.classList.remove('expanded');
        if (input) {
            input.value = '';
            input.blur();
        }
        sfCancelReply();
        sfCommentInputChanged(input);
    }
    async function sfVoteDetail(id) {
        const btn = document.getElementById('detail-vote-btn');
        if (btn.classList.contains('voted'))
            return;
        try {
            const res = await fetch(`/api/vote/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'up' })
            });
            const data = await res.json();
            if (data.success) {
                btn.classList.add('voted');
                document.getElementById('detail-vote-count').textContent = data.vote_count;
                document.getElementById('detail-vote-summary').textContent = data.vote_count;
                document.getElementById('detail-vote-text').textContent = 'Supported';
                document.getElementById('detail-vote-icon').innerHTML = '<polyline points="20 6 9 17 4 12"/>';
                // Persist to local storage
                const votedIds = JSON.parse(localStorage.getItem('sf_voted_ideas') || '[]');
                if (!votedIds.includes(id)) {
                    votedIds.push(id);
                    localStorage.setItem('sf_voted_ideas', JSON.stringify(votedIds));
                }
                if (window.sfToast)
                    sfToast('Vote recorded! Thank you.', 'success');
            }
        }
        catch (e) {
            if (window.sfToast)
                sfToast('Could not record vote.', 'error');
        }
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
        <div class="comment-avatar" style="background:${grad}">${(author[0] || 'S').toUpperCase()}</div>
        <strong class="comment-author-name">${author}</strong>
        ${isStaff ? '<span class="comment-staff-tag">STAFF</span>' : ''}
        <span class="comment-date">${sfRelTime(c.created_at || new Date().toISOString())}</span>
      </div>
      <div class="comment-body">${(c.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div class="comment-actions">
        <button type="button" class="comment-reply-btn" data-sf-click="reply-idea" data-reply-id="${c.id}" data-reply-author="${sfEscapeAttribute(author)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
          Reply
        </button>
      </div>
    `;
        return card;
    }
    async function sfSubmitComment(e, submissionId) {
        e.preventDefault();
        const input = document.getElementById('comment-input');
        const body = input.value.trim();
        if (body.length < 10) {
            if (window.sfToast)
                sfToast('Comment must be at least 10 characters.', 'error');
            return;
        }
        const btn = document.getElementById('comment-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<span>Posting…</span>';
        try {
            const res = await fetch(`/api/comments/${submissionId}`, {
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
            const empty = document.getElementById('comment-empty');
            if (empty)
                empty.remove();
            const newComment = data.data || {
                id: 'new-' + Date.now(),
                body,
                display_name: 'You',
                created_at: new Date().toISOString(),
                parent_id: activeReplyingToId
            };
            const card = sfCreateStandaloneCommentCardEl(newComment, !!activeReplyingToId);
            const list = document.getElementById('comments-list');
            if (activeReplyingToId) {
                const parentCard = document.getElementById(`comment-${activeReplyingToId}`);
                if (parentCard) {
                    let thread = parentCard.nextElementSibling;
                    if (!thread || !thread.classList.contains('comment-replies-thread')) {
                        thread = document.createElement('div');
                        thread.className = 'comment-replies-thread';
                        thread.style.cssText = 'margin-left: 24px; padding-left: 12px; border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: 8px; margin-top: 6px;';
                        parentCard.after(thread);
                    }
                    thread.appendChild(card);
                }
                else {
                    list.appendChild(card);
                }
            }
            else {
                list.appendChild(card);
            }
            input.value = '';
            sfCancelReply();
            sfCommentInputChanged(input);
            // Increment counts
            const mobCount = document.getElementById('mob-comment-count');
            const headCount = document.getElementById('comments-header-count');
            const jumpCount = document.getElementById('jump-comment-count');
            const nextCount = Number(headCount?.textContent || 0) + 1;
            if (mobCount)
                mobCount.textContent = String(nextCount);
            if (headCount)
                headCount.textContent = String(nextCount);
            if (jumpCount)
                jumpCount.textContent = String(nextCount);
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (window.sfToast)
                sfToast('Comment posted successfully!', 'success');
        }
        catch (err) {
            if (window.sfToast)
                sfToast(err.message || 'Could not post comment.', 'error');
        }
        finally {
            btn.disabled = false;
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Post</span>';
        }
    }
    Object.assign(window, { sfAvatarGrad, sfRelTime, sfSetMobileDetailTab, sfShareIdea, sfCommentInputChanged, sfReplyTo, sfCancelReply, sfCollapseComposer, sfVoteDetail, sfCreateStandaloneCommentCardEl, sfSubmitComment });
})();
