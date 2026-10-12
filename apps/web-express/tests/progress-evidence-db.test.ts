import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRoadmapDb, postProgress, STAFF_ID, USER_ID, IDEA_ID } from './support/roadmap-db';

async function reserve(db: Awaited<ReturnType<typeof createRoadmapDb>>, requestId: string, uploadId = randomUUID(), actorId = STAFF_ID) {
  const result = await db.query<any>(`SELECT * FROM public.reserve_progress_upload($1::uuid,$2::uuid,$3::text,$4::text,$5::integer,$6::text,$7::uuid)`,
    [actorId, requestId, 'bench.png', 'image/png', 100, 'A completed shaded bench.', uploadId]);
  return result.rows[0];
}
async function finalize(db: Awaited<ReturnType<typeof createRoadmapDb>>, id: string, actorId = STAFF_ID) {
  return db.query<any>(`SELECT * FROM public.finalize_progress_upload($1::uuid,$2::uuid,$3::text,$4::text,$5::integer)`,
    [actorId, id, `${id}/final.webp`, 'image/webp', 80]);
}
const code = (expected: string) => (error: unknown) => (error as { code: string }).code === expected;

test('actual evidence SQL enforces staff roles, quota and request/file reservation replay', async () => {
  const db = await createRoadmapDb();
  try {
    const requestId = randomUUID(); const uploadId = randomUUID();
    await assert.rejects(() => reserve(db, requestId, uploadId, USER_ID), code('42501'));
    const row = await reserve(db, requestId, uploadId); assert.equal(row.id, uploadId);
    assert.equal(row.temp_path, `${uploadId}/source`); assert.equal(row.final_path, `${uploadId}/final.webp`);
    assert.equal((await reserve(db, requestId, uploadId)).id, uploadId);
    await assert.rejects(() => db.query(`SELECT * FROM public.reserve_progress_upload($1::uuid,$2::uuid,'different.png','image/png',100,'A completed shaded bench.',$3::uuid)`,
      [STAFF_ID, requestId, uploadId]), code('23505'));
    for (let i = 0; i < 4; i++) await reserve(db, requestId);
    await assert.rejects(() => reserve(db, requestId), code('22023'));
    await db.query('SELECT public.cancel_progress_upload($1::uuid,$2::uuid)', [STAFF_ID, uploadId]);
    await reserve(db, requestId); // Cancelled reservations no longer consume the five active slots.
    const count = await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.idea_update_uploads WHERE request_id=$1', [requestId]);
    assert.equal(count.rows[0].count, 6);
  } finally { await db.close(); }
});

test('actual progress publication is atomic with evidence; pending files roll back projection and published files cannot be removed', async () => {
  const db = await createRoadmapDb();
  try {
    const requestId = randomUUID(); const file = await reserve(db, requestId);
    await assert.rejects(() => postProgress(db, { requestId, kind: 'started', percent: 20 }), code('22023'));
    const snapshot = await db.query<{ status: string; count: number }>(`SELECT status::text,(SELECT count(*)::integer FROM public.idea_updates) AS count FROM public.submissions WHERE id=$1`, [IDEA_ID]);
    assert.deepEqual(snapshot.rows[0], { status: 'approved', count: 0 });
    await finalize(db, file.id);
    const published = await postProgress(db, { requestId, kind: 'started', percent: 20 });
    const attached = await db.query<any>('SELECT update_id,state FROM public.idea_update_uploads WHERE id=$1', [file.id]);
    assert.equal(attached.rows[0].update_id, published.update.id); assert.equal(attached.rows[0].state, 'published');
    await assert.rejects(() => db.query('SELECT public.cancel_progress_upload($1::uuid,$2::uuid)', [STAFF_ID, file.id]), code('22023'));
    await assert.rejects(() => reserve(db, requestId), code('22023'));
    await assert.rejects(() => finalize(db, file.id), code('22023'));
  } finally { await db.close(); }
});

