"""Local-only Playwright audit. Start tests/support/mobile-preview.ts first.
Usage: python tests/browser/mobile-responsive.py --output /tmp/sf-mobile-audit/after
Requires Python Playwright and Chromium (no production credentials).
"""
import argparse, asyncio, json, os, pathlib
from urllib.parse import urlparse
from playwright.async_api import async_playwright
WIDTHS=[320,360,375,390,412,430,768]
ID='00000000-0000-4000-8000-000000000002'
CASES=[('home','/'),('feed','/feed'),('feed-empty','/feed?empty=1'),('idea','/idea/'+ID),('profile','/profile'),('profile-long-name','/profile?persona=member'),('profile-guest','/profile?persona=guest'),('inbox','/inbox'),('notifications','/notifications'),('roadmap-board','/roadmap'),('roadmap-tree','/roadmap?view=tree'),('roadmap-timeline','/roadmap?view=timeline'),('roadmap-done','/roadmap?view=done'),('roadmap-empty','/roadmap?empty=1'),('admin','/admin'),('admin-empty','/admin?empty=1'),('work-board','/admin/board'),('work-empty','/admin/board?empty=1'),('staff-community','/admin/community'),('analytics','/admin/analytics'),('staff','/admin/staff'),('staff-login','/staff-login'),('schools-guest','/schools'),('schools-empty','/schools?member=1'),('schools-memberships','/preview/member-schools'),('settings','/preview/settings-full'),('invitations-empty','/preview/invitations'),('invitations','/preview/invitations-full'),('invitation','/preview/invitation'),('invitation-expired','/preview/invitation?state=expired'),('platform-empty','/preview/platform'),('platform','/preview/platform-full'),('customization-reviews','/preview/reviews'),('form-responses','/preview/responses'),('form-answers','/preview/answers'),('school-notice','/preview/school-notice'),('school-message','/preview/message'),('security','/account/security'),('callback','/auth/callback'),('recovery','/auth/recovery'),('confirmation','/auth/confirm'),('unsubscribe','/digest/unsubscribe'),('privacy','/privacy'),('terms','/terms'),('403','/403'),('404','/404'),('500','/500'),('studio','/s/demo/admin/customization')]
# Open the actual app components without posting any form or contacting a hosted service.
STATES=[('signin','/feed','auth-signin'),('signup','/feed','auth-signup'),('forgot','/feed','auth-forgot'),('submit','/','submit'),('submit-description','/','submit-description'),('submit-review','/','submit-review'),('idea-drawer','/feed','idea-drawer'),('roadmap-detail','/roadmap','roadmap-detail'),('staff-review','/admin','staff-review'),('staff-progress','/admin','staff-progress'),('staff-notes','/admin','staff-notes'),('confirmation-dialog','/feed','confirmation-dialog'),('report-dialog','/feed','report-dialog'),('security-setup','/account/security','security-setup'),('new-password','/auth/recovery','new-password'),('studio-components','/s/demo/admin/customization','studio-components'),('studio-properties','/s/demo/admin/customization','studio-properties'),('studio-publish','/s/demo/admin/customization','studio-publish'),('studio-history','/s/demo/admin/customization','studio-history'),('studio-conflict','/s/demo/admin/customization','studio-conflict'),('school-application','/preview/member-schools','school-application'),('platform-policy','/preview/platform-full','platform-policy'),('save-view','/admin','save-view'),('revoke-staff','/admin/staff','revoke-staff'),('work-record','/roadmap?view=timeline','work-record'),('account-menu','/profile','account-menu'),('feed-menu','/feed','feed-menu'),('roadmap-view-menu','/roadmap','roadmap-view-menu'),('staff-menu','/admin','staff-menu'),('tracking','/','tracking'),('toast','/feed','toast'),('submit-recovery','/','submit-recovery'),('studio-controls','/s/demo/admin/customization','studio-controls'),('studio-theme-fields','/s/demo/admin/customization','studio-theme-fields'),('keyboard-signup','/feed','keyboard-signup'),('keyboard-submit','/','keyboard-submit'),('school-submit-form','/s/demo/admin/customization/preview/content?page=submit','school-submit-form')]
CASES=[(*c,None) for c in CASES]+STATES
CASES += [('school-'+name,'/s/demo/admin/customization/preview/content?page='+name,None) for name in ['home','feed','roadmap','idea','profile','submit','notifications','inbox','staff']]

