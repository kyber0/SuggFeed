import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function harness(base = '/s/school-a', user = 'student-a', shared = new Map<string, string>()) {
  const events = new Map<string, Function>();
  const requests: { url: string; options: RequestInit & { cache?: string } }[] = [];
  let reloads = 0;
  const storage = {
    get length() { return shared.size; },
    key: (i: number) => [...shared.keys()][i] || null,
    getItem: (key: string) => shared.get(key) ?? null,
    setItem: (key: string, value: string) => shared.set(key, value),
    removeItem: (key: string) => shared.delete(key),
  };
  const databaseNames: string[] = [];
  const deletedDatabases: string[] = [];
  const root = { style: { visibility: '' } };
  const context: any = {
    URL, Request, Response, AbortController, AbortSignal, localStorage: storage, sessionStorage: storage,
    indexedDB: {
      databases: async () => databaseNames.map(name => ({ name })),
      deleteDatabase: (name: string) => deletedDatabases.push(name),
    },
    document: {
      querySelector: (selector: string) => ({ content: selector.includes('school-actor') ? user : selector.includes('school-base') ? base : base ? base.replace('/s/', 'id-') : '' }),
      getElementById: () => ({ dataset: { user } }),
      documentElement: root,
    },
    window: {
      location: { href: 'https://suggfeed.test' + (base || '/schools') + '/feed', origin: 'https://suggfeed.test', reload: () => reloads++ },
      addEventListener: (name: string, fn: Function) => events.set(name, fn),
    },
    fetch: async (url: string, options: RequestInit & { cache?: string }) => {
      requests.push({ url, options });
      return new Response('{}');
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/school-context.js'), 'utf8'), context);
  return { context, events, requests, root, databaseNames, deletedDatabases, storage, shared, reloads: () => reloads };
}

test('school paths retain global auth/assets/chooser routes and preserve explicit school destinations', () => {
  const h = harness();
  for (const route of ['/', '/feed?search=library', '/idea/id', '/admin/board', '/staff/workspace/id', '/api/feed', '/profile', '/privacy']) {
    assert.equal(h.context.sfSchoolPath(route), '/s/school-a' + route);
  }
  for (const route of ['/auth/callback', '/js/feed.js', '/css/base.css', '/schools', '/platform', '/s/school-b/feed', '#detail', 'https://other.test/feed', '//other.test/feed']) {
    assert.equal(h.context.sfSchoolPath(route), route);
  }
  assert.equal(h.context.sfSchoolRoute('/s/school-a/admin/board'), '/admin/board');
  assert.equal(h.context.sfSchoolRoute('/s/school-ab/admin'), '/s/school-ab/admin');
  assert.equal(harness('/s/BAD').context.sfSchoolPath('/api/feed'), '/api/feed');
});

test('school fetch scopes relative and absolute requests, rejects cross-school requests, and bypasses browser caching', async () => {
  const h = harness();
  await h.context.sfSchoolFetch('/api/feed');
  await h.context.sfSchoolFetch('https://suggfeed.test/api/vote/id', { method: 'POST' });
  await h.context.sfSchoolFetch('/auth/session');
  await h.context.sfSchoolFetch('https://storage.test/signed-upload', { method: 'PUT' });
  assert.deepEqual(h.requests.map(request => request.url), ['/s/school-a/api/feed', '/s/school-a/api/vote/id', '/auth/session', 'https://storage.test/signed-upload']);
  assert.ok(h.requests.every(request => request.options.cache === 'no-store'));
  await assert.rejects(h.context.sfSchoolFetch('/s/school-b/api/feed'), /Switch schools/);
  assert.equal(h.requests.length, 4);
});

test('school and actor namespaces never restore legacy, other school, or other account state', async () => {
  const shared = new Map<string, string>([['sf_my_tracking_codes', '["legacy"]']]);
  const a = harness('/s/school-a', 'student-a', shared);
  const b = harness('/s/school-b', 'student-a', shared);
  const other = harness('/s/school-a', 'student-b', shared);
  const key = a.context.sfSchoolKey('sf_my_tracking_codes');
  a.storage.setItem(key, '["school-a-private"]');
  assert.equal(b.storage.getItem(b.context.sfSchoolKey('sf_my_tracking_codes')), null);
  assert.equal(other.storage.getItem(other.context.sfSchoolKey('sf_my_tracking_codes')), null);
  const otherKey = other.context.sfSchoolKey('draft');
  other.storage.setItem(otherKey, 'other account');
  a.databaseNames.push(a.context.sfSchoolKey('suggfeed-submissions'), other.context.sfSchoolKey('suggfeed-submissions'));
  await a.context.sfClearSchoolState();
  assert.equal(a.storage.getItem(key), null);
  assert.equal(other.storage.getItem(otherKey), 'other account');
  assert.deepEqual(a.deletedDatabases, [a.context.sfSchoolKey('suggfeed-submissions')]);
});

test('leaving a school aborts in-flight requests and restored pages revalidate before revealing content', async () => {
  const h = harness();
  h.context.fetch = (url: string, options: RequestInit & { cache?: string }) => new Promise((_resolve, reject) => {
    h.requests.push({ url, options });
    options.signal!.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const external = new AbortController();
  const pending = h.context.sfSchoolFetch('/api/feed', { signal: external.signal });
  h.events.get('pagehide')!();
  await assert.rejects(pending, /aborted/);
  assert.equal(h.root.style.visibility, 'hidden');
  h.events.get('pageshow')!({ persisted: true });
  assert.equal(h.reloads(), 1);
  const second = h.context.sfSchoolFetch('/api/feed', { signal: external.signal });
  external.abort();
  await assert.rejects(second, /aborted/);
});

test('service worker never intercepts school pages or school APIs', () => {
  const listeners = new Map<string, Function>();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    self: { addEventListener: (name: string, fn: Function) => listeners.set(name, fn), location: { origin: 'https://suggfeed.test' } }, URL,
  });
  for (const route of ['/s/school-a/feed', '/s/school-b/api/feed', '/s/school-a/profile']) {
    let intercepted = false;
    listeners.get('fetch')!({ request: { url: 'https://suggfeed.test' + route, method: 'GET', headers: new Headers(), mode: 'navigate' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});


test('school cancellation still reaches response body parsing after headers arrive', async () => {
  const h = harness();
  h.context.fetch = (_url: string, options: RequestInit) => Promise.resolve(new Response(new ReadableStream({
    start(stream) { options.signal!.addEventListener('abort', () => stream.error(new Error('body aborted'))); },
  })));
  const response = await h.context.sfSchoolFetch('/api/feed');
  const body = response.text();
  h.events.get('pagehide')!();
  await assert.rejects(body, /body aborted/);
});
