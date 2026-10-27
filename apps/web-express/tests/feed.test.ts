import {htmlElements} from './support/html';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {Eta} from 'eta';

class FeedElement {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: any) => void>();
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, selected: boolean) => selected ? this.classes.add(name) : this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  children: FeedElement[] = [];
  selectors = new Map<string, FeedElement>();
  textContent = '';
  value = '';
  hidden = false;
  disabled = false;
  style = { display: '' };
  tagName = 'DIV';
  isContentEditable = false;
  constructor(dataset: Record<string, string> = {}) { this.dataset = dataset; }
  addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, listener); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  querySelector(selector: string) { return this.selectors.get(selector) ?? null; }
  querySelectorAll() { return this.children; }
  appendChild(child: FeedElement) { this.children.push(...child.children); }
  focus() {}
  select() {}
  blur() {}
}

function browser(fetchResponse: (url: string, options: any) => Promise<any> = async () => ({ ok: true, json: async () => ({ success: true, feed: [], hasMore: false, totalCount: 1, cardsHtml: '' }) }), signedIn=false) {
  const nodes = new Map<string, FeedElement>();
  if(signedIn){nodes.set('sf-auth-config',new FeedElement({user:'member'}));nodes.set('sf-feed-account-state',new FeedElement({user:'member',bookmarks:'[]'}));}
  const config = new FeedElement({ sort: 'all', category: 'Learning', search: 'library', page: '1', hasMore: 'true' });
  nodes.set('sf-feed-config', config);
  const search = new FeedElement();
  search.value = 'library';
  search.tagName = 'INPUT';
  nodes.set('feed-search', search);
  const form = new FeedElement();
  nodes.set('feed-search-form', form);
  nodes.set('feed-search-clear', new FeedElement());
  const container = new FeedElement();
  container.children.push(new FeedElement({ ideaId: 'idea-one' }));
  nodes.set('feed-posts-container', container);
  const loader = new FeedElement();
  loader.selectors.set('.feed-loading-text', new FeedElement());
  nodes.set('feed-loader', loader);
  nodes.set('feed-end-message', new FeedElement());
  nodes.set('feed-load-status', new FeedElement());
  nodes.set('feed-result-summary', new FeedElement({ total: '16' }));
  const support = new FeedElement({ id: 'idea-one' });
  const count = new FeedElement();
  count.textContent = '7';
  support.selectors.set('.action-count', count);
  support.selectors.set('.action-label', new FeedElement());
  const storage = new Map<string, string>();
  const calls: Array<{ url: string; options: any }> = [];
  const toasts: string[] = [];
  const window: Record<string, any> = {
    location: { href: 'https://www.suggfeed.me/feed?category=Learning&search=library', origin: 'https://www.suggfeed.me', search: '?category=Learning&search=library' },
    addEventListener() {},
    setTimeout, clearTimeout, sfToast: (message: string) => toasts.push(message),
  };
  const context = {
    window, CustomEvent, URL, URLSearchParams, AbortController, AbortSignal, setTimeout, clearTimeout,
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    sfToast: (message: string) => toasts.push(message),
    navigator: {},
    document: {
      getElementById: (id: string) => nodes.get(id) ?? null,
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector === '.action-like[data-id]' ? [support] : selector === '.post-card[data-idea-id]' ? container.children : [],
      addEventListener() {},
      dispatchEvent() {},
      activeElement: null,
      createElement: () => ({content: {querySelectorAll: () => []}, set innerHTML(value: string) { assert.equal(value, '', 'This fixture only supports empty pagination markup'); }}),
      createDocumentFragment: () => new FeedElement(),
    },
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return fetchResponse(url, options); },
  };
  Object.assign(context, { sfSchoolPath: (value: string) => value, sfSchoolKey: (value: string) => value, ...('fetch' in context ? { sfSchoolFetch: context.fetch } : {}) });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/engagement.js'), 'utf8'), context);
  Object.assign(context,{location:window.location,sfRememberVote:window.sfRememberVote});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/feed.js'), 'utf8'), context);
  function input(value: string) {
    search.value = value;
    search.listeners.get('input')!({ target: search });
  }
  return { window, nodes, search, form, support, count, storage, calls, toasts, input };
}

