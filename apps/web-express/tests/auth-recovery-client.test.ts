import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
function harness(search='?code=fixture',hash='',redirectType:string|null='recovery') {
 let ready:()=>Promise<void>;
 const nodes=new Map<string,any>();
 const node=(id:string):any=>{if(!nodes.has(id)){const events=new Map<string,Function>();nodes.set(id,{dataset:{},hidden:true,disabled:false,value:'',textContent:'',href:'',focus(){},checkValidity(){return true;},addEventListener:(key:string,fn:Function)=>events.set(key,fn),emit:async(key:string)=>events.get(key)?.({preventDefault(){}})});}return nodes.get(id);};
 const session={access_token:'fixture-access',refresh_token:'fixture-refresh',user:{id:'fixture-user'}};
 const stored=new Map<string,string>(),navigation:string[]=[],synced:any[]=[],updates:any[]=[],exchanges:any[]=[],history:string[]=[];
 let exchangeError=false,updateError=false,syncError=false,otpError=false,userId=session.user.id;
 const otps:any[]=[];
 const window:any={location:{search,hash},sfAuthReady:Promise.resolve(),sfAuthNavigate:(url:string)=>navigation.push(url),sfSyncSession:async(value:any)=>{if(syncError)throw new Error('Cookie unavailable');synced.push(value);},sfSignOut:async()=>navigation.push('/')};
 window._sb={auth:{verifyOtp:async(payload:any)=>{otps.push(payload);return {error:otpError?new Error('Invalid code'):null,data:{session:otpError?null:session}};},exchangeCodeForSession:async(code:string,options:any)=>{exchanges.push({code,options});return exchangeError?{error:new Error('expired')}:{error:null,data:{session,redirectType}};},setSession:async()=>({error:null,data:{session}}),getSession:async()=>({error:null,data:{session}}),getUser:async()=>({error:null,data:{user:{id:userId}}}),updateUser:async(value:any)=>{updates.push(value);return {error:updateError?new Error('Choose a different password'):null,data:{user:session.user}};}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/auth-callback.js'),'utf8'),{window,document:{addEventListener:(_key:string,fn:any)=>{ready=fn;},getElementById:node,querySelector:node},sessionStorage:{getItem:(key:string)=>stored.get(key)||null,setItem:(key:string,value:string)=>stored.set(key,value),removeItem:(key:string)=>stored.delete(key)},history:{replaceState:(_state:any,_title:string,url:string)=>history.push(url)},URLSearchParams,Date,JSON,setTimeout,clearTimeout});
 return {node,session,stored,navigation,synced,updates,exchanges,history,otps,setOtpError:()=>{otpError=true;},setPath:(pathname:string)=>{window.location.pathname=pathname;},open:()=>ready(),setExchangeError:()=>{exchangeError=true;},setUpdateError:()=>{updateError=true;},setSyncError:()=>{syncError=true;},setUser:(id:string)=>{userId=id;}};
}
test('PKCE and implicit recovery show password forms without syncing or navigating',async()=>{
 const h=harness('?code=fixture&sb_flow_id=flow-fixture');await h.open();
 assert.equal(h.node('auth-reset-form').hidden,false);assert.equal(h.synced.length,0);assert.equal(h.navigation.length,0);
 assert.equal(h.exchanges[0].options.flowId,'flow-fixture');assert.equal(h.history.at(-1),'/auth/callback?type=recovery');assert.equal(h.history.some(url=>url.includes('fixture')),false);
 const implicit=harness('','#access_token=fixture&refresh_token=fixture&type=recovery',null);await implicit.open();assert.equal(implicit.node('auth-reset-form').hidden,false);assert.equal(implicit.synced.length,0);
});
test('password validation and update happen before server session sync',async()=>{
 const h=harness();await h.open();h.node('auth-reset-password').value='long-enough-password';h.node('auth-reset-confirm').value='different-password';await h.node('auth-reset-form').emit('submit');
 assert.equal(h.updates.length,0);assert.match(h.node('auth-reset-feedback').textContent,/match/);
 h.node('auth-reset-confirm').value='long-enough-password';h.stored.set('sf-auth-return','/admin');await h.node('auth-reset-form').emit('submit');
 assert.equal(h.updates.length,1);assert.equal(h.updates[0].password,'long-enough-password');assert.equal(h.synced.length,1);assert.equal(h.navigation.length,0);
 assert.equal(h.node('auth-reset-form').hidden,true);assert.equal(h.node('auth-reset-password').value,'');assert.equal(h.node('auth-callback-retry').href,'/schools');assert.equal(h.stored.has('sf:password-recovery:v1'),false);assert.equal(h.stored.has('sf-auth-return'),false);
});
test('password rejection and account changes cannot create a server session',async()=>{
 const h=harness();await h.open();h.setUpdateError();h.node('auth-reset-password').value=h.node('auth-reset-confirm').value='long-enough-password';await h.node('auth-reset-form').emit('submit');
 assert.equal(h.synced.length,0);assert.equal(h.node('auth-reset-form').hidden,false);assert.match(h.node('auth-reset-feedback').textContent,/different password/);
 const changed=harness();await changed.open();changed.setUser('other-user');changed.node('auth-reset-password').value=changed.node('auth-reset-confirm').value='long-enough-password';await changed.node('auth-reset-form').emit('submit');assert.equal(changed.updates.length,0);
});
test('cookie failures after a successful update do not report password failure',async()=>{
 const h=harness();await h.open();h.setSyncError();h.node('auth-reset-password').value=h.node('auth-reset-confirm').value='long-enough-password';await h.node('auth-reset-form').emit('submit');
 assert.equal(h.node('auth-callback-title').textContent,'Password updated');assert.equal(h.node('auth-reset-form').hidden,true);assert.match(h.node('auth-callback-message').textContent,/changed.*sign-in could not/);
});
test('recovery resumes after reload only with a recent marker for the same session',async()=>{
 const h=harness('?type=recovery','',null);h.stored.set('sf:password-recovery:v1',JSON.stringify({version:1,userId:h.session.user.id,createdAt:Date.now()}));await h.open();assert.equal(h.node('auth-reset-form').hidden,false);
 const missing=harness('?type=recovery','',null);await missing.open();assert.equal(missing.node('auth-reset-form').hidden,true);assert.equal(missing.synced.length,0);assert.match(missing.node('auth-callback-message').textContent,/missing or has expired/);
});
test('OAuth keeps its return page; expired recovery links never use existing sign-in',async()=>{
 const h=harness('?code=fixture','',null);h.stored.set('sf-auth-return','/s/demo/feed');await h.open();assert.equal(h.synced.length,1);assert.deepEqual(h.navigation,['/account/home?returnTo=%2Fs%2Fdemo%2Ffeed']);
 const expired=harness();expired.setExchangeError();await expired.open();assert.equal(expired.synced.length,0);assert.equal(expired.navigation.length,0);assert.equal(expired.node('auth-reset-form').hidden,true);
});

test('password recovery codes verify the recovery type before exposing the reset form',async()=>{
 const h=harness('','',null);h.setPath('/auth/recovery');await h.open();
 assert.equal(h.node('auth-code-form').hidden,false);assert.equal(h.node('auth-reset-form').hidden,true);assert.equal(h.synced.length,0);
 h.node('auth-code-email').value='student@example.test';h.node('auth-recovery-code').value='123456';await h.node('auth-code-form').emit('submit');
 assert.equal(h.otps.length,1);assert.equal(h.otps[0].type,'recovery');assert.equal(h.otps[0].email,'student@example.test');assert.equal(h.otps[0].token,'123456');
 assert.equal(h.node('auth-reset-form').hidden,false);assert.equal(h.node('auth-code-form').hidden,true);assert.equal(h.node('auth-recovery-code').value,'');
 assert.equal(h.synced.length,0);assert.equal(h.navigation.length,0);
});
test('invalid, expired and reused recovery codes cannot reuse an existing session',async()=>{
 const h=harness('','',null);h.setPath('/auth/recovery');await h.open();
 h.node('auth-code-email').value='student@example.test';h.node('auth-recovery-code').value='bad';await h.node('auth-code-form').emit('submit');assert.equal(h.otps.length,0);
 h.node('auth-recovery-code').value='123456';h.setOtpError();await h.node('auth-code-form').emit('submit');
 assert.equal(h.node('auth-reset-form').hidden,true);assert.equal(h.node('auth-code-form').hidden,false);assert.match(h.node('auth-code-feedback').textContent,/could not be verified/);assert.equal(h.synced.length,0);assert.equal(h.navigation.length,0);
});


test('OAuth rejects unscoped, auth, and external callback return destinations', async () => {
 for (const destination of ['/feed', '/auth/callback', '//other.test', '/s/school-a/\\other.test', '/s/school-a/feed\n']) {
  const h=harness('?code=fixture','',null);h.stored.set('sf-auth-return',destination);await h.open();
  assert.deepEqual(h.navigation,['/account/home?returnTo=%2Fschools']);
 }
});

test('OAuth provider failures explain the category without exposing raw provider data',async()=>{
 const h=harness('?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user','',null);await h.open();
 assert.match(h.node('auth-callback-message').textContent,/could not create or update your account/i);assert.match(h.node('auth-callback-message').textContent,/unexpected_failure/);
 assert.equal(h.synced.length,0);assert.equal(h.exchanges.length,0);assert.equal(h.history.some(url=>url.includes('error_description')),false);
 const credentials=harness('','#error=server_error&error_code=unexpected_failure&error_description=invalid_client+secret-value',null);await credentials.open();
 assert.match(credentials.node('auth-callback-message').textContent,/Google sign-in configuration/);assert.doesNotMatch(credentials.node('auth-callback-message').textContent,/secret-value/);
 const unknown=harness('?error=server_error&error_description=private-token-value','',null);await unknown.open();assert.doesNotMatch(unknown.node('auth-callback-message').textContent,/private-token-value/);
});

test('email confirmation in a new tab restores the server-held invitation destination',async()=>{
 const h=harness('?code=fixture','',null);const destination='/schools/invitations/'+'a'.repeat(64);
 h.node('auth-callback-title').dataset={returnTo:destination};await h.open();assert.deepEqual(h.navigation,['/account/home?returnTo='+encodeURIComponent(destination)]);
 const invalid=harness('?code=fixture','',null);invalid.node('auth-callback-title').dataset={returnTo:'https://attacker.example'};await invalid.open();assert.deepEqual(invalid.navigation,['/account/home?returnTo=%2Fschools']);
});
