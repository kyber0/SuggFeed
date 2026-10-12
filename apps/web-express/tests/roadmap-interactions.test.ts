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
  assert.match(source, /<a href="<%= urlFor\(\{ view, stage:.*page: '1'/);
  assert.doesNotMatch(source, /role="button" tabindex="0"/);
  assert.match(source, /aria-controls="roadmap-branch-/);
  assert.match(source, /Marked completed; an outcome summary has not been posted/);
});
