// Optional local browser check; use existing external Playwright tooling, never hosted school data.
const assert=require('node:assert/strict'),path=require('node:path'),express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function main(){
 const app=express();app.use(express.static(path.join(__dirname,'../public')));
 app.get('/favicon.ico',(_req,res)=>res.sendStatus(204));
 app.get('/',(_req,res)=>res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/modules/school-design.css"><script src="/js/school-colors.js"></script><script src="/js/school-design.js"></script></head><body><main class="sf-main"><section class="sf-hero" id="hero">Welcome</section><section id="feed">Ideas</section><section class="landing-progress" id="progress">Progress</section></main></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 let browser;const results=[];
 try {
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const width of [320,375,768,1440])for(const mode of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   await page.goto('http://127.0.0.1:'+server.address().port+'/');
   const result=await page.evaluate(mode=>{
    document.documentElement.dataset.theme=mode;const design=SfSchoolDesign.defaults('forest');design.pages.home={...SfSchoolDesign.pageDefaults(),hidden:['progress'],order:['ideas','hero']};
    SfSchoolColors.apply(document.body,'forest');SfSchoolDesign.apply(document.body,design,'home');
    const themed={color:getComputedStyle(document.body).getPropertyValue('--sd-primary').trim(),hidden:document.getElementById('progress').hasAttribute('data-school-section-hidden'),order:Array.from(document.querySelector('main').children).map(el=>el.id)};
    SfSchoolDesign.apply(document.body,undefined,'home','navy');
    return {...themed,reset:!document.body.hasAttribute('data-school-design')&&!document.getElementById('progress').hasAttribute('data-school-section-hidden'),overflow:document.documentElement.scrollWidth>innerWidth};
   },mode);
   assert.deepEqual(errors,[]);assert.equal(result.color,'#166534');assert.equal(result.hidden,true);assert.deepEqual(result.order.slice(0,2),['feed','hero']);assert.equal(result.reset,true);assert.equal(result.overflow,false);
   results.push({width,mode,passed:true});await page.close();
  }
  console.log(JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
