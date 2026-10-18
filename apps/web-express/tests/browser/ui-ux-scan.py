"""Read-only local UI scan. Start tests/support/ui-audit-preview.ts on port 4319.
Geometry and opaque contrast diagnostics are heuristic; confirmed defects have
explicit assertions in ui-ux-audit.py. External network requests are blocked.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
paths=['/','/feed','/feed?empty=1','/roadmap','/roadmap?view=timeline','/roadmap?view=tree','/roadmap?view=done','/profile?persona=guest','/profile?persona=long','/notifications','/inbox','/idea/00000000-0000-4000-8000-000000000002','/admin','/admin/board','/admin/analytics','/admin/staff','/admin/community','/staff-login','/privacy','/terms','/403','/404','/500','/digest/unsubscribe','/auth/callback','/auth/recovery','/schools','/schools?member=1','/preview/school-settings','/preview/invitations','/preview/invitation?state=expired','/preview/platform','/preview/school-notice','/preview/message','/account/security']
measure='''()=>{
 const visible=e=>e.checkVisibility();
 const name=e=>e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map(id=>document.getElementById(id)?.textContent || '').join(' ').trim() || Array.from(e.labels || []).map(l=>l.textContent).join(' ').trim() || e.innerText?.trim() || e.getAttribute('title') || e.querySelector('img')?.alt;
 const controls=Array.from(document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea')).filter(visible);
 const rgb=s=>{const v=s.match(/[\\d.]+/g);return v?v.map((n,i)=>Number(n)*(s.startsWith('color(srgb ') && i<3?255:1)):[0,0,0,0]};
 const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const contrast=[];
 for(const e of document.querySelectorAll('p,small,label,button,a,span,h1,h2,h3,h4')){
  if(!visible(e) || !e.textContent.trim() || e.children.length || getComputedStyle(e).opacity!=='1')continue;
  const style=getComputedStyle(e),color=rgb(style.color);if(color.length>3 && color[3]<1)continue;
  let bg=null,parent=e;
  while(parent){const ps=getComputedStyle(parent);if(ps.backgroundImage!=='none'){bg=null;break;}const value=rgb(ps.backgroundColor);if(value.length===3 || value[3]===1){bg=value;break;}if(value[3]>0){bg=null;break;}parent=parent.parentElement;}
  if(!bg)continue;const a=lum(color),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && parseInt(style.fontWeight)>=700);
  if(ratio<(large?3:4.5))contrast.push({text:e.textContent.trim().slice(0,55),class:e.className,ratio:Math.round(ratio*100)/100,color:style.color,bg});
 }
 return {overflow:document.documentElement.scrollWidth>innerWidth+1,width:innerWidth,scroll:document.documentElement.scrollWidth,unnamed:controls.filter(e=>!name(e)).map(e=>({tag:e.tagName,id:e.id,class:e.className})),smallTargets:controls.filter(e=>e.tagName==='BUTTON' && e.getBoundingClientRect().height<32).map(e=>({name:name(e),h:e.getBoundingClientRect().height})).slice(0,8),contrast:contrast.slice(0,12)};
}'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(service_workers='block');c.route('https://**/*',lambda r:r.abort());pg=c.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)));out=[]
 for theme in ['light','dark']:
  for width in [320,390,768,1440]:
   pg.set_viewport_size({'width':width,'height':900})
   for path in paths:
    pg.goto('http://127.0.0.1:4319'+path);pg.evaluate('(theme)=>{sfPreferences.write("theme",theme);document.documentElement.dataset.theme=theme}',theme)
    pg.add_style_tag(content='*,*::before,*::after{transition:none!important;animation:none!important}');result=pg.evaluate(measure);out.append({'path':path,'theme':theme,**result})
 # Reproduce overlapping custom modal keyboard handlers.
 pg.goto('http://127.0.0.1:4319/feed');pg.evaluate('openSubmitPanel()');pg.evaluate('openAuthModal("signin")');pg.locator('#signin-email').focus();pg.keyboard.press('Tab');modalFocus=pg.evaluate('document.querySelector("#auth-modal").contains(document.activeElement)')
 Path('/tmp/suggfeed-ui-audit.json').write_text(json.dumps({'screens':out,'errors':errors,'nestedAuthFocus':modalFocus},indent=2));
 for width,theme,path,name in [(390,'light','/admin/analytics','analytics-mobile'),(1440,'dark','/admin/analytics','analytics-dark'),(390,'dark','/preview/school-settings','settings-mobile'),(1440,'light','/preview/platform','platform-desktop')]:
  pg.set_viewport_size({'width':width,'height':900});pg.goto('http://127.0.0.1:4319'+path);pg.evaluate('(t)=>{document.documentElement.dataset.theme=t}',theme);pg.add_style_tag(content='*,*::before,*::after{transition:none!important;animation:none!important}');pg.screenshot(path='/tmp/sf-product-'+name+'.png',full_page=True)
 b.close()
 print(json.dumps({'cases':len(out),'overflow':[(r['path'],r['width'],r['theme']) for r in out if r['overflow']],'unnamed':[(r['path'],r['width'],r['unnamed']) for r in out if r['unnamed']][:14],'contrastExamples':[(r['path'],r['theme'],r['contrast']) for r in out if r['contrast']][:6],'nestedAuthFocus':modalFocus,'errors':list(set(errors))},indent=2))
