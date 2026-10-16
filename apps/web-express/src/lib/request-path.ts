/** Never log tracking capabilities or query strings, including legacy clients. */
export function safeRequestPath(url:string) {
  return url.split('?')[0].replace(/^(\/s\/[^/]+)?\/api\/track\/[^/]+/, '$1/api/track/[redacted]').replace(/^\/schools\/invitations\/[^/]+/, '/schools/invitations/[redacted]');
}
