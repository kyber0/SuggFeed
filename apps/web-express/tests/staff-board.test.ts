import { withTestSchool } from './support/school-context';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { BOARD_STAGES, boardFilters, loadStaffBoard } from '../src/lib/staff-board';
import { communityPages, communityRouter } from '../src/routes/community';
import { supabaseService } from '../src/lib/supabase';

type QueryCall = { table: string; calls: unknown[][]; status?: string; head?: boolean; start?: number; end?: number };
function mockBoard(counts: Partial<Record<string, number>>, invalidRange = false, countForQuery?: (query: QueryCall, attempt: number) => number) {
  const original = supabaseService.from;
  const queries: QueryCall[] = [];
  const attempts: Record<string, number> = {};
  supabaseService.from = ((table: string) => {
    const record: QueryCall = { table, calls: [] };
    queries.push(record);
    const query: any = {};
    for (const method of ['select', 'eq', 'or', 'order', 'range']) {
      query[method] = (...args: any[]) => {
        record.calls.push([method, ...args]);
        if (method === 'select') record.head = args[1]?.head;
        if (method === 'eq' && args[0] === 'status') record.status = args[1];
        if (method === 'range') [record.start, record.end] = args;
        return query;
      };
    }
    query.in = () => query;
    query.then = (resolve: (value: unknown) => unknown) => {
      if (table === 'profiles') return resolve({ data: [], error: null });
      assert.equal(table, 'staff_submission_queue');
      const attempt = attempts[record.status!] ?? 0;
      attempts[record.status!] = attempt + 1;
      const count = countForQuery ? countForQuery(record, attempt) : counts[record.status!] ?? 0;
      if (invalidRange && !record.head && record.start! > 0 && record.start! >= count) {
        return resolve({ data: null, count: null, error: { code: 'PGRST103' } });
      }
      const start = record.start ?? 0;
      const end = Math.min(record.end ?? count - 1, count - 1);
      const data = record.head ? null : Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => ({
        id: `${record.status}-${start + index + 1}`, title: 'Matching campus idea', status: record.status,
        created_at: '2026-10-12T00:00:00Z', updated_at: '2026-10-12T00:00:00Z',
      }));
      return resolve({ data, count, error: null });
    };
    return query;
  }) as any;
  return { queries, restore: () => { supabaseService.from = original; } };
}

test('work-board filters strictly normalize search, size, sort and independent lane pages', () => {
  assert.deepEqual(boardFilters({ search: '  library  ', sort: 'newest', pageSize: '12', pendingPage: '2', approvedPage: '3' }), {
    search: 'library', sort: 'newest', pageSize: 12,
    pages: { pending: 2, approved: 3, in_progress: 1, resolved: 1, rejected: 1 },
  });
  const invalid = boardFilters({ search: ['secret'], pageSize: '200', sort: 'invalid', pendingPage: '2junk', approvedPage: '-1', resolvedPage: '0', rejectedPage: ['2'] });
  assert.equal(invalid.search, '');
  assert.equal(invalid.pageSize, 6);
  assert.equal(invalid.sort, 'oldest');
  assert.ok(Object.values(invalid.pages).every(page => page === 1));
  assert.equal(boardFilters({ search: 'a'.repeat(150), pageSize: '24' }).search.length, 120);
  assert.equal(boardFilters({ pageSize: '24' }).pageSize, 24);
});

