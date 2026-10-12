import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoadmapDb, postProgress, STAFF_ID, USER_ID, OTHER_USER_ID, IDEA_ID, HIDDEN_ID } from './support/roadmap-db';

test('real PostgreSQL migrations maintain seed totals, duplicate vote idempotency and Edge toggle counts', async () => {
  const db = await createRoadmapDb();
  const cast = async (user: string | null, token: string | null = null) => (await db.query<{ result: any }>(
    'SELECT public.cast_idea_vote($1::uuid,$2::uuid,$3::text) AS result', [IDEA_ID, user, token])).rows[0].result;
  const toggle = async (action: string, user: string | null = USER_ID, token: string | null = null, device: string | null = null) =>
    (await db.query<{ result: any }>('SELECT public.set_idea_vote($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text) AS result',
      [IDEA_ID, user, token, device, 'a'.repeat(64), action])).rows[0].result;
  try {
    assert.deepEqual(await cast(USER_ID), { vote_count: 41, already_voted: false });
    assert.deepEqual(await cast(USER_ID), { vote_count: 41, already_voted: true });
    assert.deepEqual(await toggle('vote'), { vote_count: 41, voted: true, already_voted: true });
    assert.deepEqual(await toggle('unvote'), { vote_count: 40, voted: false, already_voted: true });
    assert.deepEqual(await toggle('unvote'), { vote_count: 40, voted: false, already_voted: false });
    assert.deepEqual(await toggle('toggle'), { vote_count: 41, voted: true, already_voted: false });
    assert.deepEqual(await toggle('toggle'), { vote_count: 40, voted: false, already_voted: true });
    assert.equal((await cast(null, 'anonymous-token-one')).vote_count, 41);
    const device = 'b'.repeat(64);
    assert.deepEqual(await toggle('vote', null, 'anonymous-device-one', device), { vote_count: 42, voted: true, already_voted: false });
    assert.deepEqual(await toggle('vote', null, 'anonymous-device-two', device), { vote_count: 42, voted: true, already_voted: true });
    assert.deepEqual(await toggle('unvote', null, 'anonymous-device-two', device), { vote_count: 41, voted: false, already_voted: true });
    // Legacy direct Edge insertion and account deletion use the same delta path.
    await db.query('INSERT INTO public.votes(submission_id,user_id) VALUES ($1,$2)', [IDEA_ID, OTHER_USER_ID]);
    await db.query('DELETE FROM auth.users WHERE id=$1', [OTHER_USER_ID]);
    assert.equal((await db.query<{ vote_count: number }>('SELECT vote_count FROM public.submissions WHERE id=$1', [IDEA_ID])).rows[0].vote_count, 41);
    await assert.rejects(() => db.query('SELECT public.cast_idea_vote($1,$2,null)', [HIDDEN_ID, USER_ID]), { code: 'P0002' });
    await assert.rejects(() => toggle('invalid'), { code: '22023' });
    await assert.rejects(() => cast(USER_ID, 'both-identities-token'), { code: '22023' });
  } finally { await db.close(); }
});

test('real fanout is opt-in, transaction-local, deduplicated, and excludes private/deleted or withdrawn updates', async () => {
  const db = await createRoadmapDb();
  const following = (value: boolean, user = USER_ID, idea = IDEA_ID) => db.query(
    'SELECT public.set_idea_follow($1::uuid,$2::uuid,$3::boolean)', [user, idea, value]);
  const notifications = () => db.query<{ id: string; user_id: string }>('SELECT id,user_id FROM public.idea_notifications ORDER BY user_id');
  try {
    await assert.rejects(() => following(true, USER_ID, HIDDEN_ID), { code: 'P0002' });
    await following(true); await following(true); await following(true, OTHER_USER_ID);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.idea_follows')).rows[0].count, 2);
    await postProgress(db, { notify: true, visibility: 'staff' });
    await postProgress(db, { notify: false });
    assert.equal((await notifications()).rows.length, 0);
    const requestId = crypto.randomUUID();
    const expectedAt = (await db.query<{ version: string }>('SELECT updated_at::text AS version FROM public.submissions WHERE id=$1', [IDEA_ID])).rows[0].version;
    await postProgress(db, { requestId, expectedAt, kind: 'milestone', percent: 35, notify: true });
    assert.equal((await notifications()).rows.length, 2);
    assert.equal((await postProgress(db, { requestId, expectedAt, kind: 'milestone', percent: 35, notify: true })).replayed, true);
    assert.equal((await notifications()).rows.length, 2);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.idea_notification_outbox')).rows[0].count, 0);
    const note = (await notifications()).rows.find(row => row.user_id === USER_ID)!;
    assert.equal((await db.query<{ result: boolean }>('SELECT public.mark_idea_notification_read($1,$2) AS result', [OTHER_USER_ID, note.id])).rows[0].result, false);
    assert.equal((await db.query<{ result: boolean }>('SELECT public.mark_idea_notification_read($1,$2) AS result', [USER_ID, note.id])).rows[0].result, true);
    await following(false); await postProgress(db, { kind: 'milestone', percent: 40, notify: true });
    assert.equal((await notifications()).rows.length, 3, 'Unfollowing prevents later fanout');
    await db.query(`UPDATE public.idea_follows SET email_enabled=true,push_enabled=true WHERE user_id=$1`, [OTHER_USER_ID]);
    await postProgress(db, { kind: 'milestone', percent: 45, notify: true });
    assert.deepEqual((await db.query<{ channel: string; state: string }>('SELECT channel,state FROM public.idea_notification_outbox ORDER BY channel')).rows,
      [{ channel: 'email', state: 'held' }, { channel: 'push', state: 'held' }]);
    await db.query(`UPDATE public.submissions SET status='rejected' WHERE id=$1`, [IDEA_ID]);
    assert.equal((await db.query<{ result: boolean }>('SELECT public.mark_idea_notification_read($1,$2) AS result', [USER_ID, note.id])).rows[0].result, false);
    await following(false, OTHER_USER_ID); // Withdrawal must not trap an account follow.
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.idea_follows')).rows[0].count, 0);
  } finally { await db.close(); }
});

test('real database denies client engagement access and arbitrary-user RPC calls', async () => {
  const db = await createRoadmapDb();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of ['idea_follows', 'idea_notifications', 'idea_notification_outbox']) {
        await assert.rejects(() => db.query(`SELECT * FROM public.${table}`), { code: '42501' });
      }
      await assert.rejects(() => db.query('SELECT public.set_idea_follow($1,$2,true)', [USER_ID, IDEA_ID]), { code: '42501' });
      await assert.rejects(() => db.query('SELECT public.cast_idea_vote($1,$2,null)', [IDEA_ID, USER_ID]), { code: '42501' });
      await assert.rejects(() => db.query(`SELECT public.set_idea_vote($1,$2,null,null,null,'vote')`, [IDEA_ID, USER_ID]), { code: '42501' });
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await db.query('SELECT public.set_idea_follow($1,$2,true)', [USER_ID, IDEA_ID]);
    assert.equal((await db.query('SELECT * FROM public.idea_follows')).rows.length, 1);
    await db.exec('RESET ROLE');
  } finally { await db.close(); }
});