EXPECTED={
 'auth-signin':'#panel-signin','auth-signup':'#panel-signup','auth-forgot':'#panel-forgot',
 'submit':'#sip-step-1','submit-description':'#sip-step-2','submit-review':'#sip-step-3','submit-recovery':'.submission-recovery[open]',
 'idea-drawer':'#idea-detail-drawer','roadmap-detail':'#roadmap-dialog[open]','work-record':'#work-record-dialog[open]',
 'staff-review':'#staff-review-dialog[open]','staff-progress':'#review-panel-progress','staff-notes':'#review-panel-notes',
 'confirmation-dialog':'#sf-confirm-dialog[open]','report-dialog':'#content-report-dialog[open]',
 'security-setup':'#security-setup','new-password':'#auth-reset-form',
 'studio-components':'#studio-pages','studio-properties':'#studio-properties','studio-publish':'#studio-review-dialog[open]',
 'studio-history':'#studio-history-dialog[open]','studio-conflict':'#studio-conflict-dialog[open]',
 'studio-controls':'.studio-preview-controls[open]','studio-theme-fields':'.studio-theme-mode[open]',
 'school-application':'.school-directory-secondary[open]','platform-policy':'.platform-policy[open]',
 'save-view':'#staff-save-view-dialog[open]','revoke-staff':'#staff-revoke-dialog[open]',
 'account-menu':'#header-dropdown:not([hidden])','feed-menu':'.post-menu-dropdown:not([hidden])',
 'roadmap-view-menu':'.roadmap-other-views[open]','staff-menu':'.staff-navigation-disclosure[open]',
 'tracking':'#panel-track','toast':'.sf-toast','keyboard-signup':'#auth-dialog[open]','keyboard-submit':'#submit-panel','school-submit-form':'#sip-step-2'
}

