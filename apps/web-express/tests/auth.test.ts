const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
require('../src/types');
const { SupabaseSessionStore } = require('../src/lib/session-store');
const { sameOriginOnly } = require('../src/lib/security');
const { validateIdentity } = require('../src/lib/identity');
const { supabaseService } = require('../src/lib/supabase');
const auth = require('../src/routes/auth').default;
const api = require('../src/routes/api').default;

const rows = new Map();
let role = 'admin';
let permissionsUnavailable = false;
const database = {
  from(table) {
    assert.equal(table, 'web_sessions');
    return {
      select() { return { eq(_column, id) { return { async maybeSingle() { return { data: rows.get(id) ?? null, error: null }; } }; } }; },
      async upsert(row) { await new Promise(resolve => setTimeout(resolve, 10)); rows.set(row.id, row); return { error: null }; },
      delete() { return { async eq(_column, id) { rows.delete(id); return { error: null }; } }; }
    };
  }
};
const originalGetUser = supabaseService.auth.getUser;
const originalFrom = supabaseService.from;
const originalRpc = supabaseService.rpc;
let moderationArgs;
const secret = 'test-only-shared-secret-of-at-least-32-characters';
const servers = [];
const origins = [];

before(async () => {
  supabaseService.rpc = async (name, args) => {
    assert.equal(name, 'moderate_submission');
    moderationArgs = args;
    return { error: null };
  };
  supabaseService.auth.getUser = async token => ({
    data: { user: token === 'valid-access-token' ? { id: 'test-user', email: 'student@example.test', user_metadata: { role: 'admin', full_name: 'Test Student' } } : null },
    error: token === 'valid-access-token' ? null : { status: 401 }
  });
  supabaseService.from = table => {
    assert.equal(table, 'profiles');
    return { select() { return { eq() { return { async maybeSingle() { return { data: { role, display_name: 'Test Student' }, error: permissionsUnavailable ? { message: 'private database detail' } : null }; } }; } }; } };
  };
  for (let i = 0; i < 2; i++) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret, store: new SupabaseSessionStore(database, secret), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', maxAge: 60000 } }));
    app.use(validateIdentity);
    app.use('/auth', auth);
    app.use('/api', api);
    app.post('/write', sameOriginOnly, (_req, res) => res.json({ success: true }));
    app.get('/identity', (req, res) => res.json({ user: req.session.user }));
    app.use((_err, _req, res, _next) => res.status(500).json({ success: false, error: 'Service unavailable.' }));
    const server = await new Promise<import("node:http").Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    servers.push(server);
    origins.push(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`);
  }
});
after(async () => {
  supabaseService.auth.getUser = originalGetUser;
  supabaseService.from = originalFrom;
  supabaseService.rpc = originalRpc;
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
});

async function login() {
  const response = await fetch(origins[0] + '/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origins[0] },
    body: JSON.stringify({ access_token: 'valid-access-token', refresh_token: 'private-refresh-token' })
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.equal((await response.json() as { success: boolean; user: { id: string; role: string } | null }).success, true);
  return response.headers.get('set-cookie').split(';')[0];
}

test('session survives a different server instance; payload encrypted and cookie HTTP-only', async () => {
  const cookie = await login();
  const row = [...rows.values()][0];
  assert.equal(row.id.length, 64);
  assert.equal(row.payload.includes('private-refresh-token'), false);
  assert.equal(row.payload.includes('student@example.test'), false);
  const response = await fetch(origins[1] + '/auth/session', { headers: { Cookie: cookie } });
  assert.equal((await response.json() as { success: boolean; user: { id: string; role: string } | null }).user.id, 'test-user');
});

test('cross-site login, logout and writes are rejected; malformed referer does not crash', async () => {
  for (const path of ['/auth/session', '/auth/signout', '/write']) {
    const response = await fetch(origins[0] + path, { method: 'POST', headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  }
  const response = await fetch(origins[0] + '/write', { method: 'POST', headers: { Referer: 'not-a-url' } });
  assert.equal(response.status, 403);
});

test('session sync rejects non-JSON and invalid tokens', async () => {
  const form = await fetch(origins[0] + '/auth/session', { method: 'POST', body: 'access_token=anything' });
  assert.equal(form.status, 415);
  const invalid = await fetch(origins[0] + '/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: 'invalid' }) });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.headers.get('set-cookie'), null);
});

test('permissions come from DB and revoked staff roles take effect immediately', async () => {
  const cookie = await login();
  role = 'student';
  try {
    const response = await fetch(origins[1] + '/identity', { headers: { Cookie: cookie } });
    assert.equal((await response.json() as { success: boolean; user: { id: string; role: string } | null }).user.role, 'student');
  } finally { role = 'admin'; }
});

test('permission lookup failures fail closed without leaking internals', async () => {
  const cookie = await login();
  permissionsUnavailable = true;
  try {
    const response = await fetch(origins[1] + '/identity', { headers: { Cookie: cookie } });
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes('private database detail'), false);
  } finally { permissionsUnavailable = false; }
});

test('logout deletes shared session so another instance no longer recognizes it', async () => {
  const cookie = await login();
  const response = await fetch(origins[1] + '/auth/signout', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  await response.json();
  const check = await fetch(origins[0] + '/auth/session', { headers: { Cookie: cookie } });
  assert.equal((await check.json() as { success: boolean; user: { id: string; role: string } | null }).user, null);
});

test('expired sessions are removed and altered encrypted payloads are rejected', async () => {
  const store = new SupabaseSessionStore(database, secret);
  const read = id => new Promise((resolve, reject) => store.get(id, (err, data) => err ? reject(err) : resolve(data)));
  await new Promise<void>((resolve, reject) => store.set('expired-session', { cookie: { expires: new Date(0) }, user: null }, err => err ? reject(err) : resolve()));
  assert.equal(await read('expired-session'), null);
  await new Promise<void>((resolve, reject) => store.set('altered-session', { cookie: { expires: new Date(Date.now() + 60000) }, user: null }, err => err ? reject(err) : resolve()));
  // Pick the row inserted for this ID directly rather than relying on other tests.
  const id = require('crypto').createHash('sha256').update('altered-session').digest('hex');
  rows.get(id).payload = 'invalid.invalid.invalid';
  await assert.rejects(read('altered-session'), /Session storage unavailable/);
});

test('moderation endpoint commits staff note and status through the transactional RPC', async () => {
  const cookie = await login();
  const response = await fetch(origins[1] + '/api/submissions/12345678-1234-1234-1234-123456789abc/status', {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved', note: '  Scheduled for next term.  ' })
  });
  assert.equal(response.status, 200);
  await response.json();
  assert.equal(moderationArgs.p_note, 'Scheduled for next term.');
  assert.equal(moderationArgs.p_staff_id, 'test-user');
  assert.equal(moderationArgs.p_status, 'approved');
});

test('student cannot moderate even if their auth metadata says admin', async () => {
  const cookie = await login();
  role = 'student';
  moderationArgs = null;
  try {
    const response = await fetch(origins[1] + '/api/submissions/12345678-1234-1234-1234-123456789abc/status', {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' })
    });
    assert.equal(response.status, 403);
    await response.json();
    assert.equal(moderationArgs, null);
  } finally { role = 'admin'; }
});

export {};
