import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {request} from 'node:http';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

test('deployed body parsers bound inflated JSON/form bodies and reject malformed JSON',async()=>{
 const source=readFileSync(resolve(__dirname,'../src/server.ts'),'utf8');
 const app=express();
 for(const parser of ['json','urlencoded'] as const){
  const options=parser==='json'?{limit:'512kb'}:{extended:true,limit:'512kb'};
  assert.match(source,new RegExp('express\\.'+parser+'\\(\\{[^}]*limit: "512kb"'));
  app.use(express[parser](options));
 }
 app.post('/',(_req,res)=>res.sendStatus(204));
 app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.sendStatus(error.status||500));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const send=(text:string,type:string)=>new Promise<number>((resolve,reject)=>{
  const data=gzipSync(text),req=request({hostname:'127.0.0.1',port:address.port,method:'POST',path:'/',headers:{'Content-Type':type,'Content-Encoding':'gzip','Content-Length':data.length}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});
  req.setTimeout(10000,()=>req.destroy(new Error('Parser fixture timed out')));req.on('error',reject);req.end(data);
 });
 try {
  assert.equal(await send('{"text":"hello"}','application/json'),204);
  assert.equal(await send('text=hello','application/x-www-form-urlencoded'),204);
  assert.equal(await send(JSON.stringify({text:'a'.repeat(2*1024*1024)}),'application/json'),413);
  assert.equal(await send('text='+'a'.repeat(2*1024*1024),'application/x-www-form-urlencoded'),413);
  assert.equal(await send('{','application/json'),400);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