OPEN=r'''async state=>{
 const show=id=>{const e=document.getElementById(id);if(e){e.hidden=false;e.removeAttribute('hidden');}};
 if(state?.startsWith('auth-')){window.openAuthModal?.(state==='auth-signup'?'signup':'signin');if(state==='auth-forgot')document.getElementById('btn-to-forgot')?.click();}
 if(state?.startsWith('submit')){window.openSubmitPanel?.();if(state==='submit-description'||state==='submit-review'){document.getElementById('sip-title').value='A better campus learning space';document.querySelector('input[name="sip-category"]')?.click();document.querySelector('#sip-next-btn,#sip-next,[data-sip-next]')?.click();}if(state==='submit-review'){document.getElementById('sip-description').value='A fictional suggestion to make the learning space more welcoming for students.';document.querySelector('#sip-next-btn,#sip-next,[data-sip-next]')?.click();}}
 if(state==='idea-drawer')document.querySelector('[data-sf-click="open-detail"]')?.click();
 if(state==='roadmap-detail')document.querySelector('[data-roadmap-open]')?.click();
 if(state?.startsWith('staff-')){document.querySelector('[data-review]')?.click();for(let i=0;document.getElementById('staff-review-dialog')?.getAttribute('aria-busy')==='true';i++){if(i>200)throw new Error('Staff detail fixture did not finish loading');await new Promise(r=>setTimeout(r,25));}if(state==='staff-progress')document.getElementById('review-tab-progress')?.click();if(state==='staff-notes')document.getElementById('review-tab-notes')?.click();}
 if(state==='confirmation-dialog'){document.getElementById('sf-confirm-message').textContent='Confirm this fictional local change?';document.getElementById('sf-confirm-dialog').showModal();}
 if(state==='report-dialog')document.getElementById('content-report-dialog')?.showModal();
 if(state==='security-setup'){show('security-setup');show('security-form');document.getElementById('security-secret').textContent='ABCDEFGHIJKLMNOPQRSTUVWX23456789';document.getElementById('security-qr').src='/icon-192.png';}
 if(state==='new-password'){show('auth-reset-form');document.getElementById('auth-callback-title').textContent='Choose a new password';}
 if(state==='studio-controls')document.querySelector('.studio-preview-controls')?.setAttribute('open','');
 if(state==='studio-theme-fields'){document.querySelector('[data-open-panel="properties"]')?.click();document.querySelectorAll('.studio-theme-mode').forEach(e=>e.setAttribute('open',''));}
 if(state==='studio-components')document.querySelector('[data-open-panel="pages"]')?.click();
 if(state==='studio-properties')document.querySelector('[data-open-panel="properties"]')?.click();
 if(state==='studio-publish')document.getElementById('studio-review-dialog')?.showModal();
 if(state==='studio-history')document.getElementById('studio-history-dialog')?.showModal();
 if(state==='studio-conflict')document.getElementById('studio-conflict-dialog')?.showModal();
 if(state==='school-application')document.querySelector('.school-directory-secondary')?.setAttribute('open','');
 if(state==='save-view')document.getElementById('staff-open-save-view')?.click();
 if(state==='revoke-staff')document.getElementById('staff-revoke-dialog')?.showModal();
 if(state==='work-record')document.querySelector('[data-timeline-open]')?.click();
 if(state==='account-menu')document.getElementById('header-avatar-btn')?.click();
 if(state==='feed-menu')document.querySelector('.post-menu-btn')?.click();
 if(state==='roadmap-view-menu')document.querySelector('.roadmap-other-views')?.setAttribute('open','');
 if(state==='staff-menu')document.querySelector('.staff-navigation-disclosure')?.setAttribute('open','');
 if(state==='tracking')document.getElementById('tab-track')?.click();
 if(state==='toast')window.sfToast?.('A fictional status message with a long school contact address: long.institutional.contact.address@example.invalid','info');
 if(state==='submit-recovery')document.querySelector('.submission-recovery')?.setAttribute('open','');
 if(state==='keyboard-signup'||state==='keyboard-submit'){if(state==='keyboard-signup')window.openAuthModal?.('signup');else window.openSubmitPanel?.();document.documentElement.setAttribute('data-virtual-keyboard','');document.documentElement.style.setProperty('--sf-viewport-height','320px');document.documentElement.style.setProperty('--sf-viewport-top','0px');}
 if(state==='school-submit-form'){document.getElementById('sip-step-1').hidden=true;document.getElementById('sip-step-2').hidden=false;}
 if(state==='platform-policy')document.querySelector('.platform-policy')?.setAttribute('open','');
}'''
MEASURE=r'''()=>{
 const width=document.documentElement.clientWidth,closedDetails=[...document.querySelectorAll('details:not([open])')];
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return e.checkVisibility({checkVisibilityCSS:true})&&r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden],[inert]')&&!closedDetails.some(d=>d.contains(e)&&e!==d&&!d.querySelector('summary')?.contains(e));};
 const overflow=[...document.body.querySelectorAll('*')].filter(e=>{if(!visible(e))return false;const r=e.getBoundingClientRect();if(r.right<=width+1&&r.left>=-1)return false;for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX))return false;}return true;}).slice(0,18).map(e=>({element:e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'?'.'+e.className.trim().replaceAll(' ','.'):''),left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right)}));
 const controls=[...document.querySelectorAll('input,select,textarea')].filter(e=>visible(e)&&!['checkbox','radio','range','hidden','color','file','submit','button'].includes(e.type));
 const smallInputs=controls.filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id||e.name||e.tagName);
 const dialogs=[...document.querySelectorAll('dialog[open],[role=dialog]:not([hidden])')].filter(visible).map(e=>({id:e.id,height:Math.round(e.getBoundingClientRect().height),width:Math.round(e.getBoundingClientRect().width),outside:e.getBoundingClientRect().top < -1||e.getBoundingClientRect().bottom>(document.documentElement.hasAttribute('data-virtual-keyboard')?320:innerHeight)+1}));
 const clippedRect=e=>{const r=e.getBoundingClientRect(),bounds={left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)};for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){bounds.left=Math.max(bounds.left,b.left);bounds.right=Math.min(bounds.right,b.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){bounds.top=Math.max(bounds.top,b.top);bounds.bottom=Math.min(bounds.bottom,b.bottom);}}return bounds;};
 const layer=e=>e.closest('dialog,[role=dialog],.mobile-tab-bar,.studio-panel,.site-header');
 const targets=[...document.querySelectorAll('button,[role=button],summary,nav a,a.workspace-button,a.platform-button,.idea-secondary-actions > a,.submission-file-list > a')].filter(e=>visible(e)&&!e.disabled&&e.getBoundingClientRect().bottom>0&&e.getBoundingClientRect().top<innerHeight&&document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)?.closest('button,[role=button],summary,nav a,a.workspace-button,a.platform-button,.idea-secondary-actions > a,.submission-file-list > a')===e);
 const smallTargets=targets.filter(e=>e.getBoundingClientRect().height<43.5||e.getBoundingClientRect().width<43.5).map(e=>e.id||e.className);
 const overlaps=[];for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){const a=targets[i],b=targets[j];if(a.contains(b)||b.contains(a)||layer(a)!==layer(b)||a.id==='studio-sheet-backdrop'||b.id==='studio-sheet-backdrop')continue;const x=clippedRect(a),y=clippedRect(b);if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)overlaps.push([a.id||a.className,b.id||b.className]);}
 const unreachableClose=[...document.querySelectorAll('#auth-modal-close,.sip-close-btn')].filter(visible).filter(e=>{const r=e.getBoundingClientRect(),limit=document.documentElement.hasAttribute('data-virtual-keyboard')?320:innerHeight;return r.top<0||r.bottom>limit+1;}).map(e=>e.id||e.className);
 const scrollAreas=[...document.querySelectorAll('.staff-review-scroll,.sip-scroll-body,.workspace-dialog-body,.am-scroll-body')].filter(visible).map(e=>({element:e.className,height:e.clientHeight,scrollHeight:e.scrollHeight}));
 return {unreachableClose,smallTargets,overlaps,scrollAreas,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,overflow,smallInputs,dialogs};
}'''
async def main():
 parser=argparse.ArgumentParser();parser.add_argument('--origin',default='http://127.0.0.1:4340');parser.add_argument('--output',default='/tmp/sf-mobile-audit/after');parser.add_argument('--widths',default=','.join(map(str,WIDTHS)));parser.add_argument('--portrait-only',action='store_true');parser.add_argument('--screenshots',action='store_true');parser.add_argument('--filter',default='');parser.add_argument('--report-only',action='store_true');parser.add_argument('--unmask',action='store_true');parser.add_argument('--desktop',action='store_true');parser.add_argument('--touch',action='store_true');args=parser.parse_args()
 if urlparse(args.origin).hostname not in ('127.0.0.1','localhost'):raise SystemExit('Use local fixtures only.')
 output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True);cases=[c for c in CASES if args.filter in c[0]];queue=asyncio.Queue();results=[]
 for width in map(int,args.widths.split(',')):
  for orient in (['portrait'] if args.portrait_only else ['portrait','landscape']):
   for case in cases:queue.put_nowait((width,orient,case))
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
  async def worker():
   context=await browser.new_context(reduced_motion='reduce',service_workers='block',has_touch=args.touch,is_mobile=args.touch);await context.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname in ('127.0.0.1','localhost') or r.request.url.startswith('data:') else r.abort())
   page=await context.new_page()
   while not queue.empty():
    width,orient,(name,path,state)=queue.get_nowait();long_edge=1024 if width==768 else 844
    w,h=(width,long_edge) if orient=='portrait' else (long_edge,width)
    row={'screen':name,'width':width,'orientation':orient,'viewportWidth':w,'path':path}
    try:
     await page.set_viewport_size({'width':w,'height':h});response=await page.goto(args.origin+path,wait_until='load');row['http']=response.status
     await page.evaluate('document.fonts.ready');await page.wait_for_timeout(100)
     if args.unmask:await page.add_style_tag(content='html{overflow-x:visible!important}')
     if '/admin/customization' in path:await page.wait_for_function('!document.getElementById("studio-frame-loading") || document.getElementById("studio-frame-loading").hidden',timeout=10000)
     if state:await page.evaluate(OPEN,state);await page.wait_for_timeout(100)
     row.update(await page.evaluate(MEASURE))
     row['stateOpened']=not state or await page.locator(EXPECTED[state]).first.is_visible()
     if args.screenshots and width==360 and orient=='portrait':await page.screenshot(path=str(output/(name+'.png')),full_page=False)
     row['passed']=row['http']==200 and row['stateOpened'] and row['documentWidth']<=w and not row['overflow'] and (args.desktop or (not row['smallInputs'] and not row['smallTargets'])) and not row['overlaps'] and not row['unreachableClose'] and not any(d['outside'] for d in row['dialogs'])
    except Exception as error:row.update(passed=False,error=str(error)[:300])
    results.append(row);queue.task_done()
   await context.close()
  await asyncio.gather(*(worker() for _ in range(4)));await browser.close()
 results.sort(key=lambda r:(r['screen'],r['width'],r['orientation']));(output/'results.json').write_text(json.dumps(results,indent=2));failed=[r for r in results if not r['passed']];print(json.dumps({'checked':len(results),'failed':len(failed),'report':str(output/'results.json')}))
 for r in failed[:35]:print(json.dumps(r))
 if failed and not args.report_only:raise SystemExit(1)
if __name__=='__main__':asyncio.run(main())
