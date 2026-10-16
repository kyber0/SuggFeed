import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { supabasePlatform } from '../src/lib/supabase';
import { sharedWriteBudget, sharedAuthBudget } from '../src/lib/shared-rate-limit';
import { runWithSchool } from '../src/lib/school-scope';

const secret = 'test-only-budget-secret-of-at-least-32-characters';
const originalRpc = supabasePlatform.rpc;
const env = Object.fromEntries(['SESSION_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
const servers: Server[] = [], origins: string[] = [];
const counts = new Map<string, number>();
let calls: { p_key: string; p_limit: number; p_window_seconds: number }[] = [];
let failure: 'error' | 'throw' | 'malformed' | null = null;

before(async () => {
  Object.assign(process.env, { SESSION_SECRET: secret, SUPABASE_URL: 'https://mock.invalid', SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key' });
  supabasePlatform.rpc = (async (name, args) => {
    assert.equal(name, 'consume_request_budget');
    const budget = args as typeof calls[number]; calls.push(budget);
    if (failure === 'throw') throw new Error('private provider error');
    if (failure === 'error') return { data: null, error: { message: 'private provider error' } };
    if (failure === 'malformed') return { data: [{ allowed: false, retry_after: 'unsafe-header' }], error: null };
    const count = (counts.get(budget.p_key) || 0) + 1; counts.set(budget.p_key, count);
    return { data: [{ allowed: count <= budget.p_limit, retry_after: 900 }], error: null };
  }) as unknown as typeof supabasePlatform.rpc;
  for (let i = 0; i < 2; i++) {
    const app = express(); app.set('trust proxy', true);
    app.use((req, _res, next) => {
      req.session = { user: req.headers['x-test-account'] ? { id: String(req.headers['x-test-account']) } : null } as any;
      if (req.headers['x-test-school']) return runWithSchool({ id: String(req.headers['x-test-school']), slug: 'test', name: 'Test', actorId: null, role: null }, next);
      next();
    });
    app.use('/api', sharedWriteBudget);
    app.use('/auth', sharedAuthBudget);
    app.use('/schools', sharedAuthBudget);
    app.use((_req, res) => res.json({ success: true }));
    const server = await new Promise<Server>(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    servers.push(server); origins.push(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  }
});
beforeEach(() => { counts.clear(); calls = []; failure = null; });
after(async () => {
  supabasePlatform.rpc = originalRpc;
  for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await Promise.all(servers.map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
});
const request = (path: string, instance = 0, headers: Record<string,string> = {}, method = 'POST') => fetch(origins[instance] + path, { method, headers });

test('auth budget is shared by separate server instances; school invitation paths do not create keys', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await request('/auth/session', i % 2)).status, 200);
  const rejected = await request('/schools/invitations/private-token', 1);
  assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '900');
  assert.equal(counts.size, 1); assert.match(calls[0].p_key, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].p_key, createHmac('sha256', secret).update(JSON.stringify(['request-budget-v1','auth','ip','127.0.0.1'])).digest('hex'));
});

test('account budget spans IPs, trusted school has its own budget, and write/auth remain separate', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await request('/auth/session', i % 2, { 'x-test-account': 'account-a', 'x-forwarded-for': `192.0.2.${i+1}` })).status, 200);
  assert.equal((await request('/auth/session', 1, { 'x-test-account': 'account-a', 'x-forwarded-for': '198.51.100.1' })).status, 429);
  assert.equal((await request('/api/votes', 0, { 'x-test-account': 'account-a', 'x-test-school': 'school-a' })).status, 200);
  assert.deepEqual(calls.slice(-3).map(call => call.p_limit), [200,120,1000]);
  assert.ok(calls.every(call => call.p_window_seconds === 900));
  assert.equal((await request('/api/votes', 0, { 'x-test-account': 'account-a', 'x-test-school': 'school-b' })).status, 200);
  assert.notEqual(calls.at(-1)?.p_key, calls.at(-4)?.p_key);
});

test('GET, HEAD, OPTIONS and static requests never consume shared budgets', async () => {
  for (const method of ['GET','HEAD','OPTIONS']) for (const path of ['/api/feed','/auth/session','/schools']) assert.equal((await request(path, 0, {}, method)).status, 200);
  assert.equal((await request('/assets/app.js', 0, {}, 'GET')).status, 200);
  assert.equal(calls.length, 0);
});

test('missing configuration, provider failures and malformed responses fail closed without exposing details', async () => {
  for (const key of Object.keys(env)) {
    const saved = process.env[key]; delete process.env[key];
    assert.equal((await request('/auth/session')).status, 503);
    process.env[key] = saved;
  }
  assert.equal(calls.length, 0);
  for (const mode of ['error','throw','malformed'] as const) {
    failure = mode; const response = await request('/api/votes');
    assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), null);
    assert.equal((await response.text()).includes('private provider error'), false);
  }
});
