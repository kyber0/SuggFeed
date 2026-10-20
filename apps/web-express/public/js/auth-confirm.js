"use strict";
(() => {
    const data = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
    let token = data.get('token_hash') || query.get('token_hash') || '';
    const type = data.get('type') || query.get('type');
    // Remove the bearer credential immediately; do not retain it in browser storage.
    history.replaceState(null, '', '/auth/confirm');
    const button = document.getElementById('email-confirm-button');
    const title = document.getElementById('email-confirm-title'), message = document.getElementById('email-confirm-message'), error = document.getElementById('email-confirm-error'), back = document.getElementById('email-confirm-return');
    const resendForm = document.getElementById('email-confirm-resend-form'), resend = document.getElementById('email-confirm-resend'), resendEmail = document.getElementById('email-confirm-address'), resendMessage = document.getElementById('email-confirm-resend-message');
    let resending = false, resendAfter = 0;
    resendForm.addEventListener('submit', async (event) => { event.preventDefault(); if (resending || !resendForm.reportValidity())
        return; if (Date.now() < resendAfter) {
        resendMessage.textContent = 'Wait a minute before requesting another email.';
        return;
    } resending = true; resend.disabled = true; resendMessage.textContent = 'Requesting a fresh confirmation…'; try {
        await window.sfAuthReady;
        if (!window._sb)
            throw new Error();
        const result = await window._sb.auth.resend({ type: 'signup', email: resendEmail.value.trim(), options: { emailRedirectTo: location.origin + '/auth/callback' } });
        if (result.error)
            throw new Error();
        resendAfter = Date.now() + 60000;
        resendMessage.textContent = 'If this address has an unconfirmed account, a fresh email will arrive. Check your inbox and spam folder.';
    }
    catch {
        resendMessage.textContent = 'A new confirmation could not be requested. Wait a minute and try again, or contact support if this continues.';
    }
    finally {
        resending = false;
        resend.disabled = false;
    } });
    if (type !== 'signup' || !/^(?:pkce_)?[a-f0-9]{40,128}$/i.test(token)) {
        button.hidden = true;
        title.textContent = 'Confirmation link unavailable';
        message.textContent = 'Open the latest confirmation email. If its link expired, return to sign in and request a fresh confirmation email.';
        return;
    }
    let busy = false;
    button.addEventListener('click', async () => {
        if (busy)
            return;
        busy = true;
        button.disabled = true;
        button.textContent = 'Confirming your email…';
        error.textContent = '';
        try {
            await window.sfAuthReady;
            if (!window._sb)
                throw new Error('Sign-in is unavailable. Please try again shortly.');
            const result = await window._sb.auth.verifyOtp({ token_hash: token, type: 'signup' });
            if (result.error || !result.data.session)
                throw new Error('This confirmation link has expired or was already used. Return to sign in; if the account is not confirmed, request a new confirmation email.');
            token = '';
            await window.sfSyncSession(result.data.session);
            title.textContent = 'Email confirmed';
            message.textContent = 'Your email is verified' + (result.data.session.user.email ? ' for ' + result.data.session.user.email : '') + '. You can now choose your school.';
            button.hidden = true;
            back.textContent = 'Continue to your schools';
            back.className = 'am-btn-primary';
            back.focus();
        }
        catch (e) {
            error.textContent = e instanceof Error ? e.message : 'Confirmation could not finish. Please try again.';
            button.disabled = false;
            button.textContent = token ? 'Try confirmation again' : 'Return to sign in';
            if (!token) {
                button.hidden = true;
                back.textContent = 'Return to sign in';
            }
        }
        finally {
            busy = false;
        }
    });
})();
