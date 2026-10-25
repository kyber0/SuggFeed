import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import router from '../src/routes/assignments';
import {withTestSchool} from './support/school-context';
import {supabasePlatform} from '../src/lib/supabase';
test('assignment API binds school/actor, rejects guests and cross-origin writes, and preserves DB denials',async()=>{
 let role:string|null=null,deny=false;const original=supabasePlatform.rpc,calls:any[]=[];
 supabasePlatform.rpc=(async(name,args)=>{calls.push({name,args});return deny?{data:null,error:{code:'42501',message:'School administrator required'}}:{data:{acknowledged:true},error:null};}) as any;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.session={user:role?{id:'10000000-0000-4000-8000-00000000000a',role}:undefined} as any;next();});app.use(withTestSchool);app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const post=(source=origin)=>fetch(origin+'/admin/assignments/action',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify({action:'acknowledge',school:'other',actor:'other',data:{kind:'suggestion',id:'30000000-0000-4000-8000-00000000000a'}})});
 try{assert.equal((await post()).status,403);role='student';assert.equal((await post()).status,403);role='moderator';assert.equal((await post('https://attacker.invalid')).status,403);assert.equal(calls.length,0);deny=true;assert.equal((await post()).status,403);deny=false;assert.equal((await post()).status,200);const args=calls.at(-1).args;assert.equal(args.p_actor,'10000000-0000-4000-8000-00000000000a');assert.notEqual(args.p_school,'other');assert.equal(args.p_action,'acknowledge');assert.equal((await fetch(origin+'/internal/assignment-escalation')).status,401);
 }finally{supabasePlatform.rpc=original;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
