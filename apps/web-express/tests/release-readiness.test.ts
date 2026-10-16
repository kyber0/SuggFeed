const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Eta } = require('eta');
const { legalDetails } = require('../src/lib/legal');
const { releaseConfigurationChecks, sharedServiceReleaseBlockers } = require('../src/lib/release-readiness');

const validEnv = {
  APP_ORIGIN: 'https://school.test', SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'public-key-test-only', SUPABASE_SERVICE_ROLE_KEY: 'service-key-test-only',
  SESSION_SECRET: 'test-only-secret-with-at-least-32-characters',
  PLATFORM_OPERATOR_NAME: 'Test Operator', PRIVACY_CONTACT_EMAIL: 'privacy@school.test',
};

test('legal configuration rejects malformed mailboxes and has no invented fallback', () => {
  assert.deepEqual(legalDetails({}), { operatorName: null, privacyEmail: null });
  for (const email of ['javascript:alert(1)', 'a@school.test?body=secret', 'a@school.test\r\nBcc:x@y.test', 'a@school.test#fragment', 'missing-at', 'x@-school.test', 'privacy#office@school.test']) {
    assert.equal(legalDetails({ PRIVACY_CONTACT_EMAIL: email }).privacyEmail, null);
  }
  assert.equal(legalDetails(validEnv).privacyEmail, 'privacy@school.test');
});

test('notice rendering escapes operator identity and accurately handles missing contact', () => {
  const eta = new Eta({ views: path.join(__dirname, '../views') });
  for (const view of ['privacy', 'terms']) {
    const missing = eta.render(view, { title: 'Notice', currentPath: '/privacy', user: null, legal: legalDetails({}) });
    assert.match(missing, /incomplete/i);
    assert.doesNotMatch(missing, /privacy@suggfeed\.app|legal@suggfeed\.app/);
    const configured = eta.render(view, { title: 'Notice', currentPath: '/privacy', user: null, legal: legalDetails({ ...validEnv, PLATFORM_OPERATOR_NAME: '<img src=x onerror=alert(1)>' }) });
    assert.doesNotMatch(configured, /<img src=x onerror/);
    assert.match(configured, /&lt;img/);
    assert.match(configured, /mailto:privacy@school.test/);
  }
});

test('configuration checks reject insecure origins and never report secret values', () => {
  assert.ok(releaseConfigurationChecks(validEnv).every(check => check.pass));
  for (const origin of ['http://school.test', 'https://user:password@school.test', 'https://school.test/path', 'https://school.test/?token=x', 'https://localhost']) {
    assert.equal(releaseConfigurationChecks({ ...validEnv, APP_ORIGIN: origin })[0].pass, false);
  }
  assert.ok(releaseConfigurationChecks({}).every(check => !check.pass));
  assert.equal(releaseConfigurationChecks({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: validEnv.SUPABASE_ANON_KEY })[3].pass, false);
  const output = JSON.stringify(releaseConfigurationChecks(validEnv));
  assert.equal(output.includes(validEnv.SESSION_SECRET), false);
  assert.equal(output.includes(validEnv.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.ok(sharedServiceReleaseBlockers.some(x => x.includes('isolation')));
});

test('release CLI stays blocked for shared SaaS even with complete configuration and does not print secrets', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register', 'scripts/check-release.ts'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, ...validEnv }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /BLOCKED: Shared-school release requires hosted tenant-isolation/);
  assert.doesNotMatch(result.stdout, /MISSING\/INVALID/);
  assert.equal(result.stdout.includes(validEnv.SESSION_SECRET), false);
  assert.equal(result.stdout.includes(validEnv.SUPABASE_SERVICE_ROLE_KEY), false);
});

// Import the real app with dummy config; tested paths never perform database reads.
process.env.VERCEL = '1';
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'dummy-public-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
process.env.SESSION_SECRET = validEnv.SESSION_SECRET;
const app = require('../src/server').default;
let server;
after(async () => { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); });

test('actual app sends restrictive script, framing and unused-capability headers', async () => {
  server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/js/events.js');
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy');
  const scripts = csp.split(';').find(x => x.trim().startsWith('script-src '));
  assert.match(scripts, /'self'/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval|jsdelivr/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(response.headers.get('permissions-policy'), /camera=\(\).*microphone=\(\).*geolocation=\(\).*payment=\(\).*usb=\(\)/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const notice = await fetch(origin + '/privacy');
  assert.equal(notice.status, 200);
  assert.match(notice.headers.get('cache-control'), /no-store/);
});
export {};
