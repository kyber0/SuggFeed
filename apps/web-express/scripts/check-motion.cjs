// Synthetic local fixtures only; set PLAYWRIGHT_MODULE for externally installed tooling.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MOTION_BASE_URL || 'http://127.0.0.1:4320';
const stage = Number(process.argv[2] || 8);
const wait = page => page.waitForTimeout(850);
async function instrument(page) {
 await page.addInitScript(() => {
  addEventListener('pagereveal',event=>{window.__sfTransitionSnapshotReady=document.documentElement.hasAttribute('data-sf-transitions');if(event.viewTransition)event.viewTransition.ready.then(()=>{window.__sfPageTransitionRan=document.getAnimations().some(animation=>animation.animationName==='sf-page-in');});});
  const frames = new Set(), observers = [], signals = [], manual = [];
  window.__motionResources = { frames, observers, signals, manual };
  const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
   const ours = new Error().stack.includes('/js/animations.js');
   const id = request(time => { frames.delete(id); callback(time); });
   if (ours) frames.add(id); return id;
  };
  window.cancelAnimationFrame = id => { frames.delete(id); cancel(id); };
  for (const name of ['IntersectionObserver', 'MutationObserver', 'ResizeObserver']) {
   const Native = window[name];
   window[name] = class extends Native {
    constructor(...args) { super(...args); this.targets = new Set(); if(new Error().stack.includes('/js/animations.js'))observers.push(this); }
    observe(target, ...args) { this.targets.add(target); return super.observe(target, ...args); }
    unobserve(target) { this.targets.delete(target); return super.unobserve(target); }
    disconnect() { this.targets.clear(); return super.disconnect(); }
   };
  }
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, callback, options) {
   if(new Error().stack.includes('/js/animations.js')){if(options?.signal)signals.push(options.signal);else if(!options?.once)manual.push({target:this,type,callback,removed:false});}
   return add.call(this, type, callback, options);
  };
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener=function(type,callback,options){manual.forEach(record=>{if(record.target===this&&record.type===type&&record.callback===callback)record.removed=true;});return remove.call(this,type,callback,options);};
 });
}
async function resourcesReleased(page) {
 await page.evaluate(() => window.sfMotion.destroy());
 await page.waitForTimeout(60);
 assert.deepEqual(await page.evaluate(() => ({ frames:__motionResources.frames.size, observers:__motionResources.observers.filter(o=>o.targets.size).length, signals:__motionResources.signals.filter(signal=>!signal.aborted).length,manual:__motionResources.manual.filter(record=>!record.removed).length })), {frames:0,observers:0,signals:0,manual:0}, 'teardown must release every owned resource');
}
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 try {
  for (const width of [320,375,768,1440]) {
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
   await instrument(page); page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/feed'); await wait(page);
   assert.equal(await page.evaluate(()=>typeof window.sfMotion?.mount),'function');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
   await page.evaluate(()=>{const first=sfMotion;first.mount(document);first.mount(document);window.__motionSame=first===sfMotion;});
   assert(await page.evaluate(()=>__motionSame),'root identity');
   await page.mouse.move(700,350); await page.mouse.wheel(0,400); await wait(page);
   assert(await page.evaluate(()=>innerWidth>=900?document.querySelector('.community-feed-main').scrollTop>0:scrollY>0),'wheel scrolling');
   if(stage>=2) {
    assert(await page.locator('.post-card').first().evaluate(el=>el.hasAttribute('data-sf-motion-item')),'shared reveal ownership');
    await page.evaluate(()=>{const card=document.createElement('article');card.id='motion-added';card.dataset.sfReveal='slide-up';card.textContent='Fictional appended content';document.getElementById('page-content').append(card);sfMotion.refresh(card);});
    await page.locator('#motion-added').scrollIntoViewIfNeeded(); await wait(page);
    assert.equal(await page.locator('#motion-added').evaluate(el=>getComputedStyle(el).opacity),'1');
   }
   if(stage>=8) {
    const wrapping=await page.evaluate(()=>{const h=document.createElement('h1');h.textContent='学校の意見を共有してキャンパスを改善しましょう'.repeat(4);h.style.maxWidth='280px';h.style.fontSize='36px';h.dataset.sfSplitText='words';document.getElementById('page-content').prepend(h);const before=h.getBoundingClientRect().height;sfMotion.refresh(h);return {before,after:h.getBoundingClientRect().height};});
    assert.equal(wrapping.after,wrapping.before,'custom multilingual headlines keep native wrapping');
    const card=page.locator('.post-card').first();await card.scrollIntoViewIfNeeded();await card.hover();await page.mouse.move(0,0);await wait(page);
    const feedback=await card.evaluate(el=>({properties:getComputedStyle(el).transitionProperty,animations:el.getAnimations().length}));
    assert(!/color|shadow|all|translate|scale/.test(feedback.properties));assert.equal(feedback.animations,0,'hover release must not restart an entrance');
   }
   await resourcesReleased(page);await page.evaluate(()=>{sfMotion.mount(document);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('[data-sf-cursor]'));
   assert.equal(await page.locator('[data-sf-cursor]').count(),0);
   await resourcesReleased(page);assert.deepEqual(errors,[]);await page.close();console.log('responsive, cleanup, reduced motion:',width,'passed');
  }
  if(stage<8)return;
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await instrument(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await wait(page);
  const heading=page.locator('#page-content h1').first(),text=await heading.textContent(),box=await heading.boundingBox();
  assert(await page.locator('[data-sf-word]').count()>0);
  const button=page.locator('[data-sf-magnetic]').first(),target=await button.boundingBox();
  assert.equal(await button.locator('[data-sf-magnetic-inner]').count(),1);
  await page.mouse.move(target.x+target.width-4,target.y+target.height/2);await page.waitForTimeout(300);
  assert.deepEqual(await button.boundingBox(),target,'magnetic hit target is stationary');
  const magnetic=await button.locator('[data-sf-magnetic-inner]').evaluate(el=>getComputedStyle(el).transform);
  assert.notEqual(magnetic,'none');
  await page.mouse.down();await page.waitForTimeout(250);assert.deepEqual(await button.boundingBox(),target,'pressed magnetic hit target is stationary');await page.mouse.move(0,0);await page.mouse.up();
  await page.mouse.move(700,300);await page.waitForTimeout(250);assert.equal(await page.locator('[data-sf-cursor]').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.keyboard.press('Tab');assert.equal(await page.locator('[data-sf-cursor]').evaluate(el=>getComputedStyle(el).opacity),'0');
  await button.click();assert.equal(new URL(page.url()).hash,'#action-hub');await wait(page);
  await page.evaluate(()=>{const area=document.createElement('div');area.id='nested-scroll';area.dataset.sfNativeScroll='';Object.assign(area.style,{position:'fixed',top:'200px',left:'20px',width:'200px',height:'100px',overflow:'auto',zIndex:'9999'});area.innerHTML='<div style="height:1000px">Fictional nested scrolling region</div>';document.body.append(area);});
  const outer=await page.evaluate(()=>scrollY);await page.mouse.move(100,250);await page.mouse.wheel(0,300);await wait(page);
  assert(await page.locator('#nested-scroll').evaluate(el=>el.scrollTop>0));assert.equal(await page.evaluate(()=>scrollY),outer);await page.locator('#nested-scroll').evaluate(el=>el.remove());
  await page.keyboard.press('Control+f');assert(!await page.locator('html').evaluate(el=>el.classList.contains('lenis')),'browser find keeps native scroll');await page.keyboard.press('Escape');
  await resourcesReleased(page);assert.equal(await heading.textContent(),text);assert.equal(await page.locator('[data-sf-word],[data-sf-magnetic-inner]').count(),0);
  const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:1440,height:1000}});await nojs.goto(base+'/');
  assert.equal(await nojs.locator('#page-content h1').first().textContent(),text);const plainBox=await nojs.locator('#page-content h1').first().boundingBox();assert.equal(plainBox.height,box.height,'word wrappers must not reflow headline');await nojs.close();
  await page.goto(base+'/feed');await page.evaluate(()=>{const strip=document.createElement('section');strip.dataset.sfMarquee='';strip.innerHTML='<a id="marquee-original" href="#fixture">Fictional opt-in marquee, not production content.</a>';document.getElementById('page-content').prepend(strip);sfMotion.refresh(strip);});await page.waitForTimeout(250);
  assert(await page.locator('[data-sf-marquee-clone]').count()>0);assert.equal(await page.locator('#marquee-original').count(),1);
  assert(await page.locator('[data-sf-marquee-clone]').first().evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'));
  const pause=page.locator('[data-sf-marquee-toggle]');await pause.focus();await page.keyboard.press('Enter');assert.equal(await pause.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-sf-marquee-track]').evaluate(el=>el.getAnimations()[0].playState),'paused');
  await resourcesReleased(page);assert.equal(await page.locator('[data-sf-marquee-clone]').count(),0);assert.equal(await page.locator('#marquee-original').count(),1);
  // Simulate BFCache lifecycle without discarding the document.
  await page.evaluate(()=>{sfMotion.mount(document);dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await resourcesReleased(page);
  await page.goto(base+'/feed');await page.evaluate(()=>{if(innerWidth>=900)document.querySelector('.community-feed-main').scrollTop=700;else scrollTo(0,700);});await wait(page);const position=await page.evaluate(()=>innerWidth>=900?document.querySelector('.community-feed-main').scrollTop:scrollY);
  await page.locator('.site-header a[href="/roadmap"]').evaluate(link=>link.click());await page.waitForURL('**/roadmap');await wait(page);if(await page.evaluate(()=>typeof ViewTransition!=='undefined'))assert(await page.evaluate(()=>__sfTransitionSnapshotReady&&__sfPageTransitionRan),'native transition must capture named page before deferred initialization');await page.goBack();await wait(page);await page.waitForFunction(expected=>Math.abs((innerWidth>=900?document.querySelector('.community-feed-main').scrollTop:scrollY)-expected)<3,position,{timeout:5000}).catch(async error=>{throw new Error(`History restoration expected ${position}: ${JSON.stringify(await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,restoration:history.scrollRestoration,lenis:document.documentElement.className})))}`,{cause:error});});const restored=await page.evaluate(()=>innerWidth>=900?document.querySelector('.community-feed-main').scrollTop:scrollY);assert(Math.abs(restored-position)<3,`history position restoration: ${position} -> ${restored}`);
  for(const route of ['/profile','/roadmap?view=timeline','/admin/board','/preview/invitations','/account/security','/schools','/preview/platform','/privacy','/404']){await page.goto(base+route);await wait(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' overflow');}
  // Private preview executes only the isolated frame controller and motion bundle.
  await page.goto(base+'/__motion/preview');assert.equal(await page.locator('[data-sf-word],[data-sf-cursor]').count(),0);
  const writeRequests=[];page.on('request',request=>{if(request.method()!=='GET')writeRequests.push(request.url());});
  await page.evaluate(()=>postMessage({protocol:1,instanceId:'00000000-0000-4000-8000-000000000001',sequence:1000,type:'set-mode',payload:{mode:'preview'}},location.origin));
  await page.waitForFunction(()=>document.documentElement.dataset.studioMode==='preview');await wait(page);assert(await page.locator('[data-sf-word]').count()>0);
  await page.locator('[data-sf-magnetic]').first().click();
  await page.evaluate(()=>postMessage({protocol:1,instanceId:'00000000-0000-4000-8000-000000000001',sequence:1001,type:'set-mode',payload:{mode:'edit'}},location.origin));
  await page.waitForFunction(()=>document.documentElement.dataset.studioMode==='edit');assert.equal(await page.locator('[data-sf-word],[data-sf-cursor]').count(),0);assert.deepEqual(writeRequests,[]);
  await resourcesReleased(page);assert.deepEqual(errors,[]);await page.close();
  for(const options of [{hasTouch:true,isMobile:true},{reducedMotion:'reduce'}, {saveData:true}]) {
   const {saveData,...settings}=options;const fallback=await browser.newPage({viewport:{width:375,height:900},...settings});
   if(saveData)await fallback.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
   await fallback.goto(base+'/');await wait(fallback);assert.equal(await fallback.locator('[data-sf-cursor],[data-sf-magnetic-inner]').count(),0);assert(!await fallback.locator('html').evaluate(el=>el.classList.contains('lenis')));await fallback.close();
  }
  const keyboard=await browser.newPage({viewport:{width:1440,height:900}});await keyboard.goto(base+'/feed');await keyboard.waitForFunction(()=>document.documentElement.classList.contains('lenis'));
  await keyboard.locator('.community-feed-main').focus();await keyboard.mouse.move(700,400);await keyboard.mouse.wheel(0,300);await keyboard.waitForTimeout(60);await keyboard.keyboard.press('PageDown');await wait(keyboard);
  assert(await keyboard.evaluate(()=>innerWidth>=900?document.querySelector('.community-feed-main').scrollTop>600:scrollY>600),'keyboard scroll must not be pulled back by active wheel inertia');await keyboard.close();
  const delayed=await browser.newPage();let releaseVendor;const vendorGate=new Promise(resolve=>releaseVendor=resolve);
  await delayed.route('**/js/vendor/lenis.js*',async route=>{await vendorGate;await route.continue();});
  await delayed.goto(base+'/',{waitUntil:'domcontentloaded'});await delayed.keyboard.press('Control+f');releaseVendor();await delayed.waitForFunction(()=>Boolean(window.Lenis));await wait(delayed);
  assert(!await delayed.locator('html').evaluate(el=>el.classList.contains('lenis')),'late vendor must not re-enable inertial scroll after browser Find');await delayed.close();
  const blocked=await browser.newPage();await blocked.route('**/js/vendor/lenis.js*',route=>route.abort());await blocked.goto(base+'/');await wait(blocked);assert.equal(await blocked.locator('#page-content h1').first().evaluate(el=>getComputedStyle(el).opacity),'1');await blocked.close();
  console.log('headlines, cursor, magnetic, nested scroll, history, preview, marquee, fallbacks: passed');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