test('feed search waits for submission and sorting preserves the applied search', () => {
  const typing = browser();
  const originalUrl = typing.window.location.href;
  typing.input('new seating');
  assert.equal(typing.window.location.href, originalUrl, 'Typing must not navigate away or lose input focus');
  typing.window.sfSetSort('popular');
  const sorted = new URL(typing.window.location.href);
  assert.equal(sorted.searchParams.get('sort'), 'popular');
  assert.equal(sorted.searchParams.get('category'), 'Learning');
  assert.equal(sorted.searchParams.get('search'), 'library', 'Unsubmitted text must not become a filter');

  const submitting = browser();
  submitting.input('  new seating  ');
  let prevented = false;
  submitting.form.listeners.get('submit')!({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const submitted = new URL(submitting.window.location.href);
  assert.equal(submitted.searchParams.get('search'), 'new seating');
  assert.equal(submitted.searchParams.get('category'), 'Learning');
});

test('loading more uses the applied filters even when the search input has a draft', async () => {
  const { window, input, calls, nodes } = browser();
  input('unsubmitted draft');
  await window.sfLoadMoreFeed();
  assert.equal(calls.length, 1);
  const requested = new URL(calls[0].url, window.location.origin);
  assert.equal(requested.searchParams.get('page'), '2');
  assert.equal(requested.searchParams.get('search'), 'library');
  assert.equal(requested.searchParams.get('category'), 'Learning');
  assert.equal(requested.searchParams.get('sort'), 'all');
  assert.equal(nodes.get('feed-loader')!.disabled, false);
  assert.equal(nodes.get('feed-loader')!.hidden, true);
});

test('failed loading preserves existing ideas and retries the same page', async () => {
  let attempts = 0;
  const { window, calls, nodes } = browser(async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ success: true, feed: [], hasMore: false, totalCount: 1, cardsHtml: '' }) };
  });
  const loader = nodes.get('feed-loader')!;
  const container = nodes.get('feed-posts-container')!;
  const originalCards = [...container.children];
  const originalSummary = nodes.get('feed-result-summary')!.textContent;
  const pending = window.sfLoadMoreFeed();
  assert.equal(loader.disabled, true);
  await pending;
  assert.deepEqual(container.children, originalCards, 'Failed loading must keep the currently visible ideas');
  assert.equal(nodes.get('feed-result-summary')!.textContent, originalSummary);
  assert.equal(loader.disabled, false);
  assert.equal(loader.hidden, false);
  assert.equal(loader.attributes.has('aria-busy'), false);
  assert.match(loader.querySelector('.feed-loading-text')!.textContent, /try.*again/i);
  assert.match(nodes.get('feed-load-status')!.textContent, /could not load more ideas/i);

  await window.sfLoadMoreFeed();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => new URL(call.url, window.location.origin).searchParams.get('page')), ['2', '2'], 'Retry must not skip the failed page');
  assert.deepEqual(container.children, originalCards);
  assert.equal(loader.disabled, false);
  assert.equal(loader.hidden, true);
  assert.doesNotMatch(nodes.get('feed-load-status')!.textContent, /could not load/i);
});

test('rate-limited support can be retried without recording a false vote or sending duplicate requests', async () => {
  let resolveResponse!: (value: any) => void;
  let succeeded = false;
  const runtime = browser(async () => succeeded
    ? { ok: true, json: async () => ({ success: true, voted:true, vote_count: 8 }) }
    : new Promise(resolve => { resolveResponse = resolve; }));
  const first = runtime.window.sfVoteFeed('idea-one', runtime.support);
  assert.equal(runtime.support.disabled, true);
  await runtime.window.sfVoteFeed('idea-one', runtime.support);
  assert.equal(runtime.calls.length, 1, 'Rapid repeat clicks must share the pending request');
  resolveResponse({ ok: false, status: 429 });
  await first;
  assert.equal(runtime.support.disabled, false);
  assert.equal(runtime.support.classList.contains('active'), false);
  assert.equal(runtime.support.attributes.get('aria-pressed'), 'false');
  assert.equal(runtime.count.textContent, '7');
  assert.equal(runtime.storage.has('sf_voted_ideas'), false);
  assert.match(runtime.toasts.at(-1)!, /try supporting this idea again/i);

  succeeded = true;
  await runtime.window.sfVoteFeed('idea-one', runtime.support);
  assert.equal(runtime.calls.length, 2);
  assert.equal(runtime.support.classList.contains('active'), true);
  assert.equal(runtime.support.attributes.get('aria-pressed'), 'true');
  assert.equal(runtime.support.disabled, false);
  assert.equal(runtime.count.textContent, '8');
  assert.deepEqual(JSON.parse(runtime.storage.get('sf_voted_ideas')!), ['idea-one']);
});

