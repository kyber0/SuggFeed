import { withTestSchool } from './support/school-context';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import progressRouter from '../src/routes/progress';
import { supabase, supabaseService } from '../src/lib/supabase';
import { validateProgress, manilaToday, listPublicProgress, listStaffProgress, ProgressError } from '../src/lib/progress';
import { sameOriginOnly } from '../src/lib/security';

const id = '00000000-0000-4000-8000-000000000001';
const requestId = '00000000-0000-4000-8000-000000000002';
const baseline = { requestId, updatedAt: '2026-10-10T10:00:00.123Z', kind: 'update', body: '  The school is reviewing equipment options.  ', visibility: 'public', occurredOn: '2026-10-11' };

test('progress validates audience, text, estimate steps, blocked reasons, and the Manila calendar', () => {
  const now = new Date('2026-10-10T16:30:00Z');
  assert.equal(manilaToday(now), '2026-10-11');
  const valid = validateProgress(baseline, now);
  assert.equal(valid.body, 'The school is reviewing equipment options.');
  assert.equal(valid.percent, null); assert.equal(valid.notify, false);
  assert.equal(validateProgress({ ...baseline, kind: 'milestone', percent: 35 }, now).notify, true);
  assert.equal(validateProgress({ ...baseline, kind: 'milestone', visibility: 'staff', notify: true }, now).notify, false);
  assert.equal(validateProgress({ ...baseline, occurredOn: '2026-09-27' }, now).occurredOn, '2026-09-27');
  assert.equal(validateProgress({ ...baseline, occurredOn: undefined }, now).occurredOn, '2026-10-11');
  for (const change of [
    { requestId: 'bad' }, { updatedAt: 'yesterday' }, { kind: 'reopen' }, { visibility: 'student' },
    { body: '   ' }, { body: 'x'.repeat(601) }, { percent: '20' }, { percent: 26 }, { percent: 100 },
    { kind: 'completed', percent: 90 }, { kind: 'blocked' }, { blockedReason: 'budget' },
    { nextStep: 'x'.repeat(201) }, { nextStep: 10 }, { notify: 'true' },
    { occurredOn: '2026-10-12' }, { occurredOn: '2026-09-26' }, { occurredOn: '2026-02-30' },
  ]) assert.throws(() => validateProgress({ ...baseline, ...change }, now), ProgressError);
  assert.equal(validateProgress({ ...baseline, kind: 'blocked', blockedReason: 'approval', percent: 30 }, now).blockedReason, 'approval');
  assert.equal(validateProgress({ ...baseline, kind: 'completed', percent: 100 }, now).percent, 100);
});

test('public progress uses a database-filtered RPC and additionally whitelists response fields', async () => {
  const original = supabase.rpc; let calls = 0;
  supabase.rpc = (async (name, args) => {
    if (name === 'read_public_idea_update_files') return { error: null, data: [] };
    calls++; assert.equal(name, 'read_public_idea_updates'); assert.deepEqual(args, { p_submission_id: id });
    return { error: null, data: [{ id, kind: 'update', body: 'Public update', percent: null, occurred_on: '2026-10-11',
      office_label: 'School administration', created_at: '2026-10-11T01:00:00Z',
      posted_by: 'PRIVATE', request_payload: { secret: 'PRIVATE' }, visibility: 'public', request_id: 'PRIVATE' }] };
  }) as any;
  try {
    const result = await listPublicProgress(id);
    assert.equal(result.length, 1); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.deepEqual(Object.keys(result[0]), ['id', 'kind', 'body', 'percent', 'blocked_reason', 'next_step', 'occurred_on', 'office_label', 'created_at', 'files']);
    assert.deepEqual(await listPublicProgress('not-an-id'), []); assert.equal(calls, 1);
  } finally { supabase.rpc = original; }
});

test('staff history scopes one submission, excludes deleted events, and has a bounded stable order', async () => {
  const original = supabaseService.from; const calls: any[] = [];
  const query: any = { then(resolve) { resolve({ error: null, data: [] }); } };
  for (const method of ['select', 'eq', 'is', 'order', 'limit']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  supabaseService.from = ((table) => { assert.equal(table, 'idea_updates'); return query; }) as any;
  try {
    await listStaffProgress(id, id);
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'submission_id' && c[2] === id));
    assert.ok(calls.some(c => c[0] === 'is' && c[1] === 'deleted_at' && c[2] === null));
    assert.deepEqual(calls.filter(c => c[0] === 'order').map(c => c[1]), ['occurred_on', 'created_at', 'id']);
    assert.deepEqual(calls.at(-1), ['limit', 100]);
    assert.equal(String(calls[0][1]).includes('request_payload'), false);
  } finally { supabaseService.from = original; }
});

