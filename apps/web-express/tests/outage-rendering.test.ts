import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import type {AddressInfo} from 'node:net';

// Exercise the real middleware order with a failed shared session store, without providers.
test('signed-in session outage renders a safe 503 page before normal template locals exist',async()=>{
 const secret='isolated-test-session-secret-with-over-32-characters';
 Object.assign(process.env,{VERCEL:'1',NODE_ENV:'production',SESSION_SECRET:secret,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'});
 const {SupabaseSessionStore}=require('../src/lib/session-store');
 const {supabasePlatform}=require('../src/lib/supabase');
 const originalRpc=supabasePlatform.rpc;
 supabasePlatform.rpc=async()=>({data:[{allowed:true,retry_after:60}],error:null});
 const original=SupabaseSessionStore.prototype.get;
 let reads=0;
 SupabaseSessionStore.prototype.get=(_sid:string,callback:Function)=>{reads++;callback(Object.assign(new Error('Session storage unavailable.'),{status:503}));};
 const {app}=require('../src/server');
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const sid='outage-session',signature=createHmac('sha256',secret).update(sid).digest('base64').replace(/=+$/,'');
 const cookie='connect.sid='+encodeURIComponent('s:'+sid+'.'+signature);
 try {
  const root=await fetch(base+'/',{redirect:'manual'});assert.equal(root.status,302);
  const page=await fetch(base+'/',{redirect:'manual',headers:{Cookie:cookie}});
  assert.equal(page.status,503);assert.equal(page.headers.get('retry-after'),'30');assert.match(page.headers.get('cache-control')||'',/no-store/);
  const html=await page.text();assert.match(html,/temporarily unavailable/);assert.doesNotMatch(html,/Internal Server Error|Session storage unavailable|outage-session/);
  const api=await fetch(base+'/auth/session',{headers:{Cookie:cookie,Accept:'application/json'}});assert.equal(api.status,503);assert.equal((await api.json() as {success:boolean}).success,false);
  assert.equal(reads,2);
 } finally {supabasePlatform.rpc=originalRpc;SupabaseSessionStore.prototype.get=original;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
