import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerFetch, PROVIDER_TIMEOUT_MS, READINESS_TIMEOUT_MS } from '../src/lib/provider-fetch';

test('provider fetch preserves request options and does not retry writes', async () => {
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://provider.test/write');assert.equal(init?.method,'POST');assert.equal(init?.body,'payload');assert.equal(new Headers(init?.headers).get('x-test'),'kept');assert.ok(init?.signal);return new Response('ok');};
 try {const response=await providerFetch('https://provider.test/write',{method:'POST',body:'payload',headers:{'x-test':'kept'}});assert.equal(await response.text(),'ok');assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});

test('provider fetch aborts delayed work and body reads at its deadline',async()=>{
 const original=globalThis.fetch;const keepAlive=setInterval(()=>{},1000);let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;return new Response(new ReadableStream({start(controller){init!.signal!.addEventListener('abort',()=>controller.error(init!.signal!.reason),{once:true});}}));};
 try{const response=await providerFetch('https://provider.test/read',{},10);await assert.rejects(response.text(),error=>error instanceof Error&&error.name==='TimeoutError');assert.equal(calls,1);}
 finally{clearInterval(keepAlive);globalThis.fetch=original;}
});

test('provider fetch retains caller and Request cancellation',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_input,init)=>{calls++;return new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true}));};
 try {
  for(const requestSignal of [false,true]){const controller=new AbortController();const reason=new Error('cancelled');const pending=requestSignal?providerFetch(new Request('https://provider.test/read',{signal:controller.signal})):providerFetch('https://provider.test/read',{signal:controller.signal});controller.abort(reason);await assert.rejects(pending,error=>error===reason);}
  const controller=new AbortController();controller.abort();await assert.rejects(providerFetch('https://provider.test/read',{signal:controller.signal}));assert.equal(calls,2);
  assert.ok(READINESS_TIMEOUT_MS<PROVIDER_TIMEOUT_MS);assert.ok(PROVIDER_TIMEOUT_MS<30_000);
 }finally{globalThis.fetch=original;}
});
