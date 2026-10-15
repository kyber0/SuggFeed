const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the actual handler with mocked Deno/provider bindings; never contact Supabase.
async function archiveResponse(secret, authorization) {
  let handler, databaseCalls = 0;
  const source = fs.readFileSync(path.join(__dirname, '../../../supabase/functions/archive-old-submissions/index.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = {
    exports: {}, Request, Response, console: { error() {} },
    Deno: { env: { get: key => key === 'ARCHIVE_CRON_SECRET' ? secret : undefined }, serve: fn => { handler = fn; } },
    require: name => name.includes('supabase-js')
      ? { createClient() { databaseCalls++; throw new Error('unexpected database access'); } }
      : { corsHeaders: {}, json: (body, status = 200) => Response.json(body, { status }) },
  };
  vm.runInNewContext(code, context);
  const response = await handler(new Request('https://example.test/archive', { headers: { Authorization: authorization } }));
  return { status: response.status, databaseCalls };
}

test('archive never reaches the database with missing, empty, weak or mismatched scheduler secret', async () => {
  for (const [secret, header] of [[undefined, 'Bearer undefined'], ['', 'Bearer '], ['short', 'Bearer short'], ['x'.repeat(48), 'Bearer wrong']]) {
    assert.deepEqual(await archiveResponse(secret, header), { status: 401, databaseCalls: 0 });
  }
});
test('archive accepts a configured matching scheduler credential before database work', async () => {
  const secret = 's'.repeat(48);
  // The database stub deliberately throws; only authorization is exercised here.
  assert.deepEqual(await archiveResponse(secret, 'Bearer ' + secret), { status: 400, databaseCalls: 1 });
});
export {};
