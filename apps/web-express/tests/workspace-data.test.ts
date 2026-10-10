import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase, supabaseService } from '../src/lib/supabase';
import { loadModerationCounts, loadAllSubmissionsForAdmin, loadRoadmapSubmissions, invalidateCache } from '../src/lib/data';

test('dashboard counts include every status, independent of the displayed page', async () => {
  const original = supabaseService.from;
  const counts = { pending: 42, approved: 20, in_progress: 6, resolved: 31, rejected: 2 };
  supabaseService.from = (() => ({
    select(_columns, options) {
      assert.deepEqual(options, { count: 'exact', head: true });
      return { eq: async (_column, status) => ({ count: counts[status], error: null }) };
    },
  })) as any;
  try {
    assert.deepEqual(await loadModerationCounts(), { ...counts, all: 101 });
  } finally { supabaseService.from = original; }
});

test('staff search is applied before pagination and existing response notes are loaded', async () => {
  const original = supabaseService.from;
  const calls: Array<[string, ...unknown[]]> = [];
  const query: any = {};
  for (const method of ['select', 'eq', 'or', 'order', 'range']) {
    query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
  }
  query.then = resolve => resolve({ data: [], count: 40, error: null });
  supabaseService.from = (() => query) as any;
  try {
    await loadAllSubmissionsForAdmin({ page: 2, status: 'pending', search: 'library' });
    assert.match(String(calls.find(c => c[0] === 'select')![1]), /staff_note/);
    assert.deepEqual(calls.find(c => c[0] === 'range'), ['range', 15, 29]);
    assert.deepEqual(calls.find(c => c[0] === 'order'), ['order', 'created_at', { ascending: true }]);
    assert.ok(calls.findIndex(c => c[0] === 'or') < calls.findIndex(c => c[0] === 'range'));
    assert.match(String(calls.find(c => c[0] === 'or')![1]), /description.ilike.%library%/);
  } finally { supabaseService.from = original; }
});

test('roadmap includes planned, active, and completed ideas but excludes private statuses', async () => {
  const original = supabase.from;
  let statuses: string[] = [];
  const query: any = {
    select() { return this; },
    in(_column, values) { statuses = values; return this; },
    order() { return this; },
    async limit() { return { data: [], error: null }; },
  };
  invalidateCache('roadmap_submissions');
  supabase.from = (() => query) as any;
  try {
    await loadRoadmapSubmissions();
    assert.deepEqual(statuses, ['approved', 'in_progress', 'resolved']);
  } finally { supabase.from = original; invalidateCache('roadmap_submissions'); }
});
