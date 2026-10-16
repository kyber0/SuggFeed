import { retiredSchoolEndpoint } from './retired-school-endpoint.ts';

Deno.test('legacy school endpoints fail closed for every credential and body', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const request = new Request('https://functions.example.test/archive-old-submissions', {
      method,
      headers: { Authorization: 'Bearer old-service-role-key' },
      ...(method === 'POST' ? { body: '{invalid json with forged school_id' } : {}),
    });
    const response = retiredSchoolEndpoint(request);
    if (response.status !== 410 || response.headers.get('Cache-Control') !== 'no-store') throw new Error('Legacy endpoint was not retired');
    if ((await response.json()).code !== 'SCHOOL_CLIENT_RETIRED') throw new Error('Unexpected retirement contract');
  }
  const preflight = retiredSchoolEndpoint(new Request('https://functions.example.test/submit-feedback', { method: 'OPTIONS' }));
  if (preflight.status !== 200) throw new Error('Preflight unavailable');
});
