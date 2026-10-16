import { withTestSchool } from './support/school-context';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import engagementRouter from '../src/routes/engagement';
import apiRouter from '../src/routes/api';
import { loadNotifications, loadFollowing, parseNotificationCursor } from '../src/lib/engagement';
import { supabaseService } from '../src/lib/supabase';
import { sameOriginOnly } from '../src/lib/security';

const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const cursorFor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('notification cursor validates shape, UUID, timestamp and query-injection characters', () => {
  const value = { created_at: '2026-10-11T10:00:00.123456+08:00', id };
  assert.equal(parseNotificationCursor(undefined), null); assert.equal(parseNotificationCursor(''), null);
  assert.deepEqual(parseNotificationCursor(cursorFor(value)), value);
  for (const invalid of [null, ['abc'], 'a'.repeat(257), 'bad!', cursorFor({ ...value, id: 'bad' }),
    cursorFor({ ...value, created_at: '2026-10-11T10:00:00Z),id.gt.0' }), cursorFor({ ...value, created_at: 'tomorrow' })]) {
    assert.throws(() => parseNotificationCursor(invalid), /Invalid notification cursor/);
  }
});

test('notification loader scopes account and visibility, keyset-paginates, and excludes private response fields', async () => {
  const original = supabaseService.from; const calls: any[][][] = [];
  const rows = Array.from({ length: 21 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    submission_id: id, update_id: otherId, kind: 'milestone', title: 'Library improvement', office_label: 'School administration',
    created_at: '2026-10-11T10:00:00.123Z', read_at: null, user_id: 'PRIVATE', update: { body: 'PRIVATE' }, submission: { owner: 'PRIVATE' } }));
  supabaseService.from = ((table) => {
    assert.equal(table, 'idea_notifications'); const record: any[][] = []; calls.push(record);
    let countOnly = false; const query: any = { then(resolve) { resolve({ error: null, data: countOnly ? null : rows, count: 42 }); } };
    for (const method of ['select', 'eq', 'in', 'is', 'or', 'order', 'limit']) query[method] = (...args) => {
      record.push([method, ...args]); if (method === 'select') countOnly = !!args[1]?.head; return query;
    };
    return query;
  }) as any;
  try {
    const cursor = { created_at: '2026-10-11T10:00:00Z', id: otherId };
    const result = await loadNotifications(id, cursor);
    assert.equal(result.notifications.length, 20); assert.equal(result.unreadCount, 42);
    assert.deepEqual(parseNotificationCursor(result.nextCursor), { created_at: rows[19].created_at, id: rows[19].id });
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    for (const record of calls) {
      assert.ok(record.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === id));
      assert.ok(record.some(c => c[0] === 'in' && c[1] === 'submission.status'));
      assert.ok(record.some(c => c[0] === 'eq' && c[1] === 'update.visibility' && c[2] === 'public'));
      assert.ok(record.some(c => c[0] === 'is' && c[1] === 'update.deleted_at' && c[2] === null));
    }
    assert.ok(calls[0].some(c => c[0] === 'or' && c[1] === `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${otherId})`));
    assert.deepEqual(calls[0].filter(c => c[0] === 'order').map(c => c[1]), ['created_at', 'id']);
    assert.ok(calls[0].some(c => c[0] === 'limit' && c[1] === 21));
    assert.ok(calls[1].some(c => c[0] === 'is' && c[1] === 'read_at' && c[2] === null));
  } finally { supabaseService.from = original; }
});

test('follow reads verify public idea first and scope account identity', async () => {
  const original = supabaseService.from; const calls: any[][] = []; let exists = false;
  supabaseService.from = ((table) => {
    const query: any = { async maybeSingle() { return { error: null, data: table === 'submissions' ? (exists ? { id } : null) : { submission_id: id } }; } };
    for (const method of ['select', 'eq', 'in']) query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
    return query;
  }) as any;
  try {
    assert.equal(await loadFollowing(otherId, id), null);
    assert.equal(calls.some(c => c[0] === 'idea_follows'), false);
    exists = true; assert.equal(await loadFollowing(otherId, id), true);
    assert.ok(calls.some(c => c[0] === 'idea_follows' && c[1] === 'eq' && c[2] === 'user_id' && c[3] === otherId));
  } finally { supabaseService.from = original; }
});

