const BUSINESS_PATH = /^\/(?:$|[?#]|feed(?:[/?#]|$)|roadmap(?:[/?#]|$)|idea(?:[/?#]|$)|api(?:[/?#]|$)|admin(?:[/?#]|$)|staff(?:[/?#]|$)|staff-login(?:[/?#]|$)|profile(?:[/?#]|$)|notifications(?:[/?#]|$)|inbox(?:[/?#]|$)|digest(?:[/?#]|$)|privacy(?:[/?#]|$)|terms(?:[/?#]|$))/;
export function schoolPath(base: string, path: string): string {
  return /^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base) && !path.startsWith('//') && !path.includes('\\') && BUSINESS_PATH.test(path) ? base + path : path;
}
/** Rewrite only URL attributes after escaping/rendering, never user text or JSON payloads. */
export function schoolHtml(html: string, base: string): string {
  return html.replace(/(\b(?:href|action|data-[\w-]+)=["'])(\/[^"']*)(["'])/g,
    (_match, prefix: string, path: string, suffix: string) => prefix + schoolPath(base, path) + suffix);
}