test('work-board fetches exact per-stage counts and filters before bounded stable pagination without a global cutoff', async () => {
  const mock = mockBoard({ pending: 256, approved: 18, in_progress: 7, resolved: 20, rejected: 0 });
  try {
    const result = await loadStaffBoard(boardFilters({ search: 'library', sort: 'newest', pageSize: '6', pendingPage: '2', approvedPage: '3' }));
    assert.equal(result.totalCount, 301);
    assert.equal(result.items.length, 24);
    assert.equal(result.lanes.length, BOARD_STAGES.length);
    const pending = result.lanes[0];
    assert.deepEqual({ count: pending.count, page: pending.page, pageCount: pending.pageCount, from: pending.from, to: pending.to, hasPrevious: pending.hasPrevious, hasNext: pending.hasNext }, {
      count: 256, page: 2, pageCount: 43, from: 7, to: 12, hasPrevious: true, hasNext: true,
    });
    assert.equal(result.lanes[1].page, 3);
    assert.equal(result.lanes[1].hasNext, false);
    assert.deepEqual({ page: result.lanes[4].page, pageCount: result.lanes[4].pageCount, from: result.lanes[4].from, to: result.lanes[4].to }, { page: 1, pageCount: 1, from: 0, to: 0 });
    assert.equal(mock.queries.length, 5);
    for (const query of mock.queries) {
      assert.deepEqual(query.calls[0], ['select', '*', { count: 'exact', head: false }]);
      assert.deepEqual(query.calls[1], ['eq', 'status', query.status]);
      assert.deepEqual(query.calls[2], ['or', 'title.ilike."%library%",description.ilike."%library%"']);
      assert.deepEqual(query.calls[3], ['order', 'created_at', { ascending: false }]);
      assert.deepEqual(query.calls[4], ['order', 'id', { ascending: false }]);
      assert.equal(query.calls.at(-1)?.[0], 'range');
      assert.ok(query.end! - query.start! < 6);
    }
  } finally { mock.restore(); }
});

test('work-board clamps stale lane pages and re-queries only the affected lane', async () => {
  const mock = mockBoard({ pending: 13, approved: 9, resolved: 0 });
  try {
    const result = await loadStaffBoard(boardFilters({ pendingPage: '99', approvedPage: '2', rejectedPage: '7' }));
    assert.equal(result.filters.pages.pending, 3);
    assert.equal(result.filters.pages.approved, 2);
    assert.equal(result.filters.pages.rejected, 1);
    assert.deepEqual(result.lanes[0].items.map(item => item.id), ['pending-13']);
    assert.equal(result.lanes[0].from, 13);
    assert.equal(result.lanes[0].to, 13);
    assert.equal(mock.queries.filter(query => query.status === 'pending').length, 2);
    assert.equal(mock.queries.filter(query => query.status === 'approved').length, 1);
    assert.equal(mock.queries.filter(query => query.status === 'rejected').length, 1, 'known-empty lanes need no clamped range query');
  } finally { mock.restore(); }
});

test('work-board recovers a PostgREST invalid-range response using a lane-only count and clamped fetch', async () => {
  const mock = mockBoard({ pending: 13, approved: 6 }, true);
  try {
    const result = await loadStaffBoard(boardFilters({ pendingPage: '40' }));
    assert.equal(result.filters.pages.pending, 3);
    assert.equal(result.lanes[0].count, 13);
    assert.equal(result.lanes[0].items[0].id, 'pending-13');
    const queries = mock.queries.filter(query => query.status === 'pending');
    assert.equal(queries.length, 3);
    assert.equal(queries[1].head, true);
    assert.equal(queries[1].start, undefined);
    assert.deepEqual(queries[2].calls.at(-1), ['range', 12, 17]);
    assert.equal(mock.queries.filter(query => query.status === 'approved').length, 1);
  } finally { mock.restore(); }
});

test('work-board re-clamps when rows disappear during the clamped fetch', async () => {
  const mock = mockBoard({}, false, (query, attempt) => query.status === 'pending' ? [13, 7, 7][attempt] ?? 7 : 6);
  try {
    const result = await loadStaffBoard(boardFilters({ pendingPage: '99' }));
    const lane = result.lanes[0];
    assert.equal(lane.page, 2);
    assert.equal(lane.pageCount, 2);
    assert.equal(lane.count, 7);
    assert.equal(lane.from, 7);
    assert.equal(lane.to, 7);
    assert.equal(lane.items[0].id, 'pending-7');
    assert.equal(result.filters.pages.pending, 2);
    assert.equal(mock.queries.filter(query => query.status === 'pending').length, 3);
    assert.equal(mock.queries.filter(query => query.status === 'approved').length, 1);
  } finally { mock.restore(); }
});

