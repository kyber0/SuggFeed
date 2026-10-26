import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {liveness,readiness} from '../src/routes/health';
import {supabasePlatform} from '../src/lib/supabase';
import {READINESS_TIMEOUT_MS} from '../src/lib/provider-fetch';

test('liveness is independent of the database; readiness checks both aliases and fails within its deadline',async()=>{
 const original=supabasePlatform.from;let calls=0,mode='healthy',cancelled=false;
 supabasePlatform.from=(()=>{calls++;const builder={select(){return builder;},limit(){return builder;},abortSignal(signal:AbortSignal){assert.ok(signal);return mode==='slow'?new Promise(resolve=>signal.addEventListener('abort',()=>{cancelled=true;resolve({data:null,error:{code:'TIMEOUT'}});},{once:true})):Promise.resolve({data:[],error:mode==='healthy'?null:{code:'UNAVAILABLE',message:'private-provider-detail'}});}};return builder;}) as unknown as typeof original;
 const app=express();app.get('/health/live',liveness);app.get(['/health','/api/health'],readiness);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try {
  mode='slow';const live=await fetch(origin+'/health/live');assert.equal(live.status,200);assert.deepEqual(await live.json(),{status:'alive'});assert.equal(calls,0);
  for(const alias of ['/health','/api/health']){mode='healthy';const response=await fetch(origin+alias);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.ok(body&&typeof body==='object'&&'database' in body&&'ts' in body);assert.equal(body.database,'connected');assert.equal(typeof body.ts,'string');assert.ok(Number.isFinite(Date.parse(String(body.ts))));}
  mode='error';const unavailable=await fetch(origin+'/health');assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/private-provider-detail/);
  mode='slow';const started=performance.now(),timedOut=await fetch(origin+'/health');assert.equal(timedOut.status,503);await timedOut.text();assert.equal(cancelled,true);assert.ok(performance.now()-started<READINESS_TIMEOUT_MS+7000);
 }finally{supabasePlatform.from=original;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
