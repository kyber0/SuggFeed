const {randomUUID}=require('node:crypto');
const {enforceIdleSession}=require('../src/lib/session-idle');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
require('../src/types');
const { SupabaseSessionStore } = require('../src/lib/session-store');
const { sameOriginOnly } = require('../src/lib/security');
const { validateIdentity } = require('../src/lib/identity');
const { supabaseService, supabasePlatform } = require('../src/lib/supabase');
const { runWithSchool } = require('../src/lib/school-scope');
const auth = require('../src/routes/auth').default;
const api = require('../src/routes/api').default;

const rows = new Map();
let role = 'admin';
let schoolRoleOverride: 'student' | null = null;
let permissionsUnavailable = false;
const database = {
  from(table) {
    assert.equal(table, 'web_sessions');
    return {
      select() { return { eq(_column, id) { return { async maybeSingle() { return { data: rows.get(id) ?? null, error: null }; } }; } }; },
      async upsert(row) { await new Promise(resolve => setTimeout(resolve, 10)); rows.set(row.id, row); return { error: null }; },
      delete() { return { async eq(_column, id) { rows.delete(id); return { error: null }; } }; }
    };
  }
};
const validTokens=new Set<string>(),providerStates=new Map<string,any>();
const issueToken=()=>{const token='header.'+Buffer.from(JSON.stringify({session_id:randomUUID()})).toString('base64url')+'.signature';validTokens.add(token);return token;};
const originalPlatformRpc=supabasePlatform.rpc;
const originalGetUser = supabasePlatform.auth.getUser;
const originalFrom = supabasePlatform.from;
const originalRpc = supabaseService.rpc;
let moderationArgs;
const secret = 'test-only-shared-secret-of-at-least-32-characters';
const servers = [];
const origins = [];

before(async () => {
  supabasePlatform.rpc=async(name,args)=>{
   assert.equal(name,'web_session_idle');const now=Date.now();let state=providerStates.get(args.p_key);
   if(!state){state={allowed:true,lastActivityAt:now,expiresAt:now+1800000,serverNow:now};providerStates.set(args.p_key,state);}
   if(args.p_action==='revoke'||state.expiresAt<=now)state.allowed=false;
   if(args.p_action==='activity'&&state.allowed){state.lastActivityAt=now;state.expiresAt=now+1800000;}
   return {data:{...state,serverNow:now},error:null};
  };
  supabaseService.rpc = async (name, args) => {
    assert.equal(name, 'moderate_submission');
    moderationArgs = args;
    return { error: null };
  };
  supabasePlatform.auth.getUser = async token => ({
    data: { user: validTokens.has(token) ? { id: 'test-user', email: 'student@example.test', user_metadata: { role: 'admin', full_name: 'Test Student' } } : null },
    error: validTokens.has(token) ? null : { status: 401 }
  });
  supabasePlatform.from = table => {
    assert.equal(table, 'profiles');
    return { select() { return { eq() { return { async maybeSingle() { return { data: { role, display_name: 'Test Student' }, error: permissionsUnavailable ? { message: 'private database detail' } : null }; } }; } }; } };
  };
  for (let i = 0; i < 2; i++) {
    const app = express();app.set('trust proxy','loopback');
    app.use(express.json(),express.urlencoded({extended:false}));
    app.use(session({ secret, store: new SupabaseSessionStore(database, secret), resave: false, saveUninitialized: false, cookie: { secure:true, httpOnly: true, sameSite: 'lax', maxAge: 60000 } }));
    app.use(enforceIdleSession);
    app.use(validateIdentity);
    app.use('/auth', auth);
    app.use((req, _res, next) => runWithSchool({id:'00000000-0000-4000-8000-00000000000a',slug:'test-school',name:'Test School',actorId:req.session.user?.id??null,role:req.session.user ? schoolRoleOverride || role : null},next));
    app.use('/api', api);
    app.post('/write', sameOriginOnly, (_req, res) => res.json({ success: true }));
    app.get('/identity', (req, res) => res.json({ user: req.session.user }));
    app.use((_err, _req, res, _next) => res.status(500).json({ success: false, error: 'Service unavailable.' }));
    const server = await new Promise<import("node:http").Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    servers.push(server);
    origins.push(`https://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`);
  }
});
after(async () => {
  supabasePlatform.rpc=originalPlatformRpc;
  supabasePlatform.auth.getUser = originalGetUser;
  supabasePlatform.from = originalFrom;
  supabaseService.rpc = originalRpc;
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
});

