const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Eta } = require('eta');

test('all Eta templates compile, including authenticated staff view', () => {
  const eta = new Eta();
  function check(dir) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) { check(file); continue; }
      if (name.endsWith('.eta')) assert.doesNotThrow(() => eta.compile(fs.readFileSync(file, 'utf8')), file);
    }
  }
  check(path.join(__dirname, '../views'));
});

test('mobile navigation has no staff entry; responsive styles hide other staff links', () => {
  const nav = fs.readFileSync(path.join(__dirname, '../views/partials/mobile-nav.eta'), 'utf8');
  assert.equal(nav.includes('/admin'), false);
  const css = fs.readFileSync(path.join(__dirname, '../public/css/modules/components.css'), 'utf8');
  assert.match(css, /@media \(max-width: 800px\)\s*\{[^}]*\}[^}]*a\[href="\/admin"\][^{]*\{\s*display: none !important;/);
});

test('callback failure shows a retry message and does not navigate', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../views/auth-callback.eta'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  let onReady;
  let navigated = false;
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); };
  const context = {
    document: { addEventListener(_event, fn) { onReady = fn; }, querySelector: node, getElementById: node },
    history: { replaceState() {} }, URLSearchParams, setTimeout, clearTimeout,
    window: {
      location: { search: '?code=expired', hash: '' },
      _sb: { auth: { exchangeCodeForSession: async () => ({ error: new Error('expired') }) } },
      sfAuthReady: Promise.resolve(), sfAuthNavigate: () => { navigated = true; }
    }
  };
  vm.runInNewContext(source, context);
  await onReady();
  assert.equal(navigated, false);
  assert.equal(node('auth-callback-retry').hidden, false);
  assert.match(node('auth-callback-message').textContent, /expired/);
});
