import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function browser(initial: {id:string;status:string;factor_type:string}[] = [], destination='/s/school-a/admin') {
  let ready:()=>Promise<void>;
  const nodes = new Map<string,any>(), calls:any[] = [], navigation:string[] = [];
  const node = (id:string):any => {
    if (!nodes.has(id)) {
      const events = new Map<string,Function>();
      nodes.set(id,{dataset:{userId:'owner',returnTo:destination},hidden:true,disabled:false,value:'',textContent:'',src:'',focus(){},removeAttribute(name:string){delete this[name];},addEventListener:(type:string,handler:Function)=>events.set(type,handler),emit:async(type:string)=>events.get(type)?.({preventDefault(){}})});
    }
    return nodes.get(id);
  };
  let factors=initial, invalid=false, challengeError=false, saveError=false, level='aal1', userId='owner';
  let releaseSave:()=>void;
  let waitForSave=false;
  const auth = {
    getUser:async()=>({error:null,data:{user:{id:userId}}}),
    getSession:async()=>{calls.push(['session']);return {error:null,data:{session:{access_token:'new-aal2-access',refresh_token:'new-refresh',user:{id:userId}}}};},
    mfa:{
      listFactors:async()=>({error:null,data:{all:factors}}),
      enroll:async(options:any)=>{calls.push(['enroll',options]);factors=[{id:'new-factor',status:'unverified',factor_type:'totp'}];return {error:null,data:{id:'new-factor',totp:{qr_code:'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',secret:'private-setup-key'}}};},
      unenroll:async(options:any)=>{calls.push(['unenroll',options]);factors=[];return {error:null};},
      challenge:async(options:any)=>{calls.push(['challenge',options]);return {error:challengeError?new Error('expired'):null,data:{id:`challenge-${calls.length}`}};},
      verify:async(options:any)=>{calls.push(['verify',options]);if(!invalid)level='aal2';return {error:invalid?new Error('bad code'):null,data:{}};},
      getAuthenticatorAssuranceLevel:async()=>({error:null,data:{currentLevel:level}})
    }
  };
  const window:any = {_sb:{auth},sfAuthReady:Promise.resolve(),location:{origin:'https://suggfeed.test',assign:(value:string)=>navigation.push(value)}};
  const storage = {getItem(){throw new Error('Storage accessed');},setItem(){throw new Error('Secret stored');},removeItem(){throw new Error('Storage accessed');}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/account-security.js'),'utf8'), {window,document:{getElementById:node,addEventListener:(_event:string,fn:any)=>{ready=fn;}},URL,JSON,localStorage:storage,sessionStorage:storage,fetch:async(url:string,options:any)=>{calls.push(['post',url,options]);if(waitForSave)await new Promise<void>(resolve=>{releaseSave=resolve;});return {ok:!saveError,json:async()=>({success:!saveError,user:{id:userId}})};}});
  return {open:()=>ready(),node,calls,navigation,setInvalid:(value=true)=>{invalid=value;},setChallengeError:()=>{challengeError=true;},setSaveError:()=>{saveError=true;},setUser:(value:string)=>{userId=value;},pauseSave:()=>{waitForSave=true;},releaseSave:()=>releaseSave()};
}

test('MFA setup requires an explicit action and renders secrets only as image/text', async()=>{
  const h=browser();await h.open();assert.equal(h.calls.length,0);assert.equal(h.node('security-enroll').hidden,false);
  await h.node('security-enroll').emit('click');assert.equal(h.calls[0][0],'enroll');assert.equal(h.node('security-secret').textContent,'private-setup-key');assert.match(h.node('security-qr').src,/^data:image\/svg\+xml/);assert.equal(h.node('security-form').hidden,false);
});
test('existing verified authenticator is challenged without enrollment or removal',async()=>{
  const h=browser([{id:'verified',status:'verified',factor_type:'totp'}]);await h.open();assert.equal(h.node('security-form').hidden,false);assert.equal(h.node('security-enroll').hidden,true);
  h.node('security-code').value='123456';await h.node('security-form').emit('submit');
  assert.equal(h.calls[0][0],'challenge');assert.equal(h.calls[0][1].factorId,'verified');assert.equal(h.calls.some(call=>call[0]==='enroll'||call[0]==='unenroll'),false);
  const post=h.calls.find(call=>call[0]==='post');assert.equal(post[1],'/auth/session');assert.equal(post[2].credentials,'same-origin');assert.equal(JSON.parse(post[2].body).access_token,'new-aal2-access');assert.deepEqual(h.navigation,['/s/school-a/admin']);
});
test('invalid and stale codes do not save a server session; retries use fresh challenges',async()=>{
  const h=browser([{id:'verified',status:'verified',factor_type:'totp'}]);await h.open();h.node('security-code').value='123';await h.node('security-form').emit('submit');assert.equal(h.calls.length,0);
  h.setInvalid();h.node('security-code').value='123456';await h.node('security-form').emit('submit');assert.match(h.node('security-feedback').textContent,/invalid or expired/);assert.equal(h.calls.some(call=>call[0]==='post'),false);assert.equal(h.node('security-code').value,'');
  h.setInvalid(false);h.node('security-code').value='654321';await h.node('security-form').emit('submit');const challenges=h.calls.filter(call=>call[0]==='verify');assert.notEqual(challenges[0][1].challengeId,challenges[1][1].challengeId);
  const stale=browser([{id:'verified',status:'verified',factor_type:'totp'}]);await stale.open();stale.setChallengeError();stale.node('security-code').value='123456';await stale.node('security-form').emit('submit');assert.equal(stale.calls.some(call=>call[0]==='verify'||call[0]==='post'),false);
});
test('unfinished setup removal is explicit and restricted to its own unverified factor',async()=>{
  const h=browser([{id:'unfinished',status:'unverified',factor_type:'totp'}]);await h.open();assert.equal(h.calls.length,0);assert.equal(h.node('security-replace').hidden,false);await h.node('security-replace').emit('click');assert.equal(h.calls[0][0],'unenroll');assert.equal(h.calls[0][1].factorId,'unfinished');assert.equal(h.calls[1][0],'enroll');
  const changed=browser([{id:'unfinished',status:'unverified',factor_type:'totp'}]);await changed.open();changed.setUser('other');await changed.node('security-replace').emit('click');assert.equal(changed.calls.length,0);assert.match(changed.node('security-feedback').textContent,/account changed/);
});
test('server session must save before navigation and failures keep the security page open',async()=>{
  const h=browser([{id:'verified',status:'verified',factor_type:'totp'}]);await h.open();h.pauseSave();h.node('security-code').value='123456';const submission=h.node('security-form').emit('submit');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.some(call=>call[0]==='post'),true);assert.equal(h.navigation.length,0);h.releaseSave();await submission;assert.equal(h.navigation.length,1);
  const failed=browser([{id:'verified',status:'verified',factor_type:'totp'}]);await failed.open();failed.setSaveError();failed.node('security-code').value='123456';await failed.node('security-form').emit('submit');assert.equal(failed.navigation.length,0);assert.match(failed.node('security-feedback').textContent,/could not be saved/);
});
test('MFA completion rejects external and malformed return destinations',async()=>{
  for(const target of ['//attacker.test','https://attacker.test','/s/abc/%2f%2fattacker.test','/s/abc/\\attacker.test','/s/abc/../staff','/auth/callback']) {
    const h=browser([{id:'verified',status:'verified',factor_type:'totp'}],target);await h.open();h.node('security-code').value='123456';await h.node('security-form').emit('submit');assert.deepEqual(h.navigation,['/schools']);
  }
});
