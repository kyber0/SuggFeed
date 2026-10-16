import { getCorsHeaders } from './security.ts';

/** Legacy clients have no trusted school context; never construct a service client. */
export function retiredSchoolEndpoint(request: Request): Response {
  const headers = { ...getCorsHeaders(request), 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  return Response.json({ ok: false, code: 'SCHOOL_CLIENT_RETIRED',
    error: 'This client is retired. Open the SuggFeed website and choose your school.' }, { status: 410, headers });
}
