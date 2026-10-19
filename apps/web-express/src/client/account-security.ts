(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const page = document.getElementById('account-security')!;
    const feedback = document.getElementById('security-feedback')!;
    const enroll = document.getElementById('security-enroll') as HTMLButtonElement;
    const replace = document.getElementById('security-replace') as HTMLButtonElement;
    const setup = document.getElementById('security-setup')!;
    const qr = document.getElementById('security-qr') as HTMLImageElement;
    const secret = document.getElementById('security-secret')!;
    const form = document.getElementById('security-form') as HTMLFormElement;
    const code = document.getElementById('security-code') as HTMLInputElement;
    const verify = document.getElementById('security-verify') as HTMLButtonElement;
    let factorId: string | null = null, unfinishedId: string | null = null, busy = false;
    const fail = (message: string, error = false) => { feedback.textContent = message; feedback.dataset.state = error ? 'error' : 'info'; };
    function controls(disabled: boolean) { busy = disabled; enroll.disabled = replace.disabled = verify.disabled = code.disabled = disabled; }
    async function ownAccount() {
      const result = await window._sb.auth.getUser();
      if (result.error || result.data.user?.id !== page.dataset.userId) throw new Error('Your sign-in expired or the account changed. Sign in again.');
    }
    async function factors() {
      await ownAccount();
      const result = await window._sb.auth.mfa.listFactors();
      if (result.error) throw new Error('Could not load authenticators. Reload this page to try again.');
      return result.data.all.filter(factor => factor.factor_type === 'totp');
    }
    async function load() {
      const all = await factors();
      const verified = all.find(factor => factor.status === 'verified');
      factorId = verified?.id ?? null;
      unfinishedId = all.find(factor => factor.status === 'unverified')?.id ?? null;
      form.hidden = !verified; enroll.hidden = !!verified || !!unfinishedId; replace.hidden = !!verified || !unfinishedId;
      fail(verified ? 'Enter your authenticator code to continue.' : unfinishedId ? 'You have an unfinished authenticator setup. Replace it to get a new QR code.' : 'Set up an authenticator app to protect your account.');
    }
    async function start(replacing: boolean) {
      if (busy) return;
      controls(true);
      fail('Preparing your authenticator setup…');
      try {
        const all = await factors();
        if (all.some(factor => factor.status === 'verified')) { await load(); return; }
        if (replacing) {
          const unfinished = all.find(factor => factor.id === unfinishedId && factor.status === 'unverified');
          if (!unfinished) { await load(); return; }
          const removed = await window._sb.auth.mfa.unenroll({factorId: unfinished.id});
          if (removed.error) throw new Error('Could not replace the unfinished setup. Please try again.');
        } else if (all.length) { await load(); return; }
        const result = await window._sb.auth.mfa.enroll({factorType: 'totp', friendlyName: 'SuggFeed authenticator'});
        if (result.error) throw new Error('Could not set up your authenticator. Please try again.');
        factorId = result.data.id; unfinishedId = factorId;
        const image = result.data.totp.qr_code;
        if (!image.startsWith('data:image/svg+xml;') && !image.startsWith('data:image/svg+xml,')) throw new Error('Could not display the setup code. Replace the unfinished setup and try again.');
        qr.src = image; secret.textContent = result.data.totp.secret;
        setup.hidden = false; form.hidden = false; enroll.hidden = replace.hidden = true;
        fail('Add this account to your authenticator app, then verify its code.'); code.focus();
      } catch (error) { fail(error.message || 'Authenticator setup failed. Reload to try again.', true); }
      finally { controls(false); }
    }
    enroll.addEventListener('click', () => start(false));
    replace.addEventListener('click', () => start(true));
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !factorId) return;
      const value = code.value.trim();
      if (!/^[0-9]{6}$/.test(value)) { fail('Enter the six digit code from your authenticator app.', true); code.focus(); return; }
      controls(true);
      fail('Verifying your code…');
      try {
        await ownAccount();
        const challenge = await window._sb.auth.mfa.challenge({factorId});
        if (challenge.error) throw new Error('Could not request verification. Please try again.');
        const result = await window._sb.auth.mfa.verify({factorId, challengeId: challenge.data.id, code: value});
        if (result.error) throw new Error('That code is invalid or expired. Enter the current code and try again.');
        code.value = ''; secret.textContent = ''; qr.removeAttribute('src'); setup.hidden = true;
        const assurance = await window._sb.auth.mfa.getAuthenticatorAssuranceLevel();
        const fresh = await window._sb.auth.getSession();
        if (assurance.error || assurance.data.currentLevel !== 'aal2' || fresh.error || !fresh.data.session || fresh.data.session.user.id !== page.dataset.userId) throw new Error('Verification could not be saved. Please sign in again.');
        const response = await fetch('/auth/session', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({access_token: fresh.data.session.access_token, refresh_token: fresh.data.session.refresh_token})});
        const saved = await response.json();
        if (!response.ok || !saved.success || saved.user?.id !== page.dataset.userId) throw new Error('Verification could not be saved. Please try again.');
        const destination = page.dataset.returnTo || '/schools';
        const url = new URL(destination, window.location.origin);
        const school = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(url.pathname);
        const allowed = url.pathname === '/schools' || /^\/platform\/schools(?:\/[^/]+\/(?:settings|invitations|customization(?:\/preview(?:\/content)?)?))?$/.test(url.pathname) || url.pathname === '/account/home' || url.pathname === '/platform/customization' || (school && school[1].length >= 3 && school[1].length <= 63);
        window.location.assign(destination.startsWith('/') && url.origin === window.location.origin && !/[\\\x00-\x20\x7f]|%(?:2f|5c|25|2e)/i.test(destination) && url.pathname === destination.split(/[?#]/)[0] && allowed ? destination : '/schools');
      } catch (error) { code.value = ''; fail(error.message || 'Verification failed. Please try again.', true); }
      finally { controls(false); }
    });
    try { await window.sfAuthReady; await load(); }
    catch (error) { fail(error.message || 'Could not load account security. Reload to try again.', true); }
  });
})();
