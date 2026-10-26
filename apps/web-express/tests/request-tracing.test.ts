import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {Request,Response,NextFunction} from 'express';
import {traceRequest,requestErrorRecord} from '../src/lib/request-tracing';

test('request IDs are server-generated and errors exclude query, capabilities, bodies and messages',async()=>{
 const app=express(),records:ReturnType<typeof requestErrorRecord>[]=[];
 app.use(express.json());app.use(traceRequest);
 app.post('/schools/invitations/:token',(req,res,next)=>next(Object.assign(new Error('private-provider-message'),{status:503,name:'private-error-name'})));
 app.use((error:Error,req:Request,res:Response,_next:NextFunction)=>{records.push(requestErrorRecord(error,req,res));res.status(503).json({success:false});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try {
  const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const ids=[];
  for(let i=0;i<2;i++){const response=await fetch(origin+'/schools/invitations/private-capability?code=private-query',{method:'POST',headers:{'content-type':'application/json','x-request-id':'forged-id'},body:JSON.stringify({comment:'private-body'})});assert.equal(response.status,503);ids.push(response.headers.get('x-request-id'));await response.text();}
  for(const id of ids)assert.match(id!,/^[a-f0-9-]{36}$/);assert.notEqual(ids[0],ids[1]);
  assert.equal(records[0].requestId,ids[0]);assert.equal(records[0].code,'SERVICE_UNAVAILABLE');assert.equal(records[0].errorType,'ApplicationError');assert.equal(records[0].path,'/schools/invitations/[redacted]');
  assert.doesNotMatch(JSON.stringify(records),/private-|forged-id/);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('error records use bounded stable codes and omit arbitrary exception fields',()=>{
 for(const [status,code] of [[400,'INVALID_REQUEST'],[413,'BODY_TOO_LARGE'],[503,'SERVICE_UNAVAILABLE'],[500,'INTERNAL_ERROR']] as const){
  const record=requestErrorRecord(Object.assign(new TypeError('sensitive'),{status,token:'sensitive'}),{method:'GET',path:'/auth/callback?code=sensitive'},{locals:{requestId:'local-id'}});
  assert.equal(record.code,code);assert.equal(record.path,'/auth/callback');assert.equal(record.errorType,'TypeError');assert.doesNotMatch(JSON.stringify(record),/sensitive/);
 }
});
