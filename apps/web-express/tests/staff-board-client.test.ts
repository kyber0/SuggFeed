import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const stages = ['pending', 'approved', 'in_progress', 'resolved', 'rejected'];
const stageLabels = ['Needs review', 'Planned', 'In progress', 'Completed', 'Declined'];
const idea = (number: number, status = 'approved', version = '2026-10-12T10:00:00Z') => ({
  id: '00000000-0000-4000-8000-' + String(number).padStart(12, '0'),
  title: 'A useful school idea ' + number, status, updated_at: version,
  staff_note: 'Keep the existing response.', assignee_id: null, priority: 'normal', target_date: null,
});

// A small DOM/event harness exercises the shipped client, including delegated
// events from freshly replaced lanes, without a browser or live staff account.
function harness(initial = [idea(1), idea(2, 'pending')]) {
  let currentUrl = new URL('https://www.suggfeed.me/admin/board?search=library&approvedPage=1&pendingPage=3');
  const listeners = new Map<string, Function[]>();
  const timers = new Map<number, Function>();
  const requests: any[] = [], confirms: string[] = [], navigations: string[] = [], historyActions: string[] = [];
  let timerId = 0, reloads = 0, confirmed = true, getError: any = null, mutationError: any = null, missingLane: string | null = null;
  let mutationPending: ((value: any) => void) | null = null;
  let deferMutation = false;
  const pages = new Map<string, any>();
  const trees = new Map<string, any>();
  let doc: any;

  class Node {
    tagName: string;
    id = ''; textContent = ''; value = ''; checked = false; disabled = false; hidden = false;
    href = ''; dataset: Record<string, string> = {}; parentElement: any = null;
    children: any[] = []; attributes = new Map<string, string>(); eventListeners = new Map<string, Function[]>();
    classes = new Set<string>(); focused = false;
    selectedOptions = [{ textContent: 'Alex Reyes' }];
    classList = {
      add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
      remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
      contains: (name: string) => this.classes.has(name),
      toggle: (name: string, force?: boolean) => { const on = force ?? !this.classes.has(name); on ? this.classes.add(name) : this.classes.delete(name); return on; },
    };
    constructor(tag = 'div', id = '') { this.tagName = tag.toUpperCase(); this.id = id; }
    matches(selector: string): boolean {
      return selector.split(',').some(part => {
        const pieces = part.trim().split(/\s+/); const own = pieces.pop()!;
        const tag = own.match(/^[\w-]+/)?.[0];
        if (tag && tag.toUpperCase() !== this.tagName) return false;
        const id = own.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
        for (const [, name] of own.matchAll(/\.([\w-]+)/g)) if (!this.classes.has(name)) return false;
        for (const [, name, quote, value] of own.matchAll(/\[([\w-]+)(?:=(['"]?)([^\]'"]+)\2)?\]/g)) {
          const attribute = this.getAttribute(name); if (attribute === null || (value !== undefined && attribute !== value)) return false;
        }
        if (pieces.length) { let parent = this.parentElement; const ancestor = pieces.join(' '); while (parent && !parent.matches(ancestor)) parent = parent.parentElement; if (!parent) return false; }
        return true;
      });
    }
    closest(selector: string): any { let node: any = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
    getAttribute(name: string): string | null {
      if (name === 'href') return this.href || null;
      if (name === 'id') return this.id || null;
      if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] ?? null;
      return this.attributes.get(name) ?? null;
    }
    setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    addEventListener(name: string, fn: Function) { this.eventListeners.set(name, [...(this.eventListeners.get(name) || []), fn]); }
    append(...nodes: any[]) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    replaceWith(next: any) { const parent = this.parentElement; const index = parent.children.indexOf(this); assert.ok(index >= 0); parent.children.splice(index, 1, next); next.parentElement = parent; this.parentElement = null; }
    replaceChildren(...nodes: any[]) { this.children = []; this.append(...nodes); }
    descendants(): any[] { return this.children.flatMap(node => [node, ...node.descendants()]); }
    querySelectorAll(selector: string): any[] { return this.descendants().filter(node => node.matches(selector)); }
    querySelector(selector: string): any { return this.querySelectorAll(selector)[0] || null; }
    contains(node: any): boolean { return node === this || this.descendants().includes(node); }
    focus() { this.focused = true; doc.activeElement = this; }
    scrollIntoView() {}
    reportValidity() { return true; }
  }

  const element = (tag: string, id = '') => new Node(tag, id);
  const lane = (status: string, entries: any[], page = 1) => {
    const node = element('section'); node.dataset.dropStage = status; node.classes.add('staff-flow-lane');
    for (const entry of entries.filter(item => item.status === status)) {
      const card = element('article'); card.dataset.boardId = entry.id; card.classes.add('staff-flow-card');
      const checkbox = element('input'); checkbox.dataset.bulkId = entry.id;
      const select = element('select'); select.dataset.stageSelect = entry.id; select.value = entry.status;
      card.append(checkbox, select); node.append(card);
    }
    const pageLink = element('a'); pageLink.dataset.boardPage = status;
    const next = new URL(currentUrl); next.searchParams.set(status + 'Page', String(page + 1)); pageLink.href = next.href;
    const jump = element('form'); jump.dataset.boardJump = status;
    const number = element('input'); number.value = String(page); number.classes.add('staff-page-input'); number.setAttribute('name', status + 'Page'); number.setAttribute('type', 'number'); jump.append(number);
    node.append(pageLink, jump); return node;
  };
  const documentTree = (entries: any[], requested?: string, page = 1) => {
    const root = element('body'), board = element('section', 'staff-flow-board'); board.classes.add('staff-flow-board');
    for (const stage of stages) board.append(lane(stage, entries, stage === requested ? page : 1));
    const data = element('script', 'staff-board-data'); data.textContent = JSON.stringify(entries);
    const pages = Object.fromEntries(stages.map(status => [status, status === requested ? page : Number(currentUrl.searchParams.get(status + 'Page') || 1)]));
    const meta = element('script', 'staff-board-meta'); meta.textContent = JSON.stringify({ filters: { search: 'library', sort: 'oldest', pageSize: 6, pages }, totalCount: 50, lanes: stages.map((status, index) => ({ status, label: stageLabels[index], count: 10, page: pages[status], pageCount: 5, from: 1, to: 2 })) });
    root.append(board, data, meta);
    for (const id of ['staff-tools-message', 'staff-selection-tools', 'staff-selection-count', 'staff-board-summary', 'staff-bulk-assign', 'staff-bulk-assignee', 'staff-clear-selection', 'staff-select-page', 'staff-board-retry']) root.append(element(id.includes('assignee') ? 'select' : id.includes('assign') || id.includes('clear') || id.includes('retry') ? 'button' : 'div', id));
    root.querySelector('#staff-bulk-assignee').value = '00000000-0000-4000-8000-000000000010';
    root.querySelector('#staff-selection-tools').hidden = true;
    root.querySelector('#staff-board-retry').hidden = true;
    return { root, getElementById: (id: string) => root.querySelector('#' + id), querySelector: (selector: string) => root.querySelector(selector), querySelectorAll: (selector: string) => root.querySelectorAll(selector), activeElement: null };
  };
  doc = documentTree(initial);
  doc.addEventListener = (name: string, fn: Function) => listeners.set(name, [...(listeners.get(name) || []), fn]);
  doc.createElement = (tag: string) => element(tag);
  const workflowEvents:any[]=[];
  doc.dispatchEvent=(event:any)=>{workflowEvents.push(event.detail);return true;};
  const location: any = { reload: () => { reloads++; }, assign: (url: string) => navigations.push(url) };
  for (const property of ['href', 'origin', 'pathname', 'search']) Object.defineProperty(location, property, { get: () => currentUrl[property] });
  const window: any = {
    location, sfConfirm: async (text: string) => { confirms.push(text); return confirmed; },
    history: { pushState: (_state: any, _title: string, url: string) => { currentUrl = new URL(url, currentUrl); historyActions.push('push'); navigations.push(currentUrl.pathname + currentUrl.search); }, replaceState: (_state: any, _title: string, url: string) => { currentUrl = new URL(url, currentUrl); historyActions.push('replace'); navigations.push(currentUrl.pathname + currentUrl.search); } },
    addEventListener: (name: string, fn: Function) => listeners.set('window:' + name, [...(listeners.get('window:' + name) || []), fn]),
  };
  const fetch = async (url: string, options: any = {}) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (!options.method || options.method === 'GET') {
      if (getError) throw getError;
      const parsed = new URL(url, currentUrl), stage = stages.find(status => parsed.searchParams.get(status + 'Page') !== currentUrl.searchParams.get(status + 'Page')) || 'approved';
      const page = Number(parsed.searchParams.get(stage + 'Page') || 1);
      const entries = pages.get(stage + ':' + page) || [idea(page * 10, stage)];
      const marker = stage + ':' + page, fresh = documentTree(entries, stage, page);
      if (missingLane) { const removed = fresh.querySelector(`[data-drop-stage="${missingLane}"]`); removed.parentElement.children = removed.parentElement.children.filter(node => node !== removed); }
      trees.set(marker, fresh);
      return { ok: true, status: 200, text: async () => marker };
    }
    if (deferMutation) return new Promise(resolve => { mutationPending = resolve; });
    if (mutationError) throw mutationError;
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/staff-tools.js'), 'utf8'), {
    document: doc, window, history: window.history, location, fetch, URL, URLSearchParams, AbortController, Map, Set, JSON, Date, Number, String, Array, Error,
    HTMLElement: Node, HTMLInputElement: Node, HTMLSelectElement: Node, HTMLAnchorElement: Node, Event: class {}, CustomEvent: class {constructor(public type:string,public options:any){} get detail(){return this.options.detail;}},
    DOMParser: class { parseFromString(marker: string) { return trees.get(marker); } },
    setTimeout: (fn: Function) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
  });
  const flush = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
  const emit = async (name: string, target: any, values: any = {}) => {
    const event: any = { target, currentTarget: null, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...values };
    let node = target; while (node) { event.currentTarget = node; for (const fn of node.eventListeners.get(name) || []) await fn(event); node = node.parentElement; }
    for (const fn of listeners.get(name) || []) await fn(event);
    await flush(); return event;
  };
  return {
    doc, requests, confirms, navigations, historyActions, flush, emit, workflowEvents,
    node: (id: string) => doc.getElementById(id), find: (selector: string) => doc.querySelector(selector),
    lane: (stage: string) => doc.querySelector(`[data-drop-stage="${stage}"]`),
    page: async (stage: string) => emit('click', doc.querySelector(`[data-board-page="${stage}"]`)),
    select: async (id: string, checked = true) => { const checkbox = doc.querySelector(`[data-bulk-id="${id}"]`); checkbox.checked = checked; await emit('change', checkbox); },
    setPage: (stage: string, page: number, entries: any[]) => pages.set(stage + ':' + page, entries),
    setGetError: (error: any) => { getError = error; }, setMutationError: (error: any) => { mutationError = error; },
    setIncompletePage: (stage: string) => { missingLane = stage; },
    setConfirm: (value: boolean) => { confirmed = value; }, setMutationPending: () => { deferMutation = true; },
    finishMutation: () => mutationPending?.({ ok: true, status: 200, json: async () => ({ success: true }) }),
    get url() { return currentUrl; }, get reloads() { return reloads; }, timers,
  };
}

test('work-board paging replaces only one lane and keeps filters and other stage pages in the URL', async () => {
  const h = harness(), pending = h.lane('pending'), oldApproved = h.lane('approved');
  await h.page('approved');
  assert.notEqual(h.lane('approved'), oldApproved);
  assert.equal(h.lane('pending'), pending);
  assert.equal(h.url.searchParams.get('search'), 'library');
  assert.equal(h.url.searchParams.get('pendingPage'), '3');
  assert.equal(h.url.searchParams.get('approvedPage'), '2');
  assert.equal(h.reloads, 0);
  assert.equal(h.requests[0].url.includes('/admin/board?'), true);
});

test('modified pagination clicks keep native navigation behavior and do not fetch a lane', async () => {
  const h = harness();
  const anchor = h.find('[data-board-page="approved"]');
  const click = await h.emit('click', anchor, { ctrlKey: true });
  assert.equal(click.defaultPrevented, false);
  assert.equal(h.requests.length, 0);
});

test('selection survives lane paging and bulk assignment keeps the original optimistic version', async () => {
  const original = idea(1), h = harness([original]);
  await h.select(original.id);
  h.setPage('approved', 2, [idea(1, 'approved', '2026-10-12T11:00:00Z'), idea(20)]);
  await h.page('approved');
  assert.equal(h.find(`[data-bulk-id="${original.id}"]`).checked, true);
  await h.select(idea(20).id);
  await h.emit('click', h.node('staff-bulk-assign'));
  const mutation = h.requests.find(request => request.options.method === 'POST');
  assert.equal(mutation.body.items.length, 2);
  assert.equal(mutation.body.items.find(item => item.id === original.id).updatedAt, original.updated_at);
  assert.match(h.confirms.at(-1), /Assign 2/);
});

test('failed page fetch keeps existing cards and offers a retry without full navigation', async () => {
  const h = harness(), approved = h.lane('approved');
  h.setGetError(new TypeError('Network unavailable'));
  await h.page('approved');
  assert.ok(h.lane('approved') === approved, 'The existing lane must stay mounted after a failed request');
  assert.equal(h.url.searchParams.get('approvedPage'), '1');
  assert.equal(h.node('staff-board-retry').hidden, false);
  assert.match(h.node('staff-tools-message').textContent, /load|failed|retry|network/i);
  h.setGetError(null); await h.emit('click', h.node('staff-board-retry'));
  assert.notEqual(h.lane('approved'), approved);
  assert.equal(h.url.searchParams.get('approvedPage'), '2');
  assert.deepEqual(h.historyActions, ['push'], 'A retried page change must retain the original page in browser history');
});

test('an incomplete response cannot partly replace the requested lane or lose its selection', async () => {
  const h = harness(), approved = h.lane('approved');
  await h.select(idea(1).id); h.setIncompletePage('in_progress');
  await h.page('approved');
  assert.ok(h.lane('approved') === approved, 'Validate the whole response before replacing any lane');
  assert.equal(h.find(`[data-bulk-id="${idea(1).id}"]`).checked, true);
  assert.equal(h.url.searchParams.get('approvedPage'), '1');
  assert.equal(h.node('staff-board-retry').hidden, false);
});

test('native Go forms update only their stage page while preserving other lane state', async () => {
  const h = harness(), form = h.lane('approved').querySelector('[data-board-jump]');
  form.querySelector('.staff-page-input').value = '4';
  await h.emit('submit', form);
  assert.equal(h.url.searchParams.get('approvedPage'), '4');
  assert.equal(h.url.searchParams.get('pendingPage'), '3');
  assert.equal(h.requests.length, 1);
});

test('newly paged stage menus open a guided form without writing or changing the card', async () => {
  const h = harness(); await h.page('approved');
  const select = h.lane('approved').querySelector('[data-stage-select]'); select.value = 'in_progress'; h.setConfirm(false);
  await h.emit('change', select);
  assert.equal(select.value, 'approved');
  assert.equal(h.requests.some(request => request.options.method === 'PATCH'), false);
  assert.equal(h.confirms.length, 0);
  assert.equal(h.workflowEvents[0].action,'start');
  h.setConfirm(true); select.value = 'in_progress'; await h.emit('change', select);
  assert.equal(h.requests.some(request => request.options.method === 'PATCH'), false);
});

test('clear selection resets retained selections and delegated checkboxes enforce the 25-item cap', async () => {
  const entries = Array.from({ length: 30 }, (_, index) => idea(index + 1));
  const h = harness(entries.slice(0, 6));
  for (let page = 1; page <= 5; page++) {
    if (page > 1) { h.setPage('approved', page, entries.slice((page - 1) * 6, page * 6)); await h.page('approved'); }
    for (const entry of entries.slice((page - 1) * 6, page * 6)) await h.select(entry.id);
  }
  assert.equal(h.find(`[data-bulk-id="${entries[25].id}"]`).checked, false);
  assert.match(h.node('staff-selection-count').textContent, /25 selected/);
  await h.emit('click', h.node('staff-clear-selection'));
  assert.match(h.node('staff-selection-count').textContent, /0 selected/);
  assert.equal(h.doc.querySelectorAll('[data-bulk-id]').some(input => input.checked), false);
  assert.equal(h.node('staff-selection-tools').hidden, true);
});

test('paging is blocked while a confirmed mutation is outstanding', async () => {
  const h = harness(); await h.select(idea(1).id); h.setMutationPending();
  const mutation = h.emit('click', h.node('staff-bulk-assign')); await h.flush();
  await h.page('approved');
  assert.equal(h.requests.filter(request => !request.options.method || request.options.method === 'GET').length, 0);
  h.finishMutation(); await mutation;
  assert.equal(h.requests.filter(request => !request.options.method || request.options.method === 'GET').length, 1);
  assert.equal(h.reloads, 0);
});

test('dragging a newly paged card opens completion and leaves the existing stage unchanged', async () => {
  const h = harness(); await h.page('approved');
  const card = h.lane('approved').querySelector('[data-board-id]');
  const transfer: string[] = [];
  await h.emit('dragstart', card, { dataTransfer: { setData: (_type: string, value: string) => transfer.push(value) } });
  const error = new Error('Timed out'); error.name = 'AbortError'; h.setMutationError(error);
  const dropped = await h.emit('drop', h.lane('resolved'));
  assert.equal(dropped.defaultPrevented, true);
  assert.equal(transfer[0], card.dataset.boardId);
  assert.equal(h.workflowEvents[0].action,'complete');
  assert.equal(h.lane('approved').querySelector('[data-board-id]'), card);
  assert.equal(h.reloads, 0);
  assert.equal(h.requests.some(request=>request.options.method==='PATCH'),false);
  assert.equal(h.timers.size, 0);
});
