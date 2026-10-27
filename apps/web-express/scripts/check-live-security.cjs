// Preparation by default. Live probes require a private, explicitly approved fixture manifest.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const TARGET='https://www.suggfeed.me';
const ACTORS=['studentA','peerA','moderatorA','adminA','studentB','moderatorB','adminB','operator'];
const MAX_REQUESTS=64,MAX_BYTES=512*1024;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function plan(){return {mode:'plan',networkRequests:0,liveTestsRun:false,target:TARGET,maxRequests:MAX_REQUESTS,concurrency:1,minimumIntervalMs:500,coverage:['fixture identity controls','private-answer positive controls','cross-school denial','same-school ownership and assignment','admin-only safety access','platform/school separation','literal SQL/PostgREST search probes','reflected HTML marker inspection','CSRF signout rejection'],manualCoverage:['stored and DOM XSS execution in a real browser','private uploads and progress evidence with/without MFA','direct Supabase RLS with disposable user tokens','30-minute idle expiry and fresh sign-in','revoked memberships','bounded rate-limit boundary','signup/recovery/invitation delivery to an owned test inbox'],excluded:['load tests','destructive SQL','data extraction','external callbacks','database wipe','automatic fixture creation/deletion']};}
function validate(config,now=Date.now()){
 assert.equal(config?.version,1,'Use manifest version 1.');assert.equal(config.target,TARGET,'Target must be the reviewed production origin.');assert.ok(uuid(config.runId),'Use a unique run UUID.');
 const expiry=Date.parse(config.expiresAt);assert.ok(expiry>now&&expiry<=now+2*60*60*1000,'Approval must expire within two hours.');
 for(const key of ['realUsersPaused','noSensitiveData','backupRestoreVerified','disposableFixturesOnly'])assert.equal(config.approval?.[key],true,'Required acknowledgement: '+key);
 assert.ok(typeof config.approval.backupEvidence==='string'&&config.approval.backupEvidence.length>=10,'Reference the independently verified backup/restore evidence.');
 const ids=[];
 for(const key of ['a','b']){
  const school=config.schools?.[key];assert.equal(school?.slug,'sec-test-'+config.runId.slice(0,8)+'-'+key,'Use dedicated run-scoped school slugs.');
  for(const field of ['id','privateIdeaId','publicIdeaId']){assert.ok(uuid(school[field]),'Missing fixture UUID: '+key+'.'+field);ids.push(school[field]);}
 }
 for(const actor of ACTORS){const account=config.accounts?.[actor];assert.ok(uuid(account?.userId),'Missing fixture actor: '+actor);ids.push(account.userId);assert.ok(typeof account.cookie==='string'&&/^connect\.sid=[A-Za-z0-9%._~:+/=-]{20,4096}$/.test(account.cookie),'Supply one private session cookie for '+actor);}
 assert.equal(new Set(ids).size,ids.length,'Fixture IDs must be distinct.');return config;
}
const marker=(config,key,visibility)=>'SF-SEC-'+config.runId+'-'+key+'-'+visibility;
function cases(config){
 const list=[],add=(id,actor,route,expect,extra={})=>list.push({id,actor,route,expect,...extra});
 const route=(key,suffix)=>'/s/'+config.schools[key].slug+suffix;
 for(const actor of ACTORS)add('identity-'+actor,actor,'/auth/session',{status:200,userId:config.accounts[actor].userId});
 for(const key of ['a','b']){
  const suffix=key.toUpperCase(),school=config.schools[key],other=key==='a'?'b':'a';
  for(const role of ['student','admin'])add('private-positive-'+role+suffix,role+suffix,route(key,'/api/submission-details/'+school.privateIdeaId),{status:200,contains:marker(config,key,'private')});
  for(const role of ['student','moderator','admin'])add('cross-school-'+role+suffix,role+suffix,route(other,'/api/submission-details/'+config.schools[other].privateIdeaId),{denied:true,absent:marker(config,other,'private')});
  add('search-positive-'+key,'student'+suffix,route(key,'/api/feed?total=skip&search='+encodeURIComponent(marker(config,key,'public'))),{status:200,feedId:school.publicIdeaId});
  for(const [index,probe] of ["' OR '1'='1",'"),status.eq.pending,or(title.eq.secret)',String.raw`\%_,.("`].entries())add('search-literal-'+key+'-'+index,'student'+suffix,route(key,'/api/feed?total=skip&search='+encodeURIComponent(marker(config,key,'public')+probe)),{status:200,emptyFeed:true});
 }
 add('same-school-peer-denied','peerA',route('a','/api/submission-details/'+config.schools.a.privateIdeaId),{denied:true});
 add('unassigned-moderator-denied','moderatorA',route('a','/api/submission-details/'+config.schools.a.privateIdeaId),{denied:true});
 add('assigned-moderator-positive','moderatorB',route('b','/api/submission-details/'+config.schools.b.privateIdeaId),{status:200,contains:marker(config,'b','private')});
 add('admin-safety-positive','adminA',route('a','/admin/safety'),{status:200});
 for(const actor of ['studentA','moderatorA'])add('admin-safety-denied-'+actor,actor,route('a','/admin/safety'),{status:403});
 add('platform-positive','operator','/platform/schools',{status:200});
 add('platform-outside-client','operator',route('a','/admin'),{status:303,location:'/platform/schools'});
 const xssMarker='sfprobe-'+config.runId;
 add('reflected-html-marker','studentA',route('a','/feed?search='+encodeURIComponent('<svg onload="window.__sfSecurityProbe=\''+xssMarker+'\'"></svg>')),{status:200,htmlMarker:xssMarker});
 add('csrf-cross-site-signout','studentA','/auth/signout',{status:403},{method:'POST',origin:'https://csrf.invalid',crossSite:true});
 add('csrf-missing-proof-signout','studentA','/auth/signout',{status:403},{method:'POST',origin:null});
 add('csrf-session-still-present','studentA','/auth/session',{status:200,userId:config.accounts.studentA.userId});
 assert.ok(list.length<=MAX_REQUESTS);return list;
}
async function bodyText(response){
 const reader=response.body?.getReader();if(!reader)return '';const chunks=[];let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_BYTES)throw new Error('response_limit');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
