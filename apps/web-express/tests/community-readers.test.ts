import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommunityError, loadReportDecisions, loadPublicMergeHistory, loadCommunityStaffIdea } from '../src/lib/community';
import { supabaseService } from '../src/lib/supabase';

test('community readers retain ownership, public visibility, staff guards and explicit field sets', async () => {
  const original = supabaseService.from;
  const calls: Array<[string, ...unknown[]]> = [];
  let found = true;
  let failure: Error | null = null;
  supabaseService.from = ((table: string) => {
    calls.push(['from', table]);
    const chain = {
      select(fields: string) { calls.push(['select', fields]); return chain; },
      eq(field: string, value: unknown) { calls.push(['eq', field, value]); return chain; },
      in(field: string, values: string[]) { calls.push(['in', field, values]); return chain; },
      order(field: string, options?: unknown) { calls.push(['order', field, options]); return chain; },
      limit(count: number) { calls.push(['limit', count]); return Promise.resolve({ data: [], error: failure }); },
      maybeSingle() { return Promise.resolve({ data: found ? { id } : null, error: failure }); },
    };
    return chain;
  }) as unknown as typeof supabaseService.from;
  const id = '30000000-0000-4000-8000-000000000001';
  try {
    assert.deepEqual(await loadReportDecisions('session-user'), []);
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'session-user'));
    await loadPublicMergeHistory(id);
    assert.ok(calls.some(call => call[0] === 'in' && JSON.stringify(call[2]) === JSON.stringify(['approved', 'in_progress', 'resolved'])));
    await loadCommunityStaffIdea({ role: 'moderator' }, id);
    assert.ok(calls.some(call => call[0] === 'select' && call[1] === 'id,title,status,updated_at'));
    const before = calls.length;
    await assert.rejects(loadCommunityStaffIdea({ role: 'student' }, id), (e: unknown) => e instanceof CommunityError && e.status === 403);
    await assert.rejects(loadPublicMergeHistory('invalid'), (e: unknown) => e instanceof CommunityError && e.status === 400);
    assert.equal(calls.length, before, 'denied/invalid requests must not query the database');
    found = false;
    await assert.rejects(loadPublicMergeHistory(id), (e: unknown) => e instanceof CommunityError && e.status === 404);
    await assert.rejects(loadCommunityStaffIdea({ role: 'admin' }, id), (e: unknown) => e instanceof CommunityError && e.status === 404);
    failure = new Error('Mock database failure');
    await assert.rejects(loadReportDecisions('session-user'), failure);
    for (const call of calls.filter(call => call[0] === 'select')) {
      assert.doesNotMatch(String(call[1]), /tracking|anonymous|email|user_id|\*/);
    }
  } finally { supabaseService.from = original; }
});
