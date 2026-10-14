import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import profile from '../src/routes/profile';
import {supabaseService} from '../src/lib/supabase';

test('profile pages isolate account reads, continue beyond 200 and reject invalid input',async()=>{
 const original=supabaseService.from,calls:any[]=[];
 const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 supabaseService.from=((table:string)=>{
  const call:any={table,filters:[]};calls.push(call);
  const query:any={select(){return query;},eq(key:string,value:string){call.filters.push([key,value]);return query;},order(){return query;},range(from:number,to:number){call.range=[from,to];return query;},in(key:string,values:string[]){if(key==='id')call.ids=values;return query;},then(resolve:Function){
   const data=table==='bookmarks'?Array.from({length:26},(_,n)=>({submission_id:id(n+call.range[0]+1),submission:{id:id(n+call.range[0]+1),title:'Public idea',status:'approved'}})):call.ids.map((value:string)=>({id:value,title:'Public idea',status:'approved'}));
   return Promise.resolve({data,error:null}).then(resolve as any);
  }};return query;
 }) as any;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.session={user:{id:'member-one'}} as any;next();});app.use('/profile',profile);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+(server.address() as any).port;
 const send=(body:any)=>fetch(origin+'/profile/activity',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
 try{
  const response=await send({tab:'bookmarks',offset:200,user_id:'another-member'});assert.equal(response.status,200);assert.match(response.headers.get('cache-control') || '',/no-store/);
  const data=await response.json() as any;assert.equal(data.rows.length,25);assert.deepEqual(data.next,{offset:225,local:false});
  assert.deepEqual(calls.map(call=>call.table),['bookmarks']);assert.deepEqual(calls[0].filters,[['user_id','member-one']]);assert.deepEqual(calls[0].range,[200,225]);
  calls.length=0;
  for(const body of [{tab:'__proto__'},{tab:'constructor'},{tab:'bookmarks',offset:-1},{tab:'bookmarks',offset:0.5}])assert.equal((await send(body)).status,400);
  assert.equal(calls.length,0);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));supabaseService.from=original;}
});
