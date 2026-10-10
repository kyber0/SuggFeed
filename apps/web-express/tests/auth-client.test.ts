const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/auth.js'), 'utf8');

function browser({ savedCookie = true, failSync = false, pathname = '/feed' } = {}) {
  const calls = [];
  let listener;
  const auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange(callback) { listener = callback; },
    signInWithOAuth: async options => { calls.push(['oauth', options]); return { data: { url: 'https://example.supabase.co/auth/v1/authorize' } }; },
    signOut: async options => calls.push(['signout', options])
  };
  const window: Record<string, any> = {
    supabase: { createClient(_url, _key, options) { calls.push(['client', options]); return { auth }; } },
    location: { pathname, search: '', hash: '', origin: 'https://www.suggfeed.me', reload: () => calls.push(['reload']), replace: path => calls.push(['replace', path]), assign: url => calls.push(['assign', url]) },
    dispatchEvent() {}
  };
  const context = {
    window, URLSearchParams, AbortController, CustomEvent: class {},
    sessionStorage: { setItem() {} },
    document: { getElementById: () => ({ dataset: { url: 'https://example.supabase.co', key: 'public-key', user: '' } }), querySelectorAll: () => [] },
    setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push(['fetch', url, options.method]);
      const post = options.method === 'POST';
      return { ok: !(post && failSync), json: async () => ({ success: !(post && failSync), user: (post || savedCookie) ? { id: 'student' } : null, error: failSync ? 'Service unavailable' : undefined }) };
    }
  };
  vm.runInNewContext(source, context);
  return { window, calls, listener, auth };
}
const signedIn = { access_token: 'test-access', refresh_token: 'test-refresh', user: { id: 'student' } };

test('Google requests PKCE callback on custom domain', async () => {
  const { window, calls } = browser();
  await window.sfStartGoogleSignIn();
  assert.equal(calls.find(call => call[0] === 'client')[1].auth.flowType, 'pkce');
  assert.equal(calls.find(call => call[0] === 'oauth')[1].options.redirectTo, 'https://www.suggfeed.me/auth/callback');
});
test('duplicate sync events produce one POST; auth event itself does not reload', async () => {
  const { window, calls, listener } = browser();
  const a = window.sfSyncSession(signedIn);
  const b = window.sfSyncSession(signedIn);
  assert.equal(a, b);
  await a;
  listener('SIGNED_IN', signedIn);
  assert.equal(calls.filter(call => call[0] === 'fetch' && call[2] === 'POST').length, 1);
  assert.equal(calls.filter(call => call[0] === 'reload').length, 0);
});
test('cookie persistence failure does not navigate or reload', async () => {
  const { window, calls } = browser({ savedCookie: false });
  await assert.rejects(window.sfCompleteSignIn(signedIn), /could not be saved/);
  assert.equal(calls.some(call => call[0] === 'reload' || call[0] === 'replace'), false);
});
test('failed session response does not navigate', async () => {
  const { window, calls } = browser({ failSync: true });
  await assert.rejects(window.sfCompleteSignIn(signedIn), /Service unavailable/);
  assert.equal(calls.some(call => call[0] === 'reload'), false);
});
test('navigation stays on current origin and logout clears both sessions', async () => {
  const { window, calls } = browser();
  window.sfAuthNavigate('https://attacker.test');
  assert.equal(calls.some(call => call[0] === 'replace'), false);
  const second = browser();
  await second.window.sfSignOut();
  assert.equal(second.calls.some(call => call[0] === 'signout'), true);
  assert.equal(second.calls.find(call => call[0] === 'replace')[1], '/');
});

export {};
