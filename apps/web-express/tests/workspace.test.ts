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
    assert.match(staff, /href="\/admin\/analytics"/);
    assert.match(staff, /href="\/admin\/staff"/);
    const sidebarMatch = staff.match(/<aside class="staff-sidebar"[\s\S]*?<\/aside>/);
    assert.ok(sidebarMatch);
    assert.doesNotMatch(sidebarMatch[0], /href="\/roadmap"/);
    assert.doesNotMatch(sidebarMatch[0], /href="\/feed"/);
    assert.match(await get('/admin?empty=1'), /No submissions here yet/);
    assert.match(await get('/staff-login'), /autocomplete="current-password"/);
    const analytics = await get('/admin/analytics');
    assert.match(analytics, /Analytics & metrics/);
    assert.match(analytics, /Activity & Volume Trends/);
    assert.match(analytics, /Moderation Pipeline/);
    assert.match(analytics, /Category Distribution/);
    assert.match(analytics, /admin-analytics\.js/);
    const staffMgmt = await get('/admin/staff');
    assert.match(staffMgmt, /Staff & access management/);
    assert.match(staffMgmt, /Staff Directory/);
    assert.match(staffMgmt, /Promote Registered User/);
    assert.match(staffMgmt, /Invite Team Member/);
    assert.match(staffMgmt, /admin-staff\.js/);
    const membersRes = JSON.parse(await get('/api/staff/members'));
    assert.equal(membersRes.success, true);
    assert.equal(membersRes.members.length, 1);
    const roadmap = await get('/roadmap');
    assert.match(roadmap, /Completed/);
    assert.doesNotMatch(roadmap, /Effort:|Q3 2026|Campus Ops|Staff Editor/);
    assert.match(await get('/roadmap?empty=1'), /Nothing here yet/);
    const feed = await get('/feed');
    assert.match(feed, /Community ideas/);
    assert.match(feed, /id="feed-search-form"/);
    assert.equal((feed.match(/<article class="post-card"/g) || []).length, 15);
    const feedMain = feed.match(/<main class="community-feed-main"[\s\S]*?<\/main>/)![0];
    assert.doesNotMatch(feedMain, /role="feed"|role="tablist"|@anon|>Trending</);
    assert.match(await get('/feed?search=no-such-idea'), /No ideas match your search/);
    assert.match(await get('/feed?empty=1'), /The next great idea could be yours/);
    const filtered = await get('/feed?search=library&category=Learning');
    assert.match(filtered, /matching ideas/);
    assert.doesNotMatch(filtered, /Water refill stations/);
    const secondPage = JSON.parse(await get('/api/feed?page=2'));
    assert.equal(secondPage.feed.length, 15);
    assert.equal(secondPage.hasMore, true);
    assert.match(await get('/admin/board'),/Review bulk assignment/);
    assert.match(await get('/admin/community'),/Content reports/);
    assert.match(await get('/inbox'),/School messages/);
    assert.match(await get('/notifications'),/Notification preferences/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
