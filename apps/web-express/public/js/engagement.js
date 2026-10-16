"use strict";
(() => {
    const requests = new WeakMap();
    const signedIn = () => !!document.getElementById('sf-auth-config')?.dataset.user;
    async function sync(button) {
        const id = button.dataset.followIdea;
        if (!id)
            return;
        requests.get(button)?.abort();
        button.textContent = signedIn() ? 'Loading follow status…' : 'Sign in to follow';
        button.disabled = signedIn();
        if (!signedIn())
            return;
        const controller = new AbortController();
        requests.set(button, controller);
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await sfSchoolFetch('/api/follows/' + encodeURIComponent(id), { signal: controller.signal });
            const body = await response.json();
            if (!response.ok || !body.success)
                throw new Error();
            if (button.dataset.followIdea !== id || requests.get(button) !== controller)
                return;
            button.dataset.following = String(body.following);
            button.setAttribute('aria-pressed', String(body.following));
            button.textContent = body.following ? 'Following · Unfollow' : 'Follow this idea';
        }
        catch {
            if (button.dataset.followIdea === id && requests.get(button) === controller) {
                button.textContent = 'Follow status unavailable · Retry';
                delete button.dataset.following;
            }
        }
        finally {
            clearTimeout(timer);
            if (requests.get(button) === controller)
                button.disabled = false;
        }
    }
    document.addEventListener('sf:follow-context', event => {
        const button = event.detail;
        if (button)
            void sync(button);
    });
    document.querySelectorAll('[data-follow-idea]').forEach(button => { if (button.dataset.followIdea)
        void sync(button); });
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-follow-idea]');
        if (!button || !button.dataset.followIdea || button.disabled)
            return;
        if (!signedIn()) {
            window.openAuthModal('signin');
            return;
        }
        if (button.dataset.following === undefined) {
            void sync(button);
            return;
        }
        const id = button.dataset.followIdea;
        const following = button.dataset.following !== 'true';
        button.disabled = true;
        const controller = new AbortController();
        requests.set(button, controller);
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await sfSchoolFetch('/api/follows/' + encodeURIComponent(id), { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ following }) });
            const result = await response.json();
            if (!response.ok || !result.success)
                throw new Error();
            if (button.dataset.followIdea !== id || requests.get(button) !== controller)
                return;
            button.dataset.following = String(result.following);
            button.setAttribute('aria-pressed', String(result.following));
            button.textContent = result.following ? 'Following · Unfollow' : 'Follow this idea';
        }
        catch {
            if (button.dataset.followIdea === id && requests.get(button) === controller) {
                delete button.dataset.following;
                button.textContent = 'Could not save · Check status again';
            }
        }
        finally {
            clearTimeout(timer);
            if (requests.get(button) === controller)
                button.disabled = false;
        }
    });
})();