test('loaded feed cards escape content and expose native title links without duplicate card actions', () => {
  const eta=new Eta({views:path.resolve(__dirname,'../views')});
  const html: string = eta.render('partials/feed-card',{item:{
    id: 'idea-"<unsafe>', title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>',
    status: 'resolved', categories: { name: '<img>' }, author: { display_name: 'Student <script>' },
    created_at: '2026-10-01T08:00:00Z', vote_count: 50, comment_count: 2,
  },votedIds:[],voteStateKnown:true});
  assert.equal(htmlElements(html).some(element=>['script','img'].includes(element.tagName)||element.attrs.some(attr=>attr.name==='onfocus')),false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="\/idea\/idea-%22%3Cunsafe%3E"/);
  assert.match(html, /<h2 class="post-title"><a class="post-title-link"/);
  const articleOpening = html.match(/<article[^>]*>/)![0];
  assert.doesNotMatch(articleOpening, /data-sf-click|tabindex|data-sf-keydown/);
  assert.match(html, /<div class="post-menu-wrap">/);
  assert.doesNotMatch(html, /<div class="post-menu-wrap"[^>]*data-sf-click/);
  assert.match(html, /Completed/);
  assert.doesNotMatch(html, /Trending/);
});

test('3-dot kebab menu toggles open and closed on click and closes on Escape', () => {
  const docListeners = new Map<string, Array<{ listener: (e: any) => void; capture: boolean }>>();
  class MockNode {
    attributes = new Map<string, string>();
    hidden = true;
    style = { display: '' };
    offsetWidth = 100;
    offsetHeight = 30;
    children: MockNode[] = [];
    focused = false;
    constructor(public tagName: string, public className: string, public parent: MockNode | null = null) {}
    setAttribute(k: string, v: string) { this.attributes.set(k, v); }
    getAttribute(k: string) { return this.attributes.get(k) ?? null; }
    focus() { this.focused = true; }
    closest(selector: string): MockNode | null {
      for (let n: MockNode | null = this; n; n = n.parent) {
        if (selector === '.post-menu-btn' && n.className.includes('post-menu-btn')) return n;
        if (selector === '.post-menu-wrap' && n.className.includes('post-menu-wrap')) return n;
        if (selector === '.post-menu-item' && n.className.includes('post-menu-item')) return n;
      }
      return null;
    }
    querySelector(selector: string): MockNode | null {
      if (selector === '.post-menu-btn') return this.children.find(c => c.className.includes('post-menu-btn')) ?? null;
      if (selector === '.post-menu-dropdown') return this.children.find(c => c.className.includes('post-menu-dropdown')) ?? null;
      return null;
    }
    querySelectorAll(selector: string): MockNode[] {
      if (selector === '.post-menu-wrap') return this.children.filter(c => c.className.includes('post-menu-wrap'));
      if (selector === '.post-menu-item') return this.children.filter(c => c.className.includes('post-menu-item'));
      return [];
    }
  }

  const wrap = new MockNode('DIV', 'post-menu-wrap');
  const btn = new MockNode('BUTTON', 'post-menu-btn', wrap);
  const svg = new MockNode('svg', '', btn);
  const dropdown = new MockNode('DIV', 'post-menu-dropdown', wrap);
  dropdown.hidden = true;
  const item1 = new MockNode('BUTTON', 'post-menu-item action-bookmark', dropdown);
  const item2 = new MockNode('BUTTON', 'post-menu-item action-share', dropdown);
  const item3 = new MockNode('BUTTON', 'post-menu-item post-menu-item--danger care-report', dropdown);
  dropdown.children.push(item1, item2, item3);
  wrap.children.push(btn, dropdown);

  const doc = {
    querySelector() { return null; },
    addEventListener(type: string, listener: (e: any) => void, opts?: any) {
      const list = docListeners.get(type) ?? [];
      list.push({ listener, capture: !!(opts && (opts === true || opts.capture)) });
      docListeners.set(type, list);
    },
    querySelectorAll(selector: string) {
      if (selector === '.post-menu-wrap') return [wrap];
      return [];
    },
    getElementById(id: string) {
      if (id === 'sf-feed-config') return { dataset: { sort: 'all', category: 'All' } };
      return null;
    },
    createDocumentFragment() { return {}; },
    activeElement: null,
  };

  const context = {
    window: { addEventListener() {}, location: { href: 'http://localhost/feed', origin: 'http://localhost', search: '' }, getComputedStyle: () => ({ display: 'block' }), sfToast: true },
    document: doc,
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: {},
  };

  Object.assign(context, { sfSchoolPath: (value: string) => value, sfSchoolKey: (value: string) => value, ...('fetch' in context ? { sfSchoolFetch: context.fetch } : {}) });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/feed.js'), 'utf8'), context);

  function dispatch(type: string, target: any, key?: string) {
    const list = docListeners.get(type) ?? [];
    for (const entry of list) {
      entry.listener({ target, key });
    }
  }

  // 1. Initial state: dropdown is hidden
  assert.equal(dropdown.hidden, true);

  // 2. Click 3-dot button (on the inner svg) -> dropdown opens
  dispatch('click', svg);
  assert.equal(dropdown.hidden, false, 'Clicking 3-dot button must open the dropdown');
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(item1.focused, true, 'First visible item must receive focus');

  // 3. Click 3-dot button again -> dropdown closes
  dispatch('click', btn);
  assert.equal(dropdown.hidden, true, 'Clicking 3-dot button again must close the dropdown');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');

  // 4. Open dropdown again and test clicking outside -> dropdown closes
  dispatch('click', btn);
  assert.equal(dropdown.hidden, false);
  const outsideEl = new MockNode('DIV', 'outside-element');
  dispatch('click', outsideEl);
  assert.equal(dropdown.hidden, true, 'Clicking outside must close the dropdown');

  // 5. Open dropdown again and test Escape key -> dropdown closes
  dispatch('click', btn);
  assert.equal(dropdown.hidden, false);
  dispatch('keydown', null, 'Escape');
  assert.equal(dropdown.hidden, true, 'Escape must close the dropdown');
});



