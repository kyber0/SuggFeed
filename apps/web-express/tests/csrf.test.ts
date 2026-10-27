import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import {sameOriginOnly,csrfToken} from '../src/lib/security';
import '../src/types';

test('unsafe requests need a matching origin or a session-bound CSRF token',async()=>{
 const app=express();app.set('trust proxy','loopback');app.use(express.json(),express.urlencoded({extended:false}));
 app.use(session({secret:'synthetic-csrf-regression-secret',resave:false,saveUninitialized:false,cookie:{secure:true,sameSite:'lax'}}));
 app.use(sameOriginOnly);
 app.get('/token',(req,res)=>res.json({token:csrfToken(req)}));
 app.all('/write',(_req,res)=>res.sendStatus(204));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const transport='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
 const origin=transport.replace('http:','https:');
 // Model TLS termination while keeping every fixture request on loopback.
 const request=(path:string,options:RequestInit={})=>{
  const headers=new Headers(options.headers);headers.set('X-Forwarded-Proto','https');
  return fetch(transport+path,{...options,headers});
 };
 try{
  for(const method of ['POST','PUT','PATCH','DELETE']){
   for(const headers of [{},{Origin:'https://attacker.test'},{Origin:'null'},{Referer:'not-a-url'},{'Sec-Fetch-Site':'same-origin'},{Origin:origin,'Sec-Fetch-Site':'cross-site'}]){
    assert.equal((await request('/write',{method,headers})).status,403,method+' '+JSON.stringify(headers));
   }
   assert.equal((await request('/write',{method,headers:{Origin:origin}})).status,204);
   assert.equal((await request('/write',{method,headers:{Referer:origin+'/page'}})).status,204);
  }
  const tokenResponse=await request('/token');const {token}=await tokenResponse.json() as {token:string};assert.match(token,/^[a-f0-9]{64}$/);const cookie=tokenResponse.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await request('/write',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':token}})).status,204);
  assert.equal((await request('/write',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:token})})).status,204);
  for(const headers of [{'X-CSRF-Token':token},{Cookie:cookie,'X-CSRF-Token':'bad'},{Cookie:cookie,'X-CSRF-Token':token,Origin:'https://attacker.test'}])assert.equal((await request('/write',{method:'POST',headers})).status,403);
  assert.equal((await request('/write',{method:'GET'})).status,204);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
