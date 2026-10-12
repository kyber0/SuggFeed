import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

test('Tree native button can collapse and reopen repeatedly without duplicate keyboard handlers', () => {
  const listeners = new Map<string, () => void>();
  const attrs = new Map([['aria-expanded', 'true'], ['aria-controls', 'branch-panel']]);
  const panel = { hidden: false };
  const header = { getAttribute: (name: string) => attrs.get(name), setAttribute: (name: string, value: string) => attrs.set(name, value), addEventListener: (name: string, fn: () => void) => listeners.set(name, fn) };
  const nodes = new Map<string, any>([
    ['sf-roadmap-data', { textContent: '[]' }],
    ['campus-roadmap-board', { dataset: { view: 'tree' } }],
    ['roadmap-dialog', { addEventListener() {} }],
    ['roadmap-close', { addEventListener() {} }],
    ['branch-panel', panel],
  ]);
  const source = fs.readFileSync(path.join(__dirname, '../public/js/roadmap.js'), 'utf8');
  vm.runInNewContext(source, {
    document: { getElementById: (id: string) => nodes.get(id), querySelectorAll: (selector: string) => selector === '.roadmap-tree-header' ? [header] : [], addEventListener() {} },
    window: { location: { href: 'https://www.suggfeed.me/roadmap?view=tree' }, addEventListener() {} },
    URL, URLSearchParams, AbortController,
  });
  assert.equal(listeners.has('keydown'), false, 'native buttons handle Enter/Space without a second toggler');
  for (let index = 0; index < 4; index++) {
    listeners.get('click')!();
    assert.equal(panel.hidden, index % 2 === 0);
    assert.equal(attrs.get('aria-expanded'), String(index % 2 !== 0));
  }
});

test('roadmap layout changes are real links with independent page-one URLs', () => {
  const source = fs.readFileSync(path.join(__dirname, '../views/roadmap.eta'), 'utf8');
  assert.match(source, /<a href="<%= urlFor\(\{view,stage:.*page:'1'/);
  assert.match(source, /Other views/);
  assert.doesNotMatch(source, /role="button" tabindex="0"/);
  assert.match(source, /aria-controls="roadmap-branch-/);
  assert.match(source, /Marked completed; an outcome summary has not been posted/);
});

test('idea drawer hides stale actions on failure and retries without adding browser history', async () => {
  class Element {
    hidden = false;
    textContent = '';
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    listeners = new Map<string, () => void>();
    classList = { toggle() {} };
    addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
    setAttribute() {}
    replaceChildren() {}
  }
  const ids = ['detail-content', 'detail-error', 'detail-status', 'detail-title', 'detail-description', 'report-idea',
    'detail-category', 'detail-meta', 'detail-response', 'detail-hint', 'detail-estimate', 'detail-link', 'follow',
    'detail-footer', 'detail-retry', 'history-list', 'history-status', 'close'];
  const nodes = new Map<string, any>(ids.map(id => ['roadmap-' + id, new Element()]));
  const dialog = Object.assign(new Element(), { open: false, showModal() { this.open = true; } });
  nodes.set('roadmap-dialog', dialog);
  nodes.set('sf-roadmap-data', { textContent: '[]' });
  nodes.set('campus-roadmap-board', { dataset: { view: 'board' } });
  let calls = 0, pushes = 0;
  const id = '00000000-0000-4000-8000-000000000003';
  const item = { id, title: 'Better lighting', description: 'Safer walkways', status: 'in_progress', category: 'Facilities', votes: 3, updated_at: '2026-10-10T08:00:00Z' };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/roadmap.js'), 'utf8'), {
    document: { getElementById: (key: string) => nodes.get(key), querySelectorAll: () => [], addEventListener() {}, dispatchEvent() {} },
    window: { location: { href: `https://www.suggfeed.me/roadmap?item=${id}` }, addEventListener() {}, history: { pushState() { pushes++; } } },
    fetch: async () => { calls++; if (calls === 1) throw new Error('Network unavailable'); return { ok: true, json: async () => ({ success: true, item, updates: [], merges: [] }) }; },
    HTMLElement: Element, CustomEvent: class {}, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(nodes.get('roadmap-detail-content').hidden, true);
  assert.equal(nodes.get('roadmap-detail-footer').hidden, true);
  assert.equal(nodes.get('roadmap-detail-retry').hidden, false);
  nodes.get('roadmap-detail-retry').listeners.get('click')();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(nodes.get('roadmap-detail-title').textContent, item.title);
  assert.equal(nodes.get('roadmap-detail-category').textContent, 'Facilities');
  assert.equal(nodes.get('roadmap-detail-footer').hidden, false);
  assert.equal(nodes.get('roadmap-detail-retry').hidden, true);
  assert.equal(nodes.get('roadmap-history-status').textContent, 'The school has not posted a progress update yet.');
  assert.equal(pushes, 0);
});
