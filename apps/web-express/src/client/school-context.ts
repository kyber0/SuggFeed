// Rendered school context is fixed for this document; switching schools loads a new page.
const sfSchoolBase = (() => {
  const base = document.querySelector<HTMLMetaElement>('meta[name="school-base"]')?.content || '';
  return /^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base) ? base : '';
})();
function sfSchoolPath(input: string): string {
  if (!sfSchoolBase || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) return input;
  if (!/^\/(?:$|[?#]|help(?:[/?#]|$)|feed(?:[/?#]|$)|roadmap(?:[/?#]|$)|idea(?:[/?#]|$)|api(?:[/?#]|$)|admin(?:[/?#]|$)|staff(?:[/?#]|$)|staff-login(?:[/?#]|$)|profile(?:[/?#]|$)|notifications(?:[/?#]|$)|inbox(?:[/?#]|$)|digest(?:[/?#]|$)|privacy(?:[/?#]|$)|terms(?:[/?#]|$))/.test(input)) return input;
  return sfSchoolBase + input;
}
function sfSchoolRoute(path: string): string {
  return sfSchoolBase && (path === sfSchoolBase || path.startsWith(sfSchoolBase + '/')) ? path.slice(sfSchoolBase.length) || '/' : path;
}
function sfSchoolKey(key: string): string {
  const school = document.querySelector<HTMLMetaElement>('meta[name="school-id"]')?.content || sfSchoolBase || 'no-school';
  const actor = document.querySelector<HTMLMetaElement>('meta[name="school-actor"]')?.content || document.getElementById('sf-auth-config')?.dataset.user || 'anonymous';
  return 'sf:school:' + encodeURIComponent(school) + ':actor:' + encodeURIComponent(actor) + ':' + key;
}
const sfSchoolRequests = new Set<AbortController>();
async function sfSchoolFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const destination = new URL(raw, window.location.href);
  const path = destination.origin === window.location.origin
    ? sfSchoolPath(destination.pathname + destination.search + destination.hash) : raw;
  const url = new URL(path, window.location.href);
  if (sfSchoolBase && url.origin === window.location.origin && url.pathname.startsWith('/s/')
      && url.pathname !== sfSchoolBase && !url.pathname.startsWith(sfSchoolBase + '/')) {
    throw new Error('Switch schools before loading another school’s records.');
  }
  const controller = new AbortController();
  const signal = options.signal || (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
  const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  sfSchoolRequests.add(controller);
  const finished = () => { sfSchoolRequests.delete(controller); };
  try {
    const response = await fetch(typeof input === 'object' && 'url' in input ? new Request(path, input) : path,
      { ...options, cache: 'no-store', signal: combined });
    // Keep cancellation active through body parsing, which can outlast the response headers.
    for (const method of ['json', 'text', 'blob', 'arrayBuffer', 'formData'] as const) {
      const read = response[method].bind(response);
      Object.defineProperty(response, method, { value: () => read().finally(finished) });
    }
    if (!response.body) finished();
    return response;
  } catch (error) {
    finished();
    throw error;
  }
}
window.addEventListener('pagehide', () => {
  for (const request of sfSchoolRequests) request.abort();
  // A restored document must recheck membership and account identity before showing private UI.
  if (sfSchoolBase) document.documentElement.style.visibility = 'hidden';
});
window.addEventListener('pageshow', event => {
  if (sfSchoolBase && event.persisted) window.location.reload();
});

async function sfClearSchoolState(): Promise<void> {
  const actor = document.querySelector<HTMLMetaElement>('meta[name="school-actor"]')?.content || document.getElementById('sf-auth-config')?.dataset.user || 'anonymous';
  const marker = ':actor:' + encodeURIComponent(actor) + ':';
  for (const request of sfSchoolRequests) request.abort();
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key?.startsWith('sf:school:') && (key.includes(marker)||key.endsWith(':sign-in-draft:v1'))) storage.removeItem(key);
      }
    } catch { /* Storage is optional. */ }
  }
  try {
    for (const db of await indexedDB.databases()) {
      if (db.name?.startsWith('sf:school:') && db.name.includes(marker)) indexedDB.deleteDatabase(db.name);
    }
  } catch { /* Namespaces still prevent restoring another account's drafts. */ }
}
