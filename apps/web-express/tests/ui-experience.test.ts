import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createWorkspacePreview} from './support/workspace-preview';

// Exercise the preview's real Eta rendering without binding a local HTTP port.
function render(url:string){
  const app=createWorkspacePreview(),parsed=new URL(url,'https://preview.test');
  const layer=(app as any)._router.stack.find((entry:any)=>entry.route?.path===parsed.pathname);
  assert.ok(layer,'Known preview route');let html='';
  layer.route.stack[0].handle({query:Object.fromEntries(parsed.searchParams)}, {send(value:string){html=value;}},()=>{});
  assert.ok(html);return html;
}
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
    assert.match(html,/\/js\/staff-review.js/);assert.match(html,/href="\/admin\?idea=[^"]+" data-review=/);
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
  for(const target of ['/profile','/notifications','/feed?scope=following','/inbox','/admin']){
    const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(account,new RegExp('<a href="'+escaped+'"[^>]*>\\s*<svg[^>]*aria-hidden="true"[^>]*><use href="#ws-'));
  }
  const sidebar=html.match(/<aside class="staff-sidebar"[\s\S]*?<\/aside>/)![0];
  assert.match(sidebar,/href="\/admin\/board"[^>]*><svg[^>]*><use href="#ws-board"/);
  assert.match(sidebar,/href="\/admin\/community"[^>]*><svg[^>]*><use href="#ws-care"/);
  const care=html.match(/<nav class="care-section-nav"[\s\S]*?<\/nav>/)![0];assert.equal((care.match(/aria-hidden="true"/g)||[]).length,4);
  for(const [,symbol] of html.matchAll(/<use href="#(ws-[\w-]+)"/g))assert.ok(html.includes('id="'+symbol+'"'),'Missing sprite: '+symbol);
  const board=render('/admin/board');assert.match(board,/href="\/admin\/board" aria-current="page"/);
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
