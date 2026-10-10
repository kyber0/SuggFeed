"use strict";
// Browser source extracted from views/auth-callback.eta.
(function () {
    document.addEventListener('DOMContentLoaded', async () => {
        let expired = false;
        const timeout = setTimeout(() => {
            expired = true;
            document.querySelector('.auth-callback-spinner-wrap').hidden = true;
            document.getElementById('auth-callback-title').textContent = 'Sign-in is taking too long';
            document.getElementById('auth-callback-message').textContent = 'Check your connection, then start sign-in again.';
            document.getElementById('auth-callback-retry').hidden = false;
        }, 30000);
        try {
            const sb = window._sb;
            if (!sb)
                throw new Error('Sign-in is unavailable. Please try again later.');
            const query = new URLSearchParams(window.location.search);
            const hash = new URLSearchParams(window.location.hash.slice(1));
            // Scrub credentials from history before making any further requests.
            history.replaceState(null, '', '/auth/callback');
            if (query.has('error') || hash.has('error'))
                throw new Error('Google sign-in was cancelled or could not be completed. Please try again.');
            await window.sfAuthReady;
            let session;
            if (query.get('code')) {
                const result = await sb.auth.exchangeCodeForSession(query.get('code'));
                if (result.error)
                    throw new Error('This sign-in link expired or was opened on a different domain. Start sign-in again on this website.');
                session = result.data.session;
            }
            else if (hash.get('access_token') && hash.get('refresh_token')) {
                const result = await sb.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
                if (result.error)
                    throw new Error('This sign-in link is no longer valid. Please try again.');
                session = result.data.session;
            }
            else {
                const result = await sb.auth.getSession();
                session = result.data.session;
            }
            if (!session)
                throw new Error('No sign-in session was returned. Please try again.');
            if (expired)
                return;
            await window.sfSyncSession(session);
            if (expired)
                return;
            let destination = '/profile';
            try {
                destination = sessionStorage.getItem('sf-auth-return') || destination;
                sessionStorage.removeItem('sf-auth-return');
            }
            catch (_) { }
            if (destination.startsWith('/auth/'))
                destination = '/profile';
            window.sfAuthNavigate(destination);
        }
        catch (err) {
            document.querySelector('.auth-callback-spinner-wrap').hidden = true;
            document.getElementById('auth-callback-title').textContent = 'Sign-in could not be completed';
            document.getElementById('auth-callback-message').textContent = err.message || 'Please try signing in again.';
            document.getElementById('auth-callback-retry').hidden = false;
        }
        finally {
            clearTimeout(timeout);
        }
    });
})();
