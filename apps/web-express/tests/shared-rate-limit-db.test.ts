import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

async function fixture() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
  await db.exec(readFileSync(path.resolve(__dirname, '../../../supabase/migrations/202610160004_shared_request_budgets.sql'), 'utf8'));
  return db;
}
const key = (value: number) => value.toString(16).padStart(64, '0');
async function consume(db: PGlite, value = 1, limit = 2, window = 900) {
  return (await db.query<{ allowed: boolean; retry_after: number }>('SELECT * FROM consume_request_budget($1,$2,$3)', [key(value), limit, window])).rows[0];
}

test('service-only RPC enforces fixed windows, bounded counters and safe parameter clamps', async () => {
  const db = await fixture();
  try {
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(consume(db), /permission denied/);
      await assert.rejects(db.query('SELECT * FROM request_budgets'), /permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    assert.equal((await consume(db)).allowed, true);
    await assert.rejects(db.query('SELECT * FROM request_budgets'), /permission denied/);
    await assert.rejects(db.query('DELETE FROM request_budgets'), /permission denied/);
    assert.equal((await consume(db)).allowed, true);
    const denied = await consume(db); assert.equal(denied.allowed, false); assert.ok(denied.retry_after > 0 && denied.retry_after <= 900);
    await db.exec('RESET ROLE');
    const expiry = (await db.query<{ expiry: string }>('SELECT expires_at::text expiry FROM request_budgets')).rows[0].expiry;
    await consume(db); assert.equal((await db.query<{ expiry: string }>('SELECT expires_at::text expiry FROM request_budgets')).rows[0].expiry, expiry);
    await db.exec("UPDATE request_budgets SET expires_at=now()-interval '1 second'");
    assert.equal((await consume(db)).allowed, true);
    assert.equal((await db.query<{ hits: number }>('SELECT hits FROM request_budgets')).rows[0].hits, 1);
    await db.exec('UPDATE request_budgets SET hits=1001');
    assert.equal((await consume(db, 1, 999999)).allowed, false);
    assert.equal((await db.query<{ hits: number }>('SELECT hits FROM request_budgets')).rows[0].hits, 1001);
    assert.ok((await consume(db, 2, 999999, 999999)).retry_after <= 86400);
    for (const args of [['raw-ip',2,900],[key(1),0,900],[key(1),2,0],[key(1),null,900]]) await assert.rejects(db.query('SELECT * FROM consume_request_budget($1,$2,$3)', args), /Invalid request budget/);
  } finally { await db.close(); }
});

test('abandoned identities are pruned in bounded batches while active rows survive', async () => {
  const db = await fixture();
  try {
    await db.exec("INSERT INTO request_budgets SELECT lpad(to_hex(n),64,'0'),1,now()-interval '2 days' FROM generate_series(1,25) n");
    await consume(db, 26);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::integer count FROM request_budgets')).rows[0].count, 16);
    await consume(db, 26); await consume(db, 26);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::integer count FROM request_budgets')).rows[0].count, 1);
    // PGlite serializes queries; true parallel row-lock contention needs staged PostgreSQL.
    const results = await Promise.all(Array.from({ length: 25 }, () => consume(db, 27, 20)));
    assert.equal(results.filter(result => result.allowed).length, 20);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::integer count FROM request_budgets')).rows[0].count, 2);
  } finally { await db.close(); }
});
