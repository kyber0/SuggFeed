const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the deployed entrypoint and its actual retirement helper; never contact Supabase.
async function archiveResponse(secret, authorization, method = 'POST') {
  let handler, databaseCalls = 0;
  const context = {
    exports: {}, Request, Response,
    Deno: { env: { get: key => key === 'ARCHIVE_CRON_SECRET' ? secret : undefined }, serve: fn => { handler = fn; } },
    require: name => {
      if (name.includes('supabase-js')) { databaseCalls++; throw new Error('Unexpected database dependency'); }
      if (name.endsWith('/security.ts')) return { getCorsHeaders: () => ({}) };
      if (name.endsWith('/retired-school-endpoint.ts')) return execute('_shared/retired-school-endpoint.ts');
      throw new Error('Unexpected dependency: ' + name);
    },
  };
  function execute(file) {
    const source = fs.readFileSync(path.join(__dirname, '../../../supabase/functions', file), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports = {}; vm.runInNewContext(code, { ...context, exports }); return exports;
  }
  execute('archive-old-submissions/index.ts');
  const request = new Request('https://example.test/archive', { method, headers: { Authorization: authorization },
    ...(method === 'POST' ? { body: '{invalid json containing forged school_id' } : {}) });
  const response = await handler(request);
  return { status: response.status, databaseCalls, bodyRead: request.bodyUsed };
}

test('retired archive cannot reach data for missing, weak, mismatched or previously valid scheduler secrets', async () => {
  for (const [secret, header] of [[undefined, 'Bearer undefined'], ['', 'Bearer '], ['short', 'Bearer short'], ['x'.repeat(48), 'Bearer wrong'], ['s'.repeat(48), 'Bearer ' + 's'.repeat(48)]]) {
    assert.deepEqual(await archiveResponse(secret, header), { status: 410, databaseCalls: 0, bodyRead: false });
  }
});
test('retired archive preflight remains available and GET cannot trigger retention', async () => {
  assert.deepEqual(await archiveResponse('s'.repeat(48), 'Bearer ' + 's'.repeat(48), 'OPTIONS'), { status: 200, databaseCalls: 0, bodyRead: false });
  assert.deepEqual(await archiveResponse('s'.repeat(48), 'Bearer ' + 's'.repeat(48), 'GET'), { status: 410, databaseCalls: 0, bodyRead: false });
});
export {};
