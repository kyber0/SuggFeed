(function () {
  'use strict';
  var config = document.getElementById('sf-auth-config');
  if (!config || !config.dataset.url || !config.dataset.key || !window.supabase) return;
  var sb = window.supabase.createClient(config.dataset.url, config.dataset.key, {
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
  });
  window._sb = sb;
  var callbackPage = window.location.pathname.startsWith('/auth/callback');
  var params = new URLSearchParams(window.location.search);
  var hash = new URLSearchParams(window.location.hash.slice(1));
  var returning = params.has('code') || params.has('error') || hash.has('access_token') || hash.has('error');
  // Some email flows still use the configured Site URL as their landing page.
  if (returning && !callbackPage) {
    window.location.replace('/auth/callback' + window.location.search + window.location.hash);
    return;
  }
  var syncingToken;
  var syncPromise;
  var navigating = false;

  async function request(url, options) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store', signal: controller.signal }, options));
      var body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'The site could not finish signing you in. Please try again.');
      return body;
    } finally { clearTimeout(timeout); }
  }

  window.sfSyncSession = function (session) {
    if (!session || !session.access_token) return Promise.reject(new Error('No sign-in session was returned. Please try again.'));
    if (syncingToken === session.access_token && syncPromise) return syncPromise;
    syncingToken = session.access_token;
    syncPromise = request('/auth/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
    }).then(async function (result) {
      // Detect rejected cookies and persistence errors before any reload loop.
      var persisted = await request('/auth/session');
      if (!persisted.user || persisted.user.id !== result.user.id) {
        throw new Error('Your sign-in could not be saved. Allow cookies for this site and try again.');
      }
      return result;
    }).catch(function (error) {
      syncingToken = null;
      syncPromise = null;
      window.dispatchEvent(new CustomEvent('sf:auth-sync-error'));
      throw error;
    });
    return syncPromise;
  };

  window.sfAuthNavigate = function (path) {
    if (navigating) return;
    navigating = true;
    // Keep all app navigation on the current origin.
    if (path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')) window.location.replace(path);
    else window.location.reload();
  };

  window.sfCompleteSignIn = async function (session) {
    await window.sfSyncSession(session);
    window.sfAuthNavigate();
  };

  window.sfStartGoogleSignIn = async function () {
    try { sessionStorage.setItem('sf-auth-return', window.location.pathname + window.location.search); } catch (_) {}
    var result = await sb.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback', skipBrowserRedirect: true }
    });
    if (result.error) throw result.error;
    if (!result.data.url) throw new Error('Google sign-in is unavailable. Please try again.');
    window.location.assign(result.data.url);
  };

  window.sfSignOut = async function () {
    await request('/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    // Clear this browser's Supabase session too, so it cannot silently log back in.
    await sb.auth.signOut({ scope: 'local' });
    window.sfAuthNavigate('/');
  };
  document.querySelectorAll('form[action="/auth/signout"]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      window.sfSignOut().catch(function () { window.sfToast?.('Could not sign out. Please try again.', 'error'); });
    });
  });

  // The callback page owns code exchange and navigation. Events never reload it.
  // Keep this callback synchronous; run I/O after Supabase releases its auth lock.
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'TOKEN_REFRESHED' && session && !callbackPage) {
      setTimeout(function () { window.sfSyncSession(session).catch(function () {}); }, 0);
    }
  });

  window.sfAuthReady = sb.auth.getSession().then(async function (result) {
    if (result.error) throw result.error;
    var session = result.data.session;
    if (!callbackPage && !returning && session && config.dataset.user !== session.user.id) {
      await window.sfSyncSession(session);
      window.sfAuthNavigate();
    }
    return session;
  }).catch(function () {
    if (!callbackPage) window.sfToast?.('Your sign-in could not be restored. Please sign in again.', 'error');
    return null;
  });
})();