test('engagement routes enforce session identity, CSRF, payloads, private caching and scoped read marking', async () => {
  const originalRpc = supabaseService.rpc; const originalFrom = supabaseService.from;
  let signedIn = false; let rpcError: { code: string } | null = null; let marked = false; const calls: any[] = [];
  supabaseService.rpc = (async (name, args) => { calls.push([name, args]); return { error: rpcError, data: name === 'mark_idea_notification_read' ? marked : null }; }) as any;
  supabaseService.from = ((table) => ({ select() { return this; }, eq() { return this; }, in() { return this; },
    async maybeSingle() { return { error: null, data: table === 'submissions' ? { id } : null }; } })) as any;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { user: signedIn ? { id, role: 'student' } : undefined } as any; next(); });
  app.use(sameOriginOnly); app.use(withTestSchool); app.use('/api', engagementRouter);
  app.use((_err, _req, res, _next) => res.status(500).json({ success: false, error: 'Unexpected error.' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const send = (endpoint: string, method = 'GET', body?: unknown, source = origin) => fetch(origin + '/api' + endpoint,
    { method, headers: { 'Content-Type': 'application/json', Origin: source }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    for (const endpoint of ['/notifications', '/follows/' + id]) {
      const response = await send(endpoint); assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    signedIn = true;
    assert.equal((await send('/follows/bad', 'POST', { following: true })).status, 400);
    assert.equal((await send('/follows/' + id, 'POST', { following: 'true' })).status, 400);
    assert.equal((await send('/follows/' + id, 'POST', { following: true }, 'https://attacker.test')).status, 403);
    assert.equal((await send('/notifications?cursor=invalid!')).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await send('/follows/' + otherId, 'POST', { following: true, userId: 'ignored' })).status, 200);
    assert.deepEqual(calls.at(-1), ['set_idea_follow', { p_user_id: id, p_submission_id: otherId, p_following: true }]);
    rpcError = { code: 'P0002' }; assert.equal((await send('/follows/' + id, 'POST', { following: true })).status, 404);
    rpcError = { code: '42501' }; assert.equal((await send('/follows/' + id, 'POST', { following: true })).status, 401);
    rpcError = null;
    assert.equal((await send('/notifications/' + otherId + '/read', 'PATCH')).status, 404);
    marked = true; const response = await send('/notifications/' + otherId + '/read', 'PATCH'); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(calls.at(-1), ['mark_idea_notification_read', { p_user_id: id, p_notification_id: otherId }]);
  } finally {
    supabaseService.rpc = originalRpc; supabaseService.from = originalFrom;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('Express vote routes use one database RPC and never accept a browser-supplied account ID', async () => {
  const original = supabaseService.rpc; const calls: any[] = []; let signedIn = false;
  supabaseService.rpc = (async (name, args) => { calls.push([name, args]); return { error: null, data: { vote_count: 41, already_voted: false } }; }) as any;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { user: signedIn ? { id, role: 'student' } : undefined } as any; req.cookies = { sf_anon_token: otherId }; next(); });
  app.use(withTestSchool); app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const vote = (idea = otherId) => fetch(origin + '/api/vote/' + idea, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'ignored' }) });
  try {
    assert.equal((await vote('bad')).status, 400); assert.equal(calls.length, 0);
    const response = await vote(); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, vote_count: 41, already_voted: false });
    assert.deepEqual(calls[0], ['cast_idea_vote', { p_submission_id: otherId, p_user_id: null, p_anon_token: otherId }]);
    signedIn = true; await vote();
    assert.deepEqual(calls[1], ['cast_idea_vote', { p_submission_id: otherId, p_user_id: id, p_anon_token: null }]);
  } finally { supabaseService.rpc = original; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
