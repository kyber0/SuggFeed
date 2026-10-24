"use strict";
/** Shared inline owner editing; the server rechecks ownership and moderation. */
(() => {
    function hold(card) {
        const body = card.querySelector('.comment-body'), actions = card.querySelector('.comment-actions');
        if (actions?.hidden)
            return;
        if (body)
            body.textContent = 'This comment is awaiting administrator review.';
        if (actions)
            actions.hidden = true;
        const prefix = card.id.startsWith('drawer-') ? 'drawer-' : '';
        for (const id of ['comments-header-count', 'mob-comment-count', 'jump-comment-count']) {
            const counter = document.getElementById(prefix + id);
            if (counter)
                counter.textContent = String(Math.max(0, Number(counter.textContent || 0) - 1));
        }
    }
    Object.assign(window, { sfHoldComment: hold });
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-edit-comment]');
        if (!button)
            return;
        const card = button.closest('.comment-card'), body = card?.querySelector('.comment-body');
        if (!card || !body || card.querySelector('[data-comment-editor]'))
            return;
        const form = document.createElement('form'), label = document.createElement('label'), input = document.createElement('textarea'), save = document.createElement('button'), cancel = document.createElement('button'), message = document.createElement('p');
        form.className = 'care-form';
        form.dataset.commentEditor = '';
        label.textContent = 'Edit your comment';
        input.className = 'workspace-input';
        input.rows = 3;
        input.minLength = 10;
        input.maxLength = 500;
        input.required = true;
        input.value = body.textContent || '';
        label.append(input);
        save.type = 'submit';
        save.className = cancel.className = 'workspace-button';
        save.textContent = 'Save comment';
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        message.setAttribute('role', 'status');
        form.append(label, save, cancel, message);
        body.hidden = true;
        body.after(form);
        input.focus();
        const finish = () => { body.hidden = false; form.remove(); button.focus(); };
        cancel.addEventListener('click', finish);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            save.disabled = cancel.disabled = true;
            message.textContent = 'Saving…';
            try {
                const response = await sfSchoolFetch('/api/community/comments/' + encodeURIComponent(button.dataset.editComment) + '/edit', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: input.value, version: Number(button.dataset.commentVersion) }) });
                const data = await response.json();
                if (!response.ok || !data.success)
                    throw new Error(data.error || 'Could not save this comment.');
                if (data.data.status === 'published') {
                    body.textContent = data.data.body;
                    button.dataset.commentVersion = String(data.data.version);
                    finish();
                }
                else {
                    hold(card);
                    finish();
                }
                window.sfToast?.(data.data.status === 'published' ? 'Comment updated.' : 'Your comment was saved privately for administrator review.', 'success');
            }
            catch (error) {
                message.textContent = error instanceof Error ? error.message : 'Could not save. Your text is still here.';
            }
            finally {
                save.disabled = cancel.disabled = false;
            }
        });
    });
})();
