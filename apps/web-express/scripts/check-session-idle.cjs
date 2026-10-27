// Optional local browser checks; Playwright is supplied externally, not a runtime dependency.
const assert=require('node:assert/strict'),path=require('node:path'),express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function main(){
 const app=express(),states=new Map();
 const state=req=>{const id=req.get('X-Fixture-Case')||'default';if(!states.has(id)){const now=Date.now();states.set(id,{expiresAt:now+1800000,lastActivityAt:now,activity:0,revoked:false,offset:0});}return states.get(id);};
 const payload=s=>({expiresAt:s.expiresAt,serverNow:Date.now()+s.offset,warningMs:120000,activityIntervalMs:60000});
 app.use(express.json());app.use(express.static(path.join(__dirname,'../public')));
 app.get('/favicon.ico',(_req,res)=>res.sendStatus(204));
 app.get('/',(req,res)=>{const s=state(req);res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/modules/session-idle.css"><style>:root{--surface:#fff;--ink:#112e46;--ink-2:#334155;--line:#ccd5e0;--navy:#1e40af;--muted:#64748b}body{font:16px Arial;margin:16px}iframe{max-width:100%;box-sizing:border-box}</style></head><body><h1>Synthetic session fixture</h1><iframe id="studio-frame" srcdoc="<button>Preview component</button>"></iframe><script id="sf-session-idle" type="application/json">${JSON.stringify(payload(s))}</script><dialog class="sf-idle-dialog" id="sf-idle-warning" aria-labelledby="sf-idle-title"><h2 id="sf-idle-title">Still working?</h2><p>Stay signed in to continue.</p><p id="sf-idle-status" role="status"></p><div class="app-confirm-actions"><button id="sf-idle-signout">Sign out</button><button class="app-confirm-accept" id="sf-idle-continue">Stay signed in</button></div></dialog><script>window.sfExpireSession=()=>{document.body.dataset.expired='true'};window.sfSignOut=async()=>{document.body.dataset.signedOut='true'}</script><script defer src="/js/session-idle.js"></script></body></html>`);});
 app.all('/auth/session/:action?',(req,res)=>{const s=state(req);res.setHeader('Cache-Control','no-store');if(s.revoked)return res.status(401).json({success:false,code:'SESSION_IDLE_EXPIRED'});if(req.params.action==='activity'){s.activity++;s.lastActivityAt=Date.now()+s.offset;s.expiresAt=s.lastActivityAt+1800000;}res.json({success:true,user:{id:'synthetic'},idle:payload(s)});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let browser;const results=[],errors=[];
 try{
  browser=await chromium.launch({headless:true,...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}});
  const origin='http://127.0.0.1:'+server.address().port;
  async function page(id,width,context){const p=await(context||browser).newPage({viewport:{width,height:800},extraHTTPHeaders:{'X-Fixture-Case':id}});p.on('pageerror',error=>errors.push(error.message));await p.clock.install({time:Date.now()});await p.goto(origin);return p;}
  for(const width of [320,375,768,1440]){
   const id='expiry-'+width,p=await page(id,width);states.get(id).offset=1681000;await p.clock.fastForward(1681000);await p.waitForFunction(()=>document.getElementById('sf-idle-warning').open);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);states.get(id).revoked=true;states.get(id).offset+=121000;
   await p.clock.fastForward(121000);await p.waitForFunction(()=>document.body.dataset.expired==='true');results.push({case:'warning-and-expiry',width,passed:true});await p.close();
  }
  const id='continue',p=await page(id,375);states.get(id).offset=1681000;await p.clock.fastForward(1681000);await p.waitForFunction(()=>document.getElementById('sf-idle-warning').open);await p.getByRole('button',{name:'Stay signed in'}).focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>!document.getElementById('sf-idle-warning').open);assert.equal(states.get(id).activity,1);results.push({case:'keyboard-explicit-continue',width:375,passed:true});await p.close();
  const frameId='iframe',f=await page(frameId,1440);await f.frameLocator('iframe').getByRole('button').waitFor();states.get(frameId).offset=61000;await f.clock.fastForward(61000);const activity=f.waitForResponse(r=>r.url().endsWith('/auth/session/activity'));await f.frameLocator('iframe').getByRole('button').click();await f.clock.fastForward(100);await activity;assert.equal(states.get(frameId).activity,1);results.push({case:'trusted-studio-iframe-activity',width:1440,passed:true});await f.close();
  const context=await browser.newContext({extraHTTPHeaders:{'X-Fixture-Case':'shared'}});const one=await page('shared',1440,context),two=await page('shared',375,context);states.get('shared').offset=1681000;await one.clock.fastForward(1681000);await two.clock.fastForward(1681000);await one.bringToFront();await one.waitForFunction(()=>document.getElementById('sf-idle-warning').open);await one.getByRole('button',{name:'Stay signed in'}).click();await two.bringToFront();await two.waitForFunction(()=>!document.getElementById('sf-idle-warning').open);assert.equal(states.get('shared').activity,1);results.push({case:'other-tab-activity-preserves-session',passed:true});await context.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
