/** Never log tracking capabilities or query strings, including legacy clients. */
export function safeRequestPath(url:string) {
  return url.split('?')[0].replace(/^\/api\/track\/[^/]+/, '/api/track/[redacted]');
}