test('work-board handles a second invalid range while clamping and returns a consistent lane', async () => {
  const mock = mockBoard({}, true, (query, attempt) => query.status === 'pending' ? [13, 13, 7, 7, 7][attempt] ?? 7 : 6);
  try {
    const result = await loadStaffBoard(boardFilters({ pendingPage: '99' }));
    const lane = result.lanes[0];
    assert.equal(lane.page, 2);
    assert.equal(lane.pageCount, 2);
    assert.equal(lane.items[0].id, 'pending-7');
    assert.equal(mock.queries.filter(query => query.status === 'pending' && !query.head).length, 3);
    assert.equal(mock.queries.filter(query => query.status === 'pending' && query.head).length, 2);
  } finally { mock.restore(); }
});

test('work-board returns a clean empty lane after an invalid range recount reaches zero', async () => {
  const mock = mockBoard({ pending: 0 }, true);
  try {
    const result = await loadStaffBoard(boardFilters({ pendingPage: '99' }));
    const lane = result.lanes[0];
    assert.deepEqual({ page: lane.page, pageCount: lane.pageCount, count: lane.count, from: lane.from, to: lane.to, items: lane.items }, {
      page: 1, pageCount: 1, count: 0, from: 0, to: 0, items: [],
    });
    assert.equal(mock.queries.filter(query => query.status === 'pending').length, 2, 'zero count needs no extra range fetch');
    assert.equal(result.filters.pages.pending, 1);
  } finally { mock.restore(); }
});

test('work-board bounds repeated concurrent deletion retries instead of returning page 7 of 3', async () => {
  const mock = mockBoard({}, false, (query, attempt) => query.status === 'pending' ? [37, 13, 1][attempt] ?? 1 : 6);
  try {
    await assert.rejects(loadStaffBoard(boardFilters({ pendingPage: '99' })), /work board changed while loading/i);
    assert.equal(mock.queries.filter(query => query.status === 'pending').length, 3);
    assert.equal(mock.queries.filter(query => query.status === 'approved').length, 1);
  } finally { mock.restore(); }
});

test('work-board JSON and page routes enforce staff access, no-store and normalized independent filters', async () => {
  const mock = mockBoard({ pending: 13, approved: 9 });
  let role: string | null = null;
  const app = express();
  app.use((req, res, next) => {
    req.session = { user: role ? { id: '10000000-0000-4000-8000-000000000001', role } : undefined } as any;
    res.render = ((view: string, data: unknown) => res.json({ view, data })) as any;
    next();
  });
  app.use(withTestSchool);
  app.use('/api/community', communityRouter);
  app.use(communityPages);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const anonymous = await fetch(origin + '/api/community/staff/board');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get('cache-control'), 'private, no-store');
    assert.equal((await fetch(origin + '/admin/board', { redirect: 'manual' })).headers.get('location'), '/admin');
    role = 'student';
    assert.equal((await fetch(origin + '/api/community/staff/board')).status, 403);
    assert.equal((await fetch(origin + '/admin/board')).status, 403);
    assert.equal(mock.queries.length, 0, 'unauthorized users never query the private queue');
    role = 'moderator';
    const params = '?search=library&sort=newest&pageSize=12&pendingPage=40&approvedPage=1';
    const response = await fetch(origin + '/api/community/staff/board' + params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body: any = await response.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.filters, { search: 'library', sort: 'newest', pageSize: 12, pages: { approved: 1, in_progress: 1, resolved: 1 } });
    assert.equal(body.totalCount, body.lanes.reduce((sum:number,lane:any)=>sum+lane.count,0));
    role = 'admin';
    const page = await fetch(origin + '/admin/board' + params);
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    const rendered: any = await page.json();
    assert.equal(rendered.view, 'staff-board');
    assert.equal(rendered.data.activeSection, 'board');
    assert.deepEqual(rendered.data.filters, body.filters);
    assert.deepEqual(rendered.data.lanes.map((lane:any)=>lane.status), ['approved','in_progress','resolved']);
    assert.deepEqual(rendered.data.members, []);
  } finally {
    mock.restore();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