test('concurrent account bookmarks preserve both confirmed changes in either response order',async()=>{
 for(const order of [[0,1],[1,0]]){
  const pending:Array<()=>void>=[];
  const app=browser(async()=>new Promise(resolve=>pending.push(()=>resolve({ok:true,json:async()=>({success:true})}))),true);
  const first=app.window.sfBookmarkPost('first',new FeedElement());
  const second=app.window.sfBookmarkPost('second',new FeedElement());
  pending[order[0]]();await new Promise(resolve=>setImmediate(resolve));pending[order[1]]();
  await Promise.all([first,second]);
  assert.deepEqual([...app.window.sfGetSavedSet()].sort(),['first','second']);
 }
});


test('ambiguous support failures require reconciliation instead of a duplicate write',async()=>{
 const runtime=browser(async()=>({ok:false,status:503}));let refreshes=0;
 runtime.window.location.reload=()=>{refreshes++;};
 await runtime.window.sfVoteFeed('idea-one',runtime.support);
 assert.equal(runtime.support.dataset.supportUnknown,'true');
 assert.equal(runtime.support.attributes.has('aria-pressed'),false);
 assert.equal(runtime.count.textContent,'—');
 assert.equal(runtime.storage.has('sf_voted_ideas'),false);
 assert.match(runtime.toasts.at(-1)!,/refresh to check/i);
 await runtime.window.sfVoteFeed('idea-one',runtime.support);
 assert.equal(refreshes,1);assert.equal(runtime.calls.length,1);
});
