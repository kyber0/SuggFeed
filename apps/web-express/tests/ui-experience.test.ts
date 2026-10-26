import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Eta } from 'eta';
import {createWorkspacePreview} from './support/workspace-preview';

test('roadmap and staff filter toolbars neutralize stacked label spacing and match control heights',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/css/modules/workspace.css'),'utf8');
  assert.match(css,/:is\(\.roadmap-controls,\.staff-search-form\) > label \{ margin-bottom:0; \}/);
  assert.match(css,/:is\(\.roadmap-controls,\.staff-search-form\) > \.workspace-button \{ min-height:44px; \}/);
});
test('calendar arrows share the scale control row and Manage work removes stacked label offsets',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/css/modules/community.css'),'utf8');
  const timeline=fs.readFileSync(path.join(__dirname,'../public/css/modules/roadmap.css'),'utf8');
  assert.match(timeline,/\.work-timeline-heading \.timeline-controls \{[^}]*display:flex;[^}]*gap:8px;[^}]*flex-wrap:wrap;/);
  assert.match(timeline,/\.work-timeline-heading \.timeline-controls :is\(button,select\) \{min-height:44px;/);
  assert.match(css,/\.staff-board-toolbar label \{display:grid;[^}]*margin-bottom:0;/);
});

// Exercise the preview's real Eta rendering without binding a local HTTP port.
function render(url:string){
  const app=createWorkspacePreview(),parsed=new URL(url,'https://preview.test');
  const layer=(app as any)._router.stack.find((entry:any)=>entry.route?.path===parsed.pathname);
  assert.ok(layer,'Known preview route');let html='';
  layer.route.stack[0].handle({query:Object.fromEntries(parsed.searchParams)}, {send(value:string){html=value;}},()=>{});
  assert.ok(html);return html;
}
test('Other views marks the selected view and retains native filtered navigation links',()=>{
  const html=render('/roadmap?view=timeline&search=library&category=Facilities');
  const menu=html.match(/<details class="roadmap-other-views"[\s\S]*?<\/details>/)![0];
  assert.match(menu,/aria-label="Other views: Work calendar"/);
  assert.match(menu,/data-roadmap-view="timeline" aria-current="page"/);
  assert.match(menu,/href="#ws-calendar"/);assert.match(menu,/href="#ws-check"/);
  assert.match(menu,/recorded work dates, not deadlines/);
  const hrefs=[...menu.matchAll(/<a href="([^"]+)"/g)].map(match=>new URL(match[1].replace(/&amp;|&#38;/g,'&'),'https://preview.test'));
  assert.equal(hrefs.length,3);assert.deepEqual(hrefs.map(url=>url.searchParams.get('view')),['tree','timeline','done']);
  assert.ok(hrefs.every(url=>url.searchParams.get('search')==='library' && url.searchParams.get('category')==='Facilities' && url.searchParams.get('page')==='1'));
  assert.doesNotMatch(menu,/role="menu"|role="menuitem"/);
});
test('main student and staff screens render the shared keyboard navigation and correct current-page cue',()=>{
  for(const route of ['/feed','/roadmap','/admin','/admin/board','/admin/community','/notifications','/inbox']){
    const html=render(route);assert.match(html,/class="system-skip-link" href="#page-content"/);
    assert.match(html,/id="page-content" tabindex="-1"/);assert.match(html,/aria-label="Primary navigation"/);
    assert.equal((html.match(/id="page-content"/g)||[]).length,1);
  }
  assert.match(render('/roadmap'),/href="\/roadmap" aria-current="page"/);
});
test('notifications prioritize the update stream and keep preferences available as native disclosure',()=>{
  const html=render('/notifications');
  assert.ok(html.indexOf('id="notification-stream-title"')<html.indexOf('id="notification-preferences"'));
  assert.match(html,/<details class="care-card notification-settings">/);
  assert.match(html,/<summary>Notification preferences<\/summary>/);
  for(const id of ['notification-list','notification-more','notification-retry','notification-preferences'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
});
test('private messages keep the tracking-code form intact but do not dominate signed-in messages',()=>{
  const html=render('/inbox');assert.match(html,/<details class="care-card inbox-code-panel" >/);
  assert.match(html,/id="private-code-form"/);assert.match(html,/name="trackingCode" autocomplete="off"/);
  assert.match(html,/id="private-messages"/);assert.doesNotMatch(html,/value="CV-/);
});
test('workboard and care render one shared review drawer with exact-ID opening controls',()=>{
  for(const route of ['/admin/board','/admin/community']){
    const html=render(route);assert.equal((html.match(/id="staff-review-dialog"/g)||[]).length,1);
    assert.match(html,/\/js\/staff-review.js/);assert.match(html,/href="\/admin\/(?:work|reviews|community)\?[^" ]*idea=[^"]+" data-review=/);
  }
  assert.match(render('/admin/community'),/data-review-section="progress"/);
});
test('full-width detail workspaces separate context from history and editing without duplicating controls',()=>{
  const roadmap=render('/roadmap'),admin=render('/admin/board');
  assert.match(roadmap,/class="roadmap-detail-overview"/);
  assert.match(admin,/class="staff-review-context"/);assert.match(admin,/class="staff-notes-layout"/);assert.match(admin,/class="staff-progress-layout"/);
  for(const id of ['review-description','staff-review-form','staff-progress-form','staff-internal-note-form'])assert.equal((admin.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  const css=fs.readFileSync(path.join(__dirname,'../public/css/modules/full-detail.css'),'utf8');
  assert.match(css,/inset:0; margin:0; width:100%; max-width:100%/);
  assert.match(css,/height:100dvh; max-height:100dvh/);assert.match(css,/@media\(max-width:960px\)/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
test('new account and staff menu entries have decorative SVGs backed by the shared sprite',()=>{
  const html=render('/admin/community');
  const account=html.match(/<div class="dropdown-menu"[\s\S]*?<form action="\/auth\/signout"/)![0];
  for(const target of ['/admin','/','/profile/help','/account/security']){
    const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(account,new RegExp('<a href="'+escaped+'"[^>]*>\\s*<svg[^>]*aria-hidden="true"[^>]*><use href="#ws-'));
  }
  for(const target of ['/profile','/notifications','/inbox'])assert.equal(account.includes('href="'+target+'"'),false);
  const sidebar=html.match(/<aside class="staff-sidebar"[\s\S]*?<\/aside>/)![0];
  assert.match(sidebar,/href="\/admin\/work"[^>]*><svg[^>]*><use href="#ws-board"/);
  assert.match(sidebar,/href="\/admin\/community"[^>]*><svg[^>]*><use href="#ws-care"/);
  const care=html.match(/<nav class="care-section-nav"[\s\S]*?<\/nav>/)![0];assert.equal((care.match(/aria-hidden="true"/g)||[]).length,3);
  for(const [,symbol] of html.matchAll(/<use href="#(ws-[\w-]+)"/g))assert.ok(html.includes('id="'+symbol+'"'),'Missing sprite: '+symbol);
  const board=render('/admin/board');assert.match(board,/href="\/admin\/work" aria-current="page"/);
});
test('shared staff detail keeps status and close controls in a compact header with one title',()=>{
 const html=render('/admin/board');
 const header=html.match(/<header class="workspace-dialog-header staff-detail-topbar">[\s\S]*?<\/header>/)![0];
 assert.match(header,/id="review-current-status"/);assert.match(header,/data-close-review aria-label="Close detail"/);
 assert.equal((html.match(/id="review-title"/g)||[]).length,1);
 assert.match(html,/<h2 id="review-title"><\/h2>/);assert.match(html,/<p id="review-meta"/);
 const css=fs.readFileSync(path.join(__dirname,'../public/css/modules/staff-detail.css'),'utf8');
 assert.match(css,/\.staff-detail-topbar \{[^}]*padding:12px 22px;/);
 assert.match(css,/@media\(max-width:600px\)/);
});
function contrast(hex1:string,hex2:string){
  const luminance=(hex:string)=>{const c=hex.match(/\w\w/g)!.map(part=>parseInt(part,16)/255).map(n=>n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const a=luminance(hex1),b=luminance(hex2);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
test('shared secondary text tokens meet normal-text contrast on main light and dark surfaces',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/css/modules/experience.css'),'utf8');
  assert.match(css,/--muted:#526b82/);assert.match(css,/--muted:#a9bdd0/);
  for(const bg of ['ffffff','f8fafc','f0f4f8'])assert.ok(contrast('526b82',bg)>=4.5);
  for(const bg of ['102a43','061a2b','0c2134'])assert.ok(contrast('a9bdd0',bg)>=4.5);
  assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/font-size:16px/);
});


test('school layout retains tenant metadata without restoring the removed school banner', () => {
  const eta = new Eta({ views: path.join(__dirname, '../views') });
  for (const role of ['student', 'admin']) {
    const html = eta.render('layout', { currentPath: '/feed', body: '', schoolBase: '/s/campus-a', schoolId: 'school-a-id', schoolName: 'Campus A', user: { id: 'member-a', role } });
    assert.doesNotMatch(html,/aria-label="Current school"/);
    assert.doesNotMatch(html,/href="\/s\/campus-a\/admin\/school-settings"/);
    assert.match(html, /name="school-base" content="\/s\/campus-a"/);
    assert.match(html, /name="school-id" content="school-a-id"/);
    assert.match(html, /name="school-actor" content="member-a"/);
  }
});
