import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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

function browser(fetchResponse: (url: string, options: any) => Promise<any> = async () => ({ ok: true, json: async () => ({ success: true, feed: [], hasMore: false, totalCount: 1 }) })) {
  const nodes = new Map<string, FeedElement>();
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
    setTimeout, clearTimeout, sfToast: true,
  };
  const context = {
    window, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    sfToast: (message: string) => toasts.push(message),
    navigator: {},
    document: {
      getElementById: (id: string) => nodes.get(id) ?? null,
      querySelectorAll: (selector: string) => selector === '.action-like[data-id]' ? [support] : [],
      addEventListener() {},
      activeElement: null,
      createDocumentFragment: () => new FeedElement(),
    },
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return fetchResponse(url, options); },
  };
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
      : { ok: true, json: async () => ({ success: true, feed: [], hasMore: false, totalCount: 1 }) };
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

test('failed support can be retried without recording a false vote or sending duplicate requests', async () => {
  let resolveResponse!: (value: any) => void;
  let succeeded = false;
  const runtime = browser(async () => succeeded
    ? { ok: true, json: async () => ({ success: true, vote_count: 8 }) }
    : new Promise(resolve => { resolveResponse = resolve; }));
  const first = runtime.window.sfVoteFeed('idea-one', runtime.support);
  assert.equal(runtime.support.disabled, true);
  await runtime.window.sfVoteFeed('idea-one', runtime.support);
  assert.equal(runtime.calls.length, 1, 'Rapid repeat clicks must share the pending request');
  resolveResponse({ ok: false, status: 503 });
  await first;
  assert.equal(runtime.support.disabled, false);
  assert.equal(runtime.support.classList.contains('active'), false);
  assert.equal(runtime.support.attributes.get('aria-pressed'), 'false');
  assert.equal(runtime.count.textContent, '7');
  assert.equal(runtime.storage.has('sf_voted_ideas'), false);
  assert.match(runtime.toasts.at(-1)!, /try again/i);

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
  const { window } = browser();
  const html: string = window.sfCreatePostCardHtml({
    id: 'idea-"<unsafe>', title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>',
    status: 'resolved', categories: { name: '<img>' }, author: { display_name: 'Student <script>' },
    created_at: '2026-10-01T08:00:00Z', vote_count: 50, comment_count: 2,
  });
  assert.doesNotMatch(html, /<script>|<img\b|onfocus=/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="\/idea\/idea-%22%3Cunsafe%3E"/);
  assert.match(html, /<h2 class="post-title"><a class="post-title-link"/);
  const articleOpening = html.match(/<article[^>]*>/)![0];
  assert.doesNotMatch(articleOpening, /data-sf-click|tabindex|data-sf-keydown/);
  assert.match(html, /Completed/);
  assert.doesNotMatch(html, /Trending/);
});
