import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const runner=require('../scripts/check-live-security.cjs');
function fixture(){
 const runId=randomUUID();return {version:1,target:'https://www.suggfeed.me',runId,expiresAt:new Date(Date.now()+3600000).toISOString(),approval:{realUsersPaused:true,noSensitiveData:true,backupRestoreVerified:true,disposableFixturesOnly:true,backupEvidence:'Synthetic unit-test record, not a live backup assertion'},schools:Object.fromEntries(['a','b'].map(key=>[key,{slug:'sec-test-'+runId.slice(0,8)+'-'+key,id:randomUUID(),privateIdeaId:randomUUID(),publicIdeaId:randomUUID()}])),accounts:Object.fromEntries(['studentA','peerA','moderatorA','adminA','studentB','moderatorB','adminB','operator'].map(actor=>[actor,{userId:randomUUID(),cookie:'connect.sid=s%3Asynthetic-private-'+actor+'-cookie-value'}]))};
}
function reply(probe:any){
 const expect=probe.expect;let body:any={success:!expect.denied};const headers:any={'Content-Type':'application/json'};
 if(expect.userId)body.user={id:expect.userId};if(expect.contains)body.title=expect.contains;if(expect.feedId)body.feed=[{id:expect.feedId}];if(expect.emptyFeed)body.feed=[];if(expect.location)headers.Location=expect.location;
 if(expect.htmlMarker){headers['Content-Type']='text/html';body='<input value="&lt;svg onload=&quot;'+expect.htmlMarker+'&quot;&gt;">';}
 return new Response(typeof body==='string'?body:JSON.stringify(body),{status:expect.denied?403:expect.status,headers});
}
test('default plan and import make no network requests',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Network forbidden in plan');}) as any;
 try{assert.equal((await runner.main([])).networkRequests,0);assert.equal((await runner.main(['--plan'])).liveTestsRun,false);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('acknowledgements, approval window, fixed target and disposable fixture identity are required',()=>{
 const config=fixture();assert.doesNotThrow(()=>runner.validate(config));
 for(const key of Object.keys(config.approval).filter(key=>key!=='backupEvidence')){const bad=structuredClone(config);bad.approval[key]=false;assert.throws(()=>runner.validate(bad));}
 for(const patch of [{target:'https://attacker.invalid/'},{expiresAt:new Date(0).toISOString()},{expiresAt:new Date(Date.now()+86400000).toISOString()}])assert.throws(()=>runner.validate({...config,...patch}));
 const bad=structuredClone(config);bad.schools.a.slug='demo';assert.throws(()=>runner.validate(bad));bad.schools.a.slug=config.schools.a.slug;bad.accounts.studentA.cookie+='\r\nInjected: value';assert.throws(()=>runner.validate(bad));
});
test('invalid manifest and expiry after waiting stop before any request',async()=>{
 let calls=0;const config=fixture();await assert.rejects(runner.execute({...config,target:'http://www.suggfeed.me'},{fetchImpl:async()=>{calls++;}}));
 const expiry=Date.parse(config.expiresAt);let now=Date.now();const result=await runner.execute(config,{now:()=>now,pause:async()=>{now=expiry+1;},fetchImpl:async()=>{calls++;}});assert.equal(result.reason,'approval_expired');assert.equal(calls,0);
});
test('bounded cases use the reviewed origin and POST only denied disposable signout probes',()=>{
 const config=fixture(),cases=runner.cases(config);assert.ok(cases.length<=64);assert.equal(new Set(cases.map((p:any)=>p.id)).size,cases.length);
 for(const probe of cases){assert.equal(new URL(probe.route,config.target).origin,config.target);if(probe.method){assert.equal(probe.method,'POST');assert.equal(probe.route,'/auth/signout');assert.equal(probe.expect.status,403);}}
});
test('runner is serial, does not follow redirects and evidence excludes cookies and user IDs',async()=>{
 const config=fixture(),cases=runner.cases(config);let index=0,active=0,maxActive=0;
 const result=await runner.execute(config,{pause:async()=>{},fetchImpl:async(url:URL,options:any)=>{active++;maxActive=Math.max(maxActive,active);assert.equal(url.origin,config.target);assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);await Promise.resolve();const response=reply(cases[index++]);active--;return response;}});
 assert.equal(result.status,'passed');assert.equal(index,cases.length);assert.equal(maxActive,1);
 for(const account of Object.values(config.accounts) as any[]){assert.equal(JSON.stringify(result).includes(account.cookie),false);assert.equal(JSON.stringify(result).includes(account.userId),false);}
});
test('service errors, rate limits, timeouts and oversized responses stop without retries',async()=>{
 for(const status of [429,500,503,'timeout','oversize'] as const){
  let calls=0;const result=await runner.execute(fixture(),{pause:async()=>{},fetchImpl:async()=>{calls++;if(status==='timeout')throw Error('synthetic abort');return new Response(status==='oversize'?'x'.repeat(512*1024+1):'{}',{status:status==='oversize'?200:status});}});assert.equal(result.status,'stopped');assert.equal(calls,1);assert.equal(result.results.length,1);
 }
});
test('unexpected allowed private data stops the run without recording the response body',async()=>{
 const config=fixture(),cases=runner.cases(config);let index=0;
 const result=await runner.execute(config,{pause:async()=>{},fetchImpl:async()=>{const probe=cases[index++];return probe.expect.denied?new Response('synthetic-private-leak',{status:200}):reply(probe);}});
 assert.equal(result.status,'stopped');assert.equal(index,cases.findIndex((probe:any)=>probe.expect.denied)+1);assert.equal(JSON.stringify(result).includes('synthetic-private-leak'),false);
});
test('HTML probe inspects executable marker locations without claiming browser execution testing',()=>{
 const probe={expect:{status:200,htmlMarker:'synthetic-marker'}};const response=new Response('',{status:200,headers:{'Content-Type':'text/html'}});
 assert.doesNotThrow(()=>runner.evaluate(probe,response,'<input value="&lt;svg synthetic-marker&gt;">'));assert.throws(()=>runner.evaluate(probe,response,'<svg onload="synthetic-marker"></svg>'));assert.throws(()=>runner.evaluate(probe,response,'<script>synthetic-marker</script>'));
});
test('CLI rejects readable manifests and existing evidence before network work',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sf-live-runner-')),manifest=path.join(directory,'manifest.json'),evidence=path.join(directory,'evidence.json');const original=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Network forbidden');}) as any;
 try{fs.writeFileSync(manifest,JSON.stringify(fixture()),{mode:0o644});fs.chmodSync(manifest,0o644);await assert.rejects(runner.main(['--run','--manifest',manifest,'--evidence',evidence]));fs.chmodSync(manifest,0o600);fs.writeFileSync(evidence,'existing evidence');await assert.rejects(runner.main(['--run','--manifest',manifest,'--evidence',evidence]));assert.equal(calls,0);assert.equal(fs.readFileSync(evidence,'utf8'),'existing evidence');}
 finally{globalThis.fetch=original;fs.rmSync(directory,{recursive:true,force:true});}
});