test('progress routes protect identity, roles, CSRF, UUIDs, payloads, and stale-write errors', async () => {
  const originalRpc = supabaseService.rpc; const originalFrom = supabaseService.from;
  let role: string | null = null; let code: string | null = null; let called = 0; let replayed = false;
  supabaseService.rpc = (async (name, args) => {
    called++; assert.equal(name, 'post_idea_update'); assert.equal(args.p_staff_id, id);
    assert.equal(args.p_percent, null); assert.equal(args.p_notify, false);
    return { error: code ? { code } : null, data: { update: { id, body: 'Public update' }, replayed } };
  }) as any;
  supabaseService.from = ((table) => {
    assert.equal(table, 'staff_submission_queue');
    return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { error: null, data: { id, status: 'in_progress', updated_at: '2026-10-11T01:00:00Z', staff_note: 'Response', progress_percent: 35 } }; } };
  }) as any;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { user: role ? { id, role } : undefined } as any; next(); });
  app.use(sameOriginOnly); app.use(withTestSchool); app.use('/api/staff', progressRouter);
  app.use((_err, _req, res, _next) => res.status(500).json({ success: false, error: 'Unexpected error.' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const payload = { ...baseline, body: 'Public update', occurredOn: manilaToday() };
  const send = (body: unknown = payload, source = origin, itemId = id) => fetch(origin + '/api/staff/submissions/' + itemId + '/updates',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source }, body: JSON.stringify(body) });
  try {
    assert.equal((await send()).status, 401);
    role = 'student'; assert.equal((await send()).status, 403);
    role = 'moderator'; assert.equal((await send(payload, 'https://attacker.test')).status, 403);
    assert.equal((await send(payload, origin, 'bad')).status, 400);
    assert.equal((await send({ ...payload, body: '' })).status, 400); assert.equal(called, 0);
    for (const [rpcCode, expected] of [['40001', 409], ['23505', 409], ['P0002', 404], ['42501', 403], ['22023', 400], ['secret-internal-error', 500]] as const) {
      code = rpcCode; const response = await send(); assert.equal(response.status, expected);
      assert.equal(JSON.stringify(await response.json()).includes(rpcCode), false);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
    code = null; let response = await send(); assert.equal(response.status, 201);
    const result = await response.json() as any; assert.equal(result.submission.progress_percent, 35);
    replayed = true; response = await send(); assert.equal(response.status, 200);
  } finally {
    supabaseService.rpc = originalRpc; supabaseService.from = originalFrom;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('progress migration encodes atomic publication, replay protection, no private projection, and restricted public reads', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/202610110003_public_progress.sql'), 'utf8');
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /request_id uuid NOT NULL UNIQUE/);
  assert.match(sql, /FROM public\.submissions WHERE id = p_submission_id FOR UPDATE/);
  assert.ok(sql.indexOf('previous_update.request_payload <> payload') < sql.indexOf('p_expected_updated_at <> s.updated_at'));
  assert.match(sql, /IF p_visibility = 'public' THEN[\s\S]*UPDATE public\.submissions/);
  assert.match(sql, /IF new_status IS DISTINCT FROM s.status THEN[\s\S]*INSERT INTO public.status_history/);
  assert.match(sql, /p_kind <> 'correction'/);
  assert.match(sql, /Backdated history cannot overwrite current progress/);
  assert.match(sql, /u\.visibility = 'public' AND u\.deleted_at IS NULL[\s\S]*s\.status::text IN \('approved','in_progress','resolved'\)/);
  assert.match(sql, /REVOKE ALL ON public.idea_updates FROM public, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.post_idea_update\([^;]+\) TO service_role/);
  assert.match(sql, /OLD.status::text = 'resolved'[\s\S]*NEW.progress_percent := NULL/);
});

 test('progress retains the shared error identity for evidence callers', async () => {
  const {ProgressError: LeafError}=await import('../src/lib/progress-error');
  assert.equal(ProgressError,LeafError);
  const error=new LeafError(409,'Refresh before retrying.','STALE');
  assert.ok(error instanceof ProgressError);assert.equal(error.status,409);assert.equal(error.code,'STALE');
 });
