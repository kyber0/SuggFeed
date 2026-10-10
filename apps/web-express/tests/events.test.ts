import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

class TestElement {
  classList = new Set<string>();
  constructor(public dataset: Record<string, string>, public parentElement: TestElement | null = null, public tagName = 'DIV') {}
  closest(selector: string): TestElement | null {
    for (let node: TestElement | null = this; node; node = node.parentElement) {
      if (selector === 'form' && node.tagName === 'FORM') return node;
    }
    return null;
  }
  getAttribute(name: string): string | null {
    return this.dataset[name.replace(/^data-/, '').replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase())] ?? null;
  }
}

function runtime() {
  const listeners = new Map<string, (event: unknown) => void>();
  const calls: Array<[string, unknown[]]> = [];
  const context = {
    Element: TestElement,
    window: {},
    document: { addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn) },
    sfVoteFeed: (...args: unknown[]) => calls.push(['vote', args]),
    sfOpenIdeaDetail: (...args: unknown[]) => calls.push(['open', args]),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/events.js'), 'utf8'), context);
  function dispatch(type: string, target: TestElement, key?: string) {
    const event = {
      target, key, ctrlKey: false, metaKey: false, cancelBubble: false, defaultPrevented: false, immediate: false,
      stopPropagation() { this.cancelBubble = true; },
      stopImmediatePropagation() { this.immediate = true; },
      preventDefault() { this.defaultPrevented = true; },
    };
    listeners.get(type)!(event);
    return event;
  }
  return { calls, dispatch };
}

test('delegated vote handles a nested icon and does not open the enclosing idea card', () => {
  const { calls, dispatch } = runtime();
  const card = new TestElement({ sfClick: 'open-detail', ideaId: 'idea-1' });
  const footer = new TestElement({ sfClick: 'stop' }, card);
  const button = new TestElement({ sfClick: 'vote-feed', id: 'idea-1' }, footer);
  const icon = new TestElement({}, button);
  const event = dispatch('click', icon);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'vote');
  assert.equal(calls[0][1][0], 'idea-1');
  assert.equal(event.immediate, true);
});

test('keyboard binding opens dynamically loaded idea cards', () => {
  const { calls, dispatch } = runtime();
  const card = new TestElement({ sfKeydown: 'open-detail-key', ideaId: 'idea-2' });
  dispatch('keydown', card, 'Enter');
  assert.equal(calls[0][0], 'open');
  assert.equal(calls[0][1][0], 'idea-2');
});

test('focusing either comment input reveals its own composer without inline JavaScript', () => {
  const { dispatch } = runtime();
  for (const id of ['comment-input', 'drawer-comment-input']) {
    const form = new TestElement({}, null, 'FORM');
    const wrapper = new TestElement({}, form);
    const input = new TestElement({ sfFocusin: 'expand-comment', id }, wrapper, 'TEXTAREA');
    const event = dispatch('focusin', input);
    assert.equal(form.classList.has('expanded'), true, id);
    assert.equal(event.defaultPrevented, false, 'Native focus and keyboard navigation remain intact');
    form.classList.delete('expanded');
    dispatch('focusin', input);
    assert.equal(form.classList.has('expanded'), true, 'Composer can reopen after Cancel');
  }
  assert.doesNotThrow(() => dispatch('focusin', new TestElement({ sfFocusin: 'expand-comment' })));
});

test('modified clicks preserve native browser navigation', () => {
  const { calls } = runtime();
  const listeners = new Map<string, (event: unknown) => void>();
  const context = { Element: TestElement, window: {}, document: { addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn) }, sfOpenIdeaDetail: () => calls.push(['open', []]) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/events.js'), 'utf8'), context);
  for (const modifier of [{ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true}, {button: 1}]) {
    const event = { target: new TestElement({ sfClick: 'open-detail', ideaId: 'idea-3' }), ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, button: 0, ...modifier, cancelBubble: false, preventDefault() { assert.fail('Modified click must keep native navigation'); } };
    listeners.get('click')!(event);
  }
  assert.equal(calls.length, 0);
});