async function login() {
  const response = await fixtureFetch(origins[0] + '/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origins[0] },
    body: JSON.stringify({ access_token: issueToken(), refresh_token: 'private-refresh-token' })
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(response.headers.get('set-cookie'), /Secure/i);
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.equal((await response.json() as { success: boolean; user: { id: string; role: string } | null }).success, true);
  return response.headers.get('set-cookie').split(';')[0];
}

test('session survives a different server instance; payload encrypted and cookie HTTP-only', async () => {
  const cookie = await login();
  const row = [...rows.values()][0];
  assert.equal(row.id.length, 64);
  assert.equal(row.payload.includes('private-refresh-token'), false);
  assert.equal(row.payload.includes('student@example.test'), false);
  const response = await fixtureFetch(origins[1] + '/auth/session', { headers: { Cookie: cookie } });
  assert.equal((await response.json() as { success: boolean; user: { id: string; role: string } | null }).user.id, 'test-user');
});

test('cross-site login, logout and writes are rejected; malformed referer does not crash', async () => {
  for (const path of ['/auth/session', '/auth/signout', '/write']) {
    const response = await fixtureFetch(origins[0] + path, { method: 'POST', headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  }
  const response = await fixtureFetch(origins[0] + '/write', { method: 'POST', headers: { Referer: 'not-a-url' } });
  assert.equal(response.status, 403);
});

test('session sync rejects non-JSON and invalid tokens', async () => {
  const form = await fixtureFetch(origins[0] + '/auth/session', { method: 'POST', headers: { Origin: origins[0] }, body: 'access_token=anything' });
  assert.equal(form.status, 415);
  const invalid = await fixtureFetch(origins[0] + '/auth/session', { method: 'POST', headers: { Origin: origins[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: 'invalid' }) });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.headers.get('set-cookie'), null);
});

test('permissions come from DB and revoked staff roles take effect immediately', async () => {
  const cookie = await login();
  role = 'student';
  try {
    const response = await fixtureFetch(origins[1] + '/identity', { headers: { Cookie: cookie } });
    assert.equal((await response.json() as { success: boolean; user: { id: string; role: string } | null }).user.role, 'student');
  } finally { role = 'admin'; }
});

test('permission lookup failures fail closed without leaking internals', async () => {
  const cookie = await login();
  permissionsUnavailable = true;
  try {
    const response = await fixtureFetch(origins[1] + '/identity', { headers: { Cookie: cookie } });
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes('private database detail'), false);
  } finally { permissionsUnavailable = false; }
});

test('logout deletes shared session so another instance no longer recognizes it', async () => {
  const cookie = await login();
  const response = await fixtureFetch(origins[1] + '/auth/signout', { method: 'POST', headers: { Origin: origins[1], Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  await response.json();
  const check = await fixtureFetch(origins[0] + '/auth/session', { headers: { Cookie: cookie } });
  assert.equal((await check.json() as { success: boolean; user: { id: string; role: string } | null }).user, null);
});

test('expired sessions are removed and altered encrypted payloads are rejected', async () => {
  const store = new SupabaseSessionStore(database, secret);
  const read = id => new Promise((resolve, reject) => store.get(id, (err, data) => err ? reject(err) : resolve(data)));
  await new Promise<void>((resolve, reject) => store.set('expired-session', { cookie: { expires: new Date(0) }, user: null }, err => err ? reject(err) : resolve()));
  assert.equal(await read('expired-session'), null);
  await new Promise<void>((resolve, reject) => store.set('altered-session', { cookie: { expires: new Date(Date.now() + 60000) }, user: null }, err => err ? reject(err) : resolve()));
  // Pick the row inserted for this ID directly rather than relying on other tests.
  const id = require('crypto').createHash('sha256').update('altered-session').digest('hex');
  rows.get(id).payload = 'invalid.invalid.invalid';
  await assert.rejects(read('altered-session'), /Session storage unavailable/);
});

test('moderation endpoint commits staff note and status through the transactional RPC', async () => {
  const cookie = await login();
  const response = await fixtureFetch(origins[1] + '/api/submissions/12345678-1234-1234-1234-123456789abc/status', {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved', note: '  Scheduled for next term.  ' })
  });
  assert.equal(response.status, 200);
  await response.json();
  assert.equal(moderationArgs.p_note, 'Scheduled for next term.');
  assert.equal(moderationArgs.p_staff_id, 'test-user');
  assert.equal(moderationArgs.p_status, 'approved');
});

test('student cannot moderate even if their auth metadata says admin', async () => {
  const cookie = await login();
  role = 'student';
  moderationArgs = null;
  try {
    const response = await fixtureFetch(origins[1] + '/api/submissions/12345678-1234-1234-1234-123456789abc/status', {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' })
    });
    assert.equal(response.status, 403);
    await response.json();
    assert.equal(moderationArgs, null);
  } finally { role = 'admin'; }
});

test('global profile admin does not grant a school moderator role', async () => {
 const cookie=await login();schoolRoleOverride='student';moderationArgs=null;
 try {
  const response=await fixtureFetch(origins[1]+'/api/submissions/12345678-1234-1234-1234-123456789abc/status',{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({status:'approved'})});
  assert.equal(response.status,403);assert.equal(moderationArgs,null);
 } finally {schoolRoleOverride=null;}
});
export {};

test('switching invitation accounts returns to that invitation and rejects external return addresses',async()=>{
 for(const [destination,expected]of [['/schools/invitations/'+'a'.repeat(64),'/schools/invitations/'+'a'.repeat(64)],['https://attacker.example/','/'],['//attacker.example/','/'],['/\\attacker.example','/'],['/schools/invitations/'+ 'a'.repeat(64)+'?next=https://attacker.example','/'],['/s/school/feed','/']]){
  const cookie=await login();const response=await fixtureFetch(origins[0]+'/auth/signout',{method:'POST',redirect:'manual',headers:{Origin:origins[0],Cookie:cookie},body:new URLSearchParams({returnTo:destination})});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),expected);
 }
});

test('expired provider sessions cannot restore sign-in without the web cookie or through token refresh',async()=>{
 const access=issueToken(),headers={'Content-Type':'application/json',Origin:origins[0]};
 const send=(token:string,cookie?:string)=>fixtureFetch(origins[0]+'/auth/session',{method:'POST',headers:{...headers,...cookie?{Cookie:cookie}:{}},body:JSON.stringify({access_token:token,refresh_token:'synthetic-refresh-token'})});
 const initial=await send(access);assert.equal(initial.status,200);const cookie=initial.headers.get('set-cookie').split(';')[0];
 const key=require('../src/lib/session-idle-store').providerKey(access,'test-user');providerStates.get(key).lastActivityAt=Date.now()-1800001;providerStates.get(key).expiresAt=providerStates.get(key).lastActivityAt+1800000;
 const withoutCookie=await send(access);assert.equal(withoutCookie.status,401);assert.equal((await withoutCookie.json() as any).code,'SESSION_IDLE_EXPIRED');assert.equal(withoutCookie.headers.get('set-cookie'),null);
 const claims=JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString());const refreshed='header.'+Buffer.from(JSON.stringify({...claims,iat:Date.now()})).toString('base64url')+'.signature';validTokens.add(refreshed);assert.equal((await send(refreshed)).status,401);
 assert.equal((await fixtureFetch(origins[1]+'/auth/session',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await send(issueToken(),cookie)).status,200,'fresh provider sign-in remains available');
});


test('session token fallback is issued on GET and cannot survive identity regeneration',async()=>{
 const tokenResponse=await fixtureFetch(origins[0]+'/auth/session');const state=await tokenResponse.json() as any;
 assert.match(state.csrfToken,/^[a-f0-9]{64}$/);const cookie=tokenResponse.headers.get('set-cookie').split(';')[0];
 const response=await fixtureFetch(origins[0]+'/auth/session',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':state.csrfToken},body:JSON.stringify({access_token:issueToken()})});
 assert.equal(response.status,200);const signedCookie=response.headers.get('set-cookie').split(';')[0];assert.notEqual(signedCookie,cookie);
 assert.equal((await fixtureFetch(origins[0]+'/auth/signout',{method:'POST',headers:{Cookie:signedCookie,'X-CSRF-Token':state.csrfToken}})).status,403);
});

// Model the production TLS-terminating proxy without exposing a fixture port.
function fixtureFetch(url:string,options:RequestInit={}){
 const transport=new URL(url);assert.equal(transport.hostname,'127.0.0.1');transport.protocol='http:';
 const headers=new Headers(options.headers);headers.set('X-Forwarded-Proto','https');
 return fetch(transport,{...options,headers});
}