function evaluate(probe,response,text){
 const expected=probe.expect;
 if(expected.denied)assert.ok([403,404].includes(response.status),'denial_required');else assert.equal(response.status,expected.status,'unexpected_status');
 if(expected.contains)assert.ok(text.includes(expected.contains),'positive_canary_missing');
 if(expected.absent)assert.ok(!text.includes(expected.absent),'private_canary_exposed');
 if(expected.location)assert.equal(response.headers.get('location'),expected.location,'unexpected_redirect');
 if(expected.userId||expected.feedId||expected.emptyFeed){assert.match(response.headers.get('content-type')||'',/^application\/json/,'json_required');const data=JSON.parse(text);assert.equal(data.success,true,'successful_control_required');if(expected.userId)assert.equal(data.user?.id,expected.userId,'fixture_identity_mismatch');const feed=data.feed??data.data;if(expected.feedId)assert.ok(Array.isArray(feed)&&feed.some(item=>item.id===expected.feedId),'public_fixture_missing');if(expected.emptyFeed)assert.deepEqual(feed,[],'literal_search_required');}
 if(expected.htmlMarker){
  assert.match(response.headers.get('content-type')||'',/^text\/html/,'html_required');assert.ok(text.includes(expected.htmlMarker),'reflection_control_missing');
  const {parse,defaultTreeAdapter}=require('parse5');
  function inspect(parent){for(const child of parent.childNodes)if(defaultTreeAdapter.isElementNode(child)){assert.ok(!child.attrs.some(attr=>attr.name.startsWith('on')&&attr.value.includes(expected.htmlMarker)),'executable_marker_attribute');if(child.tagName==='script'&&!child.attrs.some(attr=>attr.name==='type'&&attr.value==='application/json'))assert.ok(!child.childNodes.some(node=>node.value?.includes(expected.htmlMarker)),'executable_marker_script');if(child.tagName==='template')inspect(child.content);inspect(child);}}
  inspect(parse(text));
 }
}
async function execute(config,{fetchImpl=fetch,pause=()=>new Promise(resolve=>setTimeout(resolve,500)),now=Date.now}={}){
 validate(config,now());const probes=cases(config),results=[];
 for(const probe of probes){
  await pause();if(!(Date.parse(config.expiresAt)>now()))return {mode:'run',status:'stopped',reason:'approval_expired',results};
  const url=new URL(probe.route,config.target);assert.equal(url.origin,TARGET);const headers={Accept:'application/json',Cookie:config.accounts[probe.actor].cookie};if(probe.origin!==null)headers.Origin=probe.origin||config.target;if(probe.crossSite)headers['Sec-Fetch-Site']='cross-site';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let status;
  try{
   const response=await fetchImpl(url,{method:probe.method||'GET',headers,redirect:'manual',cache:'no-store',signal:controller.signal});status=response.status;
   if(status===429||status>=500){await response.body?.cancel();throw new Error('service_stop');}const text=await bodyText(response);evaluate(probe,response,text);results.push({case:probe.id,status,outcome:'passed'});
  }catch{results.push({case:probe.id,...status?{status}:{},outcome:'failed_or_blocked'});return {mode:'run',status:'stopped',results};}
  finally{clearTimeout(timer);}
 }
 return {mode:'run',status:'passed',results,limits:'HTTP subset only; browser execution, direct RLS, idle, email and rate boundaries remain separate.'};
}
async function main(args){
 if(args.length===0||args.length===1&&args[0]==='--plan')return plan();
 assert.ok(args.length===5&&args[0]==='--run'&&args[1]==='--manifest'&&args[3]==='--evidence','Use --plan or --run --manifest PRIVATE.json --evidence NEW.json.');
 const info=fs.lstatSync(args[2]);assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&info.size<65536,'Manifest must be a private regular file (chmod 600).');
 const config=JSON.parse(fs.readFileSync(args[2],'utf8'));validate(config);
 const destination=path.resolve(args[4]);assert.ok(!fs.existsSync(destination),'Do not overwrite evidence.');const descriptor=fs.openSync(destination,'wx',0o600);
 try{const result=await execute(config);fs.writeFileSync(descriptor,JSON.stringify({...result,runId:config.runId,recordedAt:new Date().toISOString()},null,2)+'\n');return {mode:result.mode,status:result.status,evidence:destination};}finally{fs.closeSync(descriptor);}
}
module.exports={plan,validate,cases,evaluate,execute,main,marker};
if(require.main===module)main(process.argv.slice(2)).then(result=>{process.stdout.write(JSON.stringify(result,null,2)+'\n');if(result.status==='stopped')process.exitCode=1;}).catch(()=>{console.error('Live checks not started or interrupted. Review the manifest, approval window and private evidence path; no automatic retry.');process.exitCode=1;});
