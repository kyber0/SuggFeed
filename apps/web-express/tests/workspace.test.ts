import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspacePreview } from './support/workspace-preview';

test('staff and roadmap render populated, empty, and login screens', async () => {
  const app = createWorkspacePreview();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  try {
    const get = async (route: string) => {
      const response = await fetch('http://127.0.0.1:' + address.port + route);
      assert.equal(response.status, 200, route);
      return response.text();
    };
    const staff = await get('/admin');
    assert.match(staff, /Review queue/);
    assert.match(staff, /page=2/);
    assert.match(staff, /staff-review-dialog/);
    assert.match(await get('/admin?empty=1'), /No submissions here yet/);
    assert.match(await get('/staff-login'), /autocomplete="current-password"/);
    const roadmap = await get('/roadmap');
    assert.match(roadmap, /Completed/);
    assert.doesNotMatch(roadmap, /Effort:|Q3 2026|Campus Ops|Staff Editor/);
    assert.match(await get('/roadmap?empty=1'), /Nothing here yet/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
