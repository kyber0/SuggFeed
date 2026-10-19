"use strict";
(() => {
    document.addEventListener('DOMContentLoaded', async () => {
        const title = document.getElementById('auth-callback-title');
        const message = document.getElementById('auth-callback-message');
        const spinner = document.querySelector('.auth-callback-spinner-wrap');
        const retry = document.getElementById('auth-callback-retry');
        const form = document.getElementById('auth-reset-form');
        const password = document.getElementById('auth-reset-password');
        const confirmation = document.getElementById('auth-reset-confirm');
        const feedback = document.getElementById('auth-reset-feedback');
        const submit = document.getElementById('auth-reset-submit');
        const cancel = document.getElementById('auth-reset-cancel');
        const codeEntryPage = window.location.pathname === '/auth/recovery';
        const codeForm = document.getElementById('auth-code-form');
        const codeEmail = document.getElementById('auth-code-email');
        const codeInput = document.getElementById('auth-recovery-code');
        const codeFeedback = document.getElementById('auth-code-feedback');
        const codeSubmit = document.getElementById('auth-code-submit');
        const codeResend = document.getElementById('auth-code-resend');
        const recoveryKey = 'sf:password-recovery:v1';
        const query = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        let recovery = query.get('type') === 'recovery' || hash.get('type') === 'recovery';
        let expired = false, saving = false;
        let recoverySession = null;
        const timeout = setTimeout(() => {
            expired = true;
            spinner.hidden = true;
            title.textContent = 'This link is taking too long';
            message.textContent = 'Check your connection, then request a new link and try again.';
            retry.hidden = false;
        }, 30000);
        function forgetRecovery() { try {
            sessionStorage.removeItem(recoveryKey);
        }
        catch { } }
        function rememberRecovery(session) {
            try {
                sessionStorage.setItem(recoveryKey, JSON.stringify({ version: 1, userId: session.user.id, createdAt: Date.now() }));
            }
            catch { }
        }
        function canResume(session) {
            try {
                const saved = JSON.parse(sessionStorage.getItem(recoveryKey) || 'null');
                return saved?.version === 1 && saved.userId === session.user.id && typeof saved.createdAt === 'number' && saved.createdAt <= Date.now() && Date.now() - saved.createdAt < 30 * 60 * 1000;
            }
            catch {
                return false;
            }
        }
        function showReset(session) {
            recoverySession = session;
            rememberRecovery(session);
            codeForm.hidden = true;
            codeInput.value = '';
            history.replaceState(null, '', '/auth/callback?type=recovery');
            spinner.hidden = true;
            retry.hidden = true;
            form.hidden = false;
            title.textContent = 'Choose a new password';
            message.textContent = 'Your reset link is verified. Enter your new password below to finish resetting it.';
            password.focus();
        }
        codeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (saving)
                return;
            codeFeedback.dataset.state = 'error';
            const email = codeEmail.value.trim(), token = codeInput.value.trim();
            if (!email || !codeEmail.checkValidity()) {
                codeFeedback.textContent = 'Enter the email address used to request this reset.';
                codeEmail.focus();
                return;
            }
            if (!/^[0-9]{6,10}$/.test(token)) {
                codeFeedback.textContent = 'Enter the numeric password reset code from your email.';
                codeInput.focus();
                return;
            }
            saving = true;
            codeSubmit.disabled = true;
            codeResend.disabled = true;
            codeEmail.disabled = true;
            codeInput.disabled = true;
            codeFeedback.dataset.state = 'info';
            codeFeedback.textContent = 'Verifying reset code…';
            try {
                const result = await window._sb.auth.verifyOtp({ email, token, type: 'recovery' });
                if (result.error || !result.data.session)
                    throw new Error('That reset code could not be verified. Check the email address and code, or request a fresh reset email.');
                showReset(result.data.session);
                codeFeedback.textContent = '';
            }
            catch (error) {
                codeFeedback.dataset.state = 'error';
                codeFeedback.textContent = error.message || 'The code could not be verified. Please try again.';
            }
            finally {
                saving = false;
                codeSubmit.disabled = false;
                codeResend.disabled = false;
                codeEmail.disabled = false;
                codeInput.disabled = false;
            }
        });
        codeResend.addEventListener('click', () => { if (!saving)
            window.openAuthModal('forgot'); });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (saving || !recoverySession)
                return;
            feedback.textContent = '';
            if (password.value.length < 8) {
                feedback.textContent = 'Choose a password with at least 8 characters.';
                password.focus();
                return;
            }
            if (password.value !== confirmation.value) {
                feedback.textContent = 'The passwords do not match.';
                confirmation.focus();
                return;
            }
            saving = true;
            submit.disabled = true;
            cancel.disabled = true;
            password.disabled = true;
            confirmation.disabled = true;
            submit.textContent = 'Updating password…';
            let updated = false;
            try {
                const sb = window._sb;
                const current = await sb.auth.getUser();
                if (current.error || current.data.user?.id !== recoverySession.user.id)
                    throw new Error('Your reset session expired or the account changed. Request a new reset link.');
                const result = await sb.auth.updateUser({ password: password.value });
                if (result.error)
                    throw result.error;
                updated = true;
                password.value = '';
                confirmation.value = '';
                forgetRecovery();
                window.sfPasswordRecovery = false;
                try {
                    sessionStorage.removeItem('sf-auth-return');
                }
                catch { }
                const fresh = await sb.auth.getSession();
                if (fresh.error || !fresh.data.session || fresh.data.session.user.id !== recoverySession.user.id)
                    throw new Error('Your password was changed. Please sign in with your new password.');
                await window.sfSyncSession(fresh.data.session);
                form.hidden = true;
                title.textContent = 'Password updated';
                message.textContent = 'Your new password is saved. You can now continue to your account.';
                retry.href = '/schools';
                retry.textContent = 'Choose your school';
                retry.hidden = false;
                retry.focus();
            }
            catch (error) {
                if (updated) {
                    form.hidden = true;
                    recoverySession = null;
                    title.textContent = 'Password updated';
                    message.textContent = 'Your password was changed, but sign-in could not be completed. Return home and sign in with your new password.';
                    retry.hidden = false;
                    retry.focus();
                }
                else {
                    feedback.textContent = error.message || 'The password could not be changed. Request a new link if this one expired.';
                }
            }
            finally {
                saving = false;
                submit.disabled = false;
                cancel.disabled = false;
                password.disabled = false;
                confirmation.disabled = false;
                submit.textContent = 'Update password';
            }
        });
        cancel.addEventListener('click', async () => {
            if (saving)
                return;
            forgetRecovery();
            cancel.disabled = true;
            try {
                await window.sfSignOut();
            }
            catch {
                cancel.disabled = false;
                feedback.textContent = 'Could not sign out. Please try again.';
            }
        });
        // A recovery link creates a temporary Supabase session. It must reach the
        // password form before the normal server-session sync and profile redirect.
        try {
            const sb = window._sb;
            if (!sb)
                throw new Error('Authentication is unavailable. Please try again later.');
            history.replaceState(null, '', codeEntryPage ? '/auth/recovery' : recovery ? '/auth/callback?type=recovery' : '/auth/callback');
            if (query.has('error') || hash.has('error') || query.has('error_code') || hash.has('error_code')) {
                const suppliedCode = query.get('error_code') || hash.get('error_code') || query.get('error') || hash.get('error') || '';
                const code = /^[a-z0-9_]{1,64}$/.test(suppliedCode) ? suppliedCode : 'oauth_error';
                // Classify provider details without displaying or storing arbitrary upstream responses.
                const detail = (query.get('error_description') || hash.get('error_description') || '').toLowerCase();
                let explanation = 'The sign-in service could not complete Google verification. Start a fresh sign-in. If it happens again, report the error code below.';
                if (detail.includes('invalid_client') || code === 'provider_disabled' || code === 'oauth_provider_not_supported') {
                    explanation = 'The Google sign-in configuration was rejected. The service administrator needs to check the Google provider credentials and callback configuration.';
                }
                else if (detail.includes('database error') || detail.includes('saving new user')) {
                    explanation = 'The authentication service could not create or update your account. The service administrator needs to check the account-creation database error.';
                }
                else if (['bad_oauth_state', 'bad_oauth_callback', 'flow_state_expired', 'flow_state_not_found'].includes(code)) {
                    explanation = 'This sign-in request expired or lost its browser session. Start again on this website and finish in the same browser tab.';
                }
                else if (code === 'access_denied') {
                    explanation = 'Google sign-in was not authorized. Start again and complete the Google consent screen.';
                }
                else if (['identity_already_exists', 'email_exists'].includes(code)) {
                    explanation = 'This Google identity could not be linked to the account. Sign in using your existing method and contact the service administrator.';
                }
                else if (code === 'signup_disabled') {
                    explanation = 'New account registration is disabled. Contact the service administrator if you need access.';
                }
                history.replaceState(null, '', '/auth/callback?error=oauth_error&error_code=' + code);
                throw new Error(explanation + ' Error code: ' + code + '.');
            }
            if ((query.has('code') && !query.get('code')) ||
                ((hash.has('access_token') || hash.has('refresh_token')) && (!hash.get('access_token') || !hash.get('refresh_token')))) {
                throw new Error('This link is incomplete. Request a new link and try again.');
            }
            await window.sfAuthReady;
            if (codeEntryPage && !query.has('code') && !hash.has('access_token')) {
                spinner.hidden = true;
                codeForm.hidden = false;
                retry.hidden = true;
                title.textContent = 'Use your password reset code';
                message.textContent = 'Verify the code from your reset email, then choose a new password.';
                codeEmail.focus();
                return;
            }
            let session = null;
            if (query.get('code')) {
                const result = await sb.auth.exchangeCodeForSession(query.get('code'), query.get('sb_flow_id') ? { flowId: query.get('sb_flow_id') } : undefined);
                if (result.error)
                    throw new Error('This link expired or was opened in a different browser or domain. Request a new link on this website and open it in the same browser.');
                session = result.data.session;
                // Supabase stores this intent alongside the initiating PKCE verifier.
                recovery || (recovery = result.data.redirectType === 'recovery' || !!window.sfPasswordRecovery);
            }
            else if (hash.get('access_token') && hash.get('refresh_token')) {
                const result = await sb.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
                if (result.error)
                    throw new Error('This link is no longer valid. Request a new link and try again.');
                session = result.data.session;
            }
            else if (recovery) {
                const result = await sb.auth.getSession();
                if (result.error || !result.data.session || !canResume(result.data.session))
                    throw new Error('Your reset link is missing or has expired. Request a new password reset link.');
                session = result.data.session;
            }
            else {
                const result = await sb.auth.getSession();
                if (result.error)
                    throw result.error;
                session = result.data.session;
            }
            if (!session)
                throw new Error('No verified session was returned. Request a new link and try again.');
            if (expired)
                return;
            if (recovery) {
                showReset(session);
                return;
            }
            forgetRecovery();
            await window.sfSyncSession(session);
            if (expired)
                return;
            let destination = title.dataset?.returnTo || '/schools';
            try {
                destination = sessionStorage.getItem('sf-auth-return') || destination;
                sessionStorage.removeItem('sf-auth-return');
            }
            catch { }
            if (!/^\/(?:s\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/|[?#]|$)|platform\/(?:schools|customization)(?:[/?#]|$)|schools\/invitations\/[^/]+$|account\/security(?:[?#]|$))/.test(destination) || destination.includes('\\') || /[\u0000-\u0020\u007f]/.test(destination))
                destination = '/schools';
            window.sfAuthNavigate('/account/home?returnTo=' + encodeURIComponent(destination));
        }
        catch (error) {
            forgetRecovery();
            spinner.hidden = true;
            title.textContent = recovery ? 'Password reset could not be started' : 'Sign-in could not be completed';
            message.textContent = error.message || 'Please request a new link and try again.';
            retry.hidden = false;
        }
        finally {
            clearTimeout(timeout);
        }
    });
})();
