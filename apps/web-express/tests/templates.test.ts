import {htmlElements} from './support/html';
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
      if (name.endsWith('.eta')) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotThrow(() => eta.compile(source), file);
        const elements=htmlElements(source);
        assert.equal(elements.some(element=>element.tagName==='script'&&!element.attrs.some(attr=>attr.name==='src')&&!element.attrs.some(attr=>attr.name==='type'&&attr.value==='application/json')), false, file + ' still has inline JavaScript');
        assert.equal(elements.some(element=>element.attrs.some(attr=>attr.name.startsWith('on'))), false, file + ' still has an inline event handler');
        for (const element of elements.filter(element=>element.tagName==='script')) {
          const sourcePath=element.attrs.find(attr=>attr.name==='src')?.value.split('?')[0];
          if(sourcePath?.startsWith('/js/'))assert.equal(fs.existsSync(path.join(__dirname,'../public',sourcePath)),true,'Missing generated script '+sourcePath);
        }
      }
    }
  }
  check(path.join(__dirname, '../views'));
  for (const file of ['idea.eta', 'partials/idea-detail-drawer.eta']) {
    assert.match(fs.readFileSync(path.join(__dirname, '../views', file), 'utf8'), /data-sf-focusin="expand-comment"/, file + ' must reveal Post through the delegated focus handler');
  }
});

test('mobile tabs omit staff and header-only hiding preserves workspace links', () => {
  const nav = fs.readFileSync(path.join(__dirname, '../views/partials/mobile-nav.eta'), 'utf8');
  assert.equal(nav.includes('/admin'), false);
  const css = fs.readFileSync(path.join(__dirname, '../public/css/modules/components.css'), 'utf8');
  assert.ok(css.includes('.site-header :is(a[href="/admin"], a[href^="/admin/"])'));
  assert.doesNotMatch(css,/\n\s*a\[href="\/admin"\]/);
});

test('callback failure shows a retry message and does not navigate', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/auth-callback.js'), 'utf8');
  let onReady;
  let navigated = false;
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { addEventListener() {}, focus() {} }); return nodes.get(id); };
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

export {};
