"use strict";
(() => {
    const source = document.getElementById('sf-session-idle');
    const dialog = document.getElementById('sf-idle-warning');
    if (!source || !dialog || source.dataset.mounted)
        return;
    source.dataset.mounted = 'true';
    const stay = document.getElementById('sf-idle-continue');
    const signout = document.getElementById('sf-idle-signout');
    const status = document.getElementById('sf-idle-status');
    let deadline = 0, warningMs = 120000, intervalMs = 60000, lastSent = Date.now(), pendingActivity = false, busy = false, stopped = false;
    let timer, activityTimer;
    function clearTimers() { window.clearTimeout(timer); window.clearTimeout(activityTimer); timer = activityTimer = undefined; }
    function update(state) {
        if (!Number.isFinite(state.expiresAt) || !Number.isFinite(state.serverNow))
            return;
        deadline = Date.now() + state.expiresAt - state.serverNow;
        warningMs = Number.isFinite(state.warningMs) && state.warningMs > 0 ? state.warningMs : 120000;
        intervalMs = Number.isFinite(state.activityIntervalMs) && state.activityIntervalMs >= 60000 ? state.activityIntervalMs : 60000;
        try {
            localStorage.setItem('sf-session-deadline', String(state.expiresAt));
        }
        catch { }
        if (dialog.open)
            dialog.close();
        status.textContent = '';
        schedule();
    }
    async function sessionRequest(activity) {
        if (stopped || busy)
            return;
        busy = true;
        stay.disabled = true;
        const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(activity ? '/auth/session/activity' : '/auth/session', { method: activity ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, ...activity ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {} });
            const result = await response.json();
            if (response.status === 401 || response.ok && !result.user && !activity) {
                expire();
                return;
            }
            if (!response.ok || !result.success || !result.idle)
                throw new Error('Your session could not be checked. Check your connection and try again.');
            if (activity) {
                lastSent = Date.now();
                pendingActivity = false;
            }
            update(result.idle);
        }
        catch {
            status.textContent = 'Your session could not be checked. Check your connection and try again.';
            if (Date.now() >= deadline) {
                expire();
                return;
            }
            showWarning();
        }
        finally {
            window.clearTimeout(timeout);
            busy = false;
            stay.disabled = false;
            if (!stopped)
                schedule();
        }
    }
    function showWarning() {
        if (stopped || document.hidden || dialog.open)
            return;
        try {
            dialog.showModal();
        }
        catch {
            dialog.setAttribute('open', '');
        }
    }
    function schedule() {
        window.clearTimeout(timer);
        if (stopped)
            return;
        const remaining = deadline - Date.now();
        if (remaining > 0 && remaining <= warningMs) {
            showWarning();
            timer = window.setTimeout(() => void sessionRequest(false), remaining);
            return;
        }
        timer = window.setTimeout(() => {
            if (Date.now() >= deadline)
                void sessionRequest(false);
            else {
                showWarning();
                timer = window.setTimeout(() => void sessionRequest(false), Math.max(0, deadline - Date.now()));
            }
        }, remaining <= warningMs ? Math.max(0, remaining) : remaining - warningMs);
    }
    function expire() {
        if (stopped)
            return;
        stopped = true;
        clearTimers();
        if (window.sfExpireSession)
            window.sfExpireSession();
        else
            window.location.replace('/account/home?session=expired');
    }
    function activity(event) {
        if (!event.isTrusted || document.hidden || dialog.open || stopped)
            return;
        pendingActivity = true;
        if (activityTimer !== undefined)
            return;
        activityTimer = window.setTimeout(() => {
            activityTimer = undefined;
            if (pendingActivity && !document.hidden && !dialog.open)
                void sessionRequest(true);
        }, Math.max(0, intervalMs - (Date.now() - lastSent)));
    }
    function resume() {
        if (!document.hidden && !stopped)
            void sessionRequest(false);
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input'];
    events.forEach(name => document.addEventListener(name, activity, { passive: true }));
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('storage', event => {
        if (event.key === 'sf-session-expired' && event.newValue)
            expire();
        else if (event.key === 'sf-session-deadline' && !document.hidden)
            void sessionRequest(false);
    });
    window.addEventListener('pagehide', () => { clearTimers(); });
    window.addEventListener('sf:session-expired', () => { stopped = true; clearTimers(); });
    stay.addEventListener('click', () => void sessionRequest(true));
    dialog.addEventListener('cancel', event => { event.preventDefault(); void sessionRequest(true); });
    signout.addEventListener('click', () => {
        stay.disabled = signout.disabled = true;
        window.sfSignOut().catch(() => { status.textContent = 'Could not sign out. Check your connection and try again.'; stay.disabled = signout.disabled = false; });
    });
    window.sfIdleUpdate = update;
    try {
        update(JSON.parse(source.textContent || 'null'));
    }
    catch {
        stopped = true;
        clearTimers();
    }
})();