test('actual public file reads exclude private events and unpublished parents; authorization rechecks current staff role', async () => {
  const db = await createRoadmapDb();
  try {
    const privateRequest = randomUUID(); const privateFile = await reserve(db, privateRequest);
    await finalize(db, privateFile.id); await postProgress(db, { requestId: privateRequest, visibility: 'staff' });
    assert.equal((await db.query('SELECT * FROM public.read_public_idea_update_files($1::uuid)', [IDEA_ID])).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.read_staff_idea_update_files($1::uuid,$2::uuid)', [IDEA_ID, STAFF_ID])).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM public.read_authorized_progress_file($1::uuid,NULL)', [privateFile.id])).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.read_authorized_progress_file($1::uuid,$2::uuid)', [privateFile.id, USER_ID])).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.read_authorized_progress_file($1::uuid,$2::uuid)', [privateFile.id, STAFF_ID])).rows.length, 1);
    const publicRequest = randomUUID(); const publicFile = await reserve(db, publicRequest);
    await finalize(db, publicFile.id); await postProgress(db, { requestId: publicRequest });
    const publicRead = await db.query<any>('SELECT * FROM public.read_public_idea_update_files($1::uuid)', [IDEA_ID]);
    assert.equal(publicRead.rows.length, 1); assert.equal(publicRead.rows[0].id, publicFile.id);
    assert.equal('final_path' in publicRead.rows[0], false); assert.equal('actor_id' in publicRead.rows[0], false);
    await db.query(`UPDATE public.submissions SET status='pending' WHERE id=$1`, [IDEA_ID]);
    assert.equal((await db.query('SELECT * FROM public.read_authorized_progress_file($1::uuid,NULL)', [publicFile.id])).rows.length, 0);
    await db.query(`UPDATE public.profiles SET role='student' WHERE id=$1`, [STAFF_ID]);
    assert.equal((await db.query('SELECT * FROM public.read_authorized_progress_file($1::uuid,$2::uuid)', [privateFile.id, STAFF_ID])).rows.length, 0);
    await assert.rejects(() => db.query('SELECT * FROM public.read_staff_idea_update_files($1::uuid,$2::uuid)', [IDEA_ID, STAFF_ID]), code('42501'));
  } finally { await db.close(); }
});

test('actual cleanup waits for outstanding signed-upload capabilities, preserves published final objects and remains retryable', async () => {
  const db = await createRoadmapDb();
  try {
    const requestId = randomUUID(); const file = await reserve(db, requestId);
    await db.query('SELECT public.cancel_progress_upload($1::uuid,$2::uuid)', [STAFF_ID, file.id]);
    assert.equal((await db.query('SELECT * FROM public.claim_progress_upload_cleanup(50)')).rows.length, 0);
    await db.query(`UPDATE public.idea_update_uploads SET upload_token_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [file.id]);
    assert.equal((await db.query<any>('SELECT * FROM public.claim_progress_upload_cleanup(50)')).rows[0].final_path, `${file.id}/final.webp`);
    assert.equal((await db.query('SELECT * FROM public.claim_progress_upload_cleanup(50)')).rows.length, 1);
    await db.query('SELECT public.finish_progress_upload_cleanup($1::uuid)', [file.id]);
    assert.equal((await db.query('SELECT * FROM public.claim_progress_upload_cleanup(50)')).rows.length, 0);
    const publishedRequest = randomUUID(); const publishedFile = await reserve(db, publishedRequest);
    await finalize(db, publishedFile.id); await postProgress(db, { requestId: publishedRequest });
    await db.query(`UPDATE public.idea_update_uploads SET upload_token_expires_at=clock_timestamp()-interval '1 second',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, [publishedFile.id]);
    assert.equal((await db.query('SELECT * FROM public.claim_progress_upload_cleanup(50)')).rows.length, 0);
    assert.equal((await db.query<any>('SELECT * FROM public.list_progress_sources_to_clean(50)')).rows[0].id, publishedFile.id);
    await db.query('SELECT public.finish_progress_source_cleanup($1::uuid)', [publishedFile.id]);
    assert.equal((await db.query('SELECT * FROM public.list_progress_sources_to_clean(50)')).rows.length, 0);
  } finally { await db.close(); }
});

test('actual grants deny browser roles all upload mutation/read-path RPCs and base-table access', async () => {
  const db = await createRoadmapDb();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => db.query('SELECT * FROM public.idea_update_uploads'), code('42501'));
      await assert.rejects(() => db.query('SELECT * FROM public.read_authorized_progress_file($1::uuid,$2::uuid)', [randomUUID(), STAFF_ID]), code('42501'));
      await assert.rejects(() => db.query('SELECT * FROM public.claim_progress_upload_cleanup(50)'), code('42501'));
      await assert.rejects(() => reserve(db, randomUUID()), code('42501'));
      const publicFiles = await db.query('SELECT * FROM public.read_public_idea_update_files($1::uuid)', [IDEA_ID]);
      assert.deepEqual(publicFiles.rows, []);
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});
