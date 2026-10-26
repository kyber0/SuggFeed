// Optional local characterization check. --record updates snapshots only for reviewed UI changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=path.join(__dirname,'../tests/fixtures/studio-inspector.json');
async function main(){
 const app=express();
 if(process.env.STUDIO_INSPECTOR_SOURCE){const ts=require('typescript'),source=fs.readFileSync(process.env.STUDIO_INSPECTOR_SOURCE,'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;app.get('/js/school-studio-inspector.js',(_req,res)=>res.type('application/javascript').send(js));}
 app.use(express.static(path.join(__dirname,'../public')));app.get('/favicon.ico',(_req,res)=>res.sendStatus(204));
 app.get('/',(_req,res)=>res.send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/js/school-colors.js"></script><script src="/js/school-design.js"></script><script src="/js/school-studio-inspector.js"></script></head><body><main id="fixture"></main></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let browser;const snapshots=[];
 try {
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  for(const width of [320,1440]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
   await page.goto('http://127.0.0.1:'+server.address().port+'/');
   const cases=await page.evaluate(()=>{
    const configuration={displayName:'',palette:'navy',logo:null,cover:null,welcome:{headline:'',intro:'',message:'Welcome <students>',help:'Ask the school team.',links:[{label:'School & support',url:'https://school.example.test/help'}]},categories:[{id:'cat-1',name:'Campus <life>',slug:'campus-life',description:'Ideas & feedback',icon:'book',active:true}],form:{instructions:'Share an idea.',example:'Example',attachments:'optional',questions:['short','long','choice'].map(type=>({id:'q-'+type,label:'Question '+type,help:'Helpful guidance',type,required:true,options:type==='choice'?['First','Second']:[]}))},features:{comments:true,voting:true,roadmap:true,sharing:true,anonymous:true},labels:{approved:'Planned',in_progress:'In progress',resolved:'Completed'},stageDescriptions:{approved:'Ready',in_progress:'Working',resolved:'Done'},email:{invitation:'Welcome',introduction:'School',digest:'weekly'}};
    const selections=['','school.theme','page.home','section.home.hero','school.identity','home.hero','home.links','community.categories','category:cat-1','submission.instructions','question:q-short','question:q-long','question:q-choice','community.features','progress.labels','school.email','category:missing','school.unknown'];
    const results=[];
    for(const pane of ['content','design'])for(const readOnly of [false,true])for(const selection of selections){
     const panel=document.createElement('aside');panel.className='studio-panel';const host=document.createElement('div');panel.append(host);document.getElementById('fixture').replaceChildren(panel);const writes=[];
     const model={endGroup(){},getState:()=>({configuration:structuredClone(configuration),selection:{componentId:selection}}),applyChange:(...args)=>writes.push(args),batch:changes=>writes.push(changes)};
     const settings={base:'/local-fixture',schoolName:'Fictional school',icons:['book','shield'],pane,componentId:()=>selection,readOnly:()=>readOnly,say(){},uploading(){},request(){throw new Error('Preview must not send requests');}};
     const inspector=sfSchoolStudioInspector.mount(host,model,settings);inspector.render();
     const html=host.innerHTML;
     if(selection==='home.hero'){panel.style.cssText='height:50px;overflow:auto';let field=host.querySelector('[data-property="headline"]');field.focus();field.setSelectionRange(2,5);panel.scrollTop=30;const scroll=panel.scrollTop;inspector.render();field=host.querySelector('[data-property="headline"]');if(document.activeElement!==field||field.selectionStart!==2||field.selectionEnd!==5||panel.scrollTop!==scroll)throw new Error('Rendering lost focus, caret or scroll');field.value='A revised welcome';field.dispatchEvent(new Event('input',{bubbles:true}));if(readOnly){if(writes.length)throw new Error('Read-only editor wrote changes');}else if(!writes.some(args=>args[0]==='home.hero'&&args[1]==='headline'&&args[2]==='A revised welcome'))throw new Error('Inline change was lost');}
     if(selection==='school.theme'&&pane==='design'&&!readOnly){let dark=Array.from(host.querySelectorAll('details')).find(el=>el.querySelector('summary')?.textContent==='Dark appearance');dark.open=true;const field=host.querySelector('input[type="text"][data-theme-mode="light"][data-theme-role="primary"]');field.value='#12';field.dispatchEvent(new Event('input',{bubbles:true}));if(!inspector.hasPending()||writes.length)throw new Error('Incomplete color was committed');inspector.render();dark=Array.from(host.querySelectorAll('details')).find(el=>el.querySelector('summary')?.textContent==='Dark appearance');const restored=host.querySelector('input[type="text"][data-theme-mode="light"][data-theme-role="primary"]');if(!dark.open||restored.value!=='#12'||restored.getAttribute('aria-invalid')!=='true')throw new Error('Rendering lost pending color or disclosure state');}
     results.push({pane,readOnly,selection,html});
    }
    return results;
   });
   assert.deepEqual(errors,[]);
   for(const {html,...entry} of cases)snapshots.push({width,...entry,sha256:crypto.createHash('sha256').update(html).digest('hex')});
   await page.close();
  }
  if(process.argv.includes('--record'))fs.writeFileSync(fixture,JSON.stringify(snapshots,null,2)+'\n');
  else assert.deepEqual(snapshots,JSON.parse(fs.readFileSync(fixture,'utf8')),'Inspector output differs from its reviewed pre-refactor characterization');
  console.log(JSON.stringify({cases:snapshots.length,passed:true,recorded:process.argv.includes('--record')}));
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
