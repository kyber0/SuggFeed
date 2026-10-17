import { runWithSchool } from '../src/lib/school-scope';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireStrongAuth, requireStaffAssurance, safeSecurityReturnTo, verifiedTokenAssurance } from '../src/lib/auth-assurance';

test('assurance decoder fails closed and reads only the verified token assurance claim', () => {
  const token = (payload: unknown) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
  assert.equal(verifiedTokenAssurance(token({ aal: 'aal2' })), 'aal2');
  for (const value of ['', 'bad', 'a.bad.b', token({role:'admin'}), token({aal:'AAL2'})]) assert.equal(verifiedTokenAssurance(value), 'aal1');
});

test('security return destinations reject redirects, path confusion and unscoped pages', () => {
  for (const destination of ['/schools','/platform/schools','/s/school-a/staff?tab=work','/s/abc/admin']) assert.equal(safeSecurityReturnTo(destination), destination);
  for (const destination of [undefined, '//attacker.test', 'https://attacker.test', '/s/abc/\\attacker.test', '/s/abc/%2f%2fattacker.test', '/s/abc/%255c', '/s/abc/%2e%2e/admin', '/s/abc/../admin', '/s/a/feed', '/feed', '/auth/callback', '/schools\n', '/platform/schools-other']) assert.equal(safeSecurityReturnTo(destination), '/schools');
});

test('privileged access ignores spoofed headers, body and session assurance', () => {
  const calls: any[] = [];
  const req: any = {method:'POST', path:'/api/staff/action', originalUrl:'/s/school-a/api/staff/action', body:{aal:'aal2'}, session:{authAssurance:'aal2'}, get:()=> 'aal2', is:()=> false};
  const res: any = {locals:{}, status(value:number){calls.push(['status',value]);return this;},json(value:any){calls.push(['json',value]);},redirect(...args:any[]){calls.push(['redirect',...args]);}};
  requireStrongAuth(req,res,()=>calls.push(['next']));
  assert.equal(calls[0][1],403);assert.equal(calls[1][1].code,'MFA_REQUIRED');assert.equal(calls.some(call=>call[0]==='next'),false);
  calls.length=0;res.locals.authAssurance='aal2';requireStrongAuth(req,res,()=>calls.push(['next']));assert.deepEqual(calls,[['next']]);
  calls.length=0;res.locals.authAssurance='aal1';req.method='GET';req.path='/staff';requireStrongAuth(req,res,()=>calls.push(['next']));assert.equal(calls[0][0],'redirect');assert.match(calls[0][2],/^\/account\/security\?returnTo=/);
});

test('mixed-case staff pages and API routes require the same verified MFA',()=>{
 const user={id:'admin',role:'admin'};
 runWithSchool({id:'school',slug:'demo',name:'Demo',actorId:'admin',role:'admin'},()=>{
  for(const path of ['/ADMIN','/API/STAFF/members/id/role','/API/COMMUNITY/STAFF/board','/API/PROGRESS-EVIDENCE/upload']){
   let nextCalled=false,status=200;const req:any={path,method:'PATCH',originalUrl:'/s/demo'+path,session:{user},get:()=>'',is:()=>false};
   const res:any={locals:{authAssurance:'aal1'},status(n:number){status=n;return this;},json(){}};
   requireStaffAssurance(req,res,()=>{nextCalled=true;});assert.equal(status,403,path);assert.equal(nextCalled,false,path);
   res.locals.authAssurance='aal2';requireStaffAssurance(req,res,()=>{nextCalled=true;});assert.equal(nextCalled,true,path);
  }
 });
});
