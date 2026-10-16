import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runWithSchool,currentSchool,schoolUser} from '../src/lib/school-scope';
import {getCache,setCache,fetchWithCache,invalidateCache} from '../src/lib/data';
import {supabase,supabaseService,supabasePlatform} from '../src/lib/supabase';
import {resolveSchool} from '../src/lib/school-context';
import {schoolHtml,schoolPath} from '../src/lib/school-path';
const A={id:'00000000-0000-4000-8000-00000000000a',slug:'school-a',name:'School A',actorId:'10000000-0000-4000-8000-000000000001',role:'student' as const};
const B={...A,id:'00000000-0000-4000-8000-00000000000b',slug:'school-b',name:'School B'};

test('request-local school scopes and caches stay isolated through overlapping promises and invalidation',async()=>{
 const results=await Promise.all([A,B].map(school=>runWithSchool(school,async()=>{
  setCache('same-key',school.name,10000);
  const value=await fetchWithCache('pending-same',async()=>{await new Promise(resolve=>setTimeout(resolve,5));return school.id;});
  assert.equal(currentSchool()!.id,school.id);
  assert.equal(getCache('same-key'),school.name);return value;
 })));
 assert.deepEqual(results,[A.id,B.id]);
 runWithSchool(A,()=>invalidateCache('same-'));
 runWithSchool(B,()=>assert.equal(getCache('same-key'),B.name));
 runWithSchool(A,()=>assert.equal(getCache('same-key'),undefined));
 assert.throws(()=>getCache('same-key'),/school context/);
});

test('scoped builders stamp/filter ownership, reject school changes, and route RPC through verified gateway',async()=>{
 const originalFrom=supabasePlatform.from,originalRpc=supabasePlatform.rpc,calls:any[]=[];
 const query:any={};
 for(const method of ['select','eq','in','insert','upsert','update','delete'])query[method]=(...args:any[])=>{calls.push([method,...args]);return query;};
 supabasePlatform.from=((table:string)=>{calls.push(['from',table]);return query;}) as any;
 supabasePlatform.rpc=((name:string,args:any)=>{calls.push(['rpc',name,args]);return Promise.resolve({data:[],error:null});}) as any;
 try {
  assert.throws(()=>supabaseService.from('submissions'),/school context/);
  await runWithSchool(A,async()=>{
   supabaseService.from('submissions').select('id');
   assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='school_id'&&c[2]===A.id));
   supabaseService.from('bookmarks').upsert({submission_id:'idea',user_id:A.actorId},{onConflict:'user_id,submission_id'});
   const insert=calls.find(c=>c[0]==='upsert');assert.equal(insert[1].school_id,A.id);assert.equal(insert[2].onConflict,'school_id,user_id,submission_id');
   assert.throws(()=>supabaseService.from('submissions').insert({school_id:B.id,title:'wrong'}),/Invalid school/);
   assert.throws(()=>supabaseService.from('submissions').update({school_id:B.id}),/ownership/);
   assert.throws(()=>supabaseService.from('profiles').update({role:'admin'}),/verified owner/);
   await supabaseService.rpc('set_idea_follow',{p_submission_id:'idea',p_follow:true});
   const rpc=calls.find(c=>c[0]==='rpc');assert.equal(rpc[1],'tenant_rpc');assert.equal(rpc[2].p_school_id,A.id);assert.equal(rpc[2].p_actor_id,A.actorId);
   supabase.from('submissions').select('id');assert.ok(calls.some(c=>c[0]==='in'&&c[1]==='status'));
   assert.throws(()=>supabase.from('submissions').delete(),/Public data/);
  });
 }finally{supabasePlatform.from=originalFrom;supabasePlatform.rpc=originalRpc;}
});

test('rendered school paths scope business links without rewriting assets, text or another school',()=>{
 const html=schoolHtml('<a href="/feed?q=x&amp;y=z">/feed</a><img src="/icons/a.png"><a href="/schools">Switch</a><a href="/s/school-b/feed">Other</a>','/s/school-a');
 assert.match(html,/href="\/s\/school-a\/feed\?q=x&amp;y=z"/);
 assert.match(html,/>\/feed<\/a>/);assert.match(html,/src="\/icons\/a.png"/);assert.match(html,/href="\/schools"/);assert.match(html,/href="\/s\/school-b\/feed"/);
 assert.equal(schoolPath('/s/school-a','//attacker.test'),'//attacker.test');
});

test('school middleware ignores legacy roles, fails closed for private/unreviewed schools and preserves unsubscribe',async()=>{
 const originalFrom=supabasePlatform.from;
 let approved=true,publication='private',memberRole:string|null='student',status='active',outage=false;
 supabasePlatform.from=((table:string)=>{
  const data=table==='schools'?{id:A.id,slug:A.slug,name:A.name,status}:table==='school_memberships'?(memberRole?{role:memberRole}:null):{approved_at:approved?'2026-10-16':null,publication_policy:publication};
  const q:any={select(){return q;},eq(){return q;},async maybeSingle(){return {data,error:outage?{message:'private provider failure'}:null};}};return q;
 }) as any;
 async function resolve(path='/feed'){
  const req:any={url:'/s/school-a'+path,session:{user:{id:A.actorId,role:'admin'}}};
  return new Promise<any>((resolve,reject)=>{
   const res:any={locals:{},statusCode:200,status(n:number){res.statusCode=n;return res;},render(){resolve({status:res.statusCode});},redirect(){}};
   resolveSchool(req,res,(error?:any)=>error?reject(error):resolve({status:200,scope:currentSchool(),user:schoolUser(req),url:req.url}));
  });
 }
 try {
  const active=await resolve();assert.equal(active.user.role,'student');assert.equal(active.scope.id,A.id);assert.equal(active.url,'/feed');
  outage=true;await assert.rejects(resolve(),(error:any)=>error.status===503);outage=false;
  memberRole=null;assert.equal((await resolve()).status,403);
  publication='public';assert.equal((await resolve()).status,200);
  approved=false;assert.equal((await resolve()).status,503);
  status='suspended';assert.equal((await resolve('/digest/unsubscribe?token=private')).status,200);
  assert.equal((await resolve()).status,404);
 }finally{supabasePlatform.from=originalFrom;}
});

test('school total counts stay private even when a caller was allowed to read the school',async()=>{
 const data=require('../src/lib/data'),original=data.loadPublishedTotal;
 data.loadPublishedTotal=async()=>7;
 const {publicFeedTotal}=require('../src/lib/navigation-data');const headers:any={};
 try {
  await runWithSchool(A,()=>publicFeedTotal({query:{}} as any,{setHeader:(key:string,value:string)=>{headers[key]=value;},json:(body:any)=>{assert.equal(body.count,7);}} as any,(error:any)=>{throw error;}));
  assert.equal(headers['Cache-Control'],'private, no-store');
 }finally{data.loadPublishedTotal=original;}
});

test('tracking uses school-scoped hashed capabilities and never exposes private staff notes or UUID lookup',async()=>{
 const {lookupTrackingCode}=require('../src/lib/data');const original=supabaseService.from;const calls:any[]=[];
 const query:any={select(columns:string){calls.push(['select',columns]);return query;},in(field:string,values:string[]){calls.push(['in',field,values]);return query;},async maybeSingle(){return {data:{id:'idea',title:'Idea',status:'pending',description:'Own idea',created_at:'2026-10-16',categories:{name:'Safety'},status_history:[{new_status:'pending',created_at:'2026-10-16',note:'Internal private note'}]},error:null};}};
 supabaseService.from=((table:string)=>{calls.push(['table',table]);return query;}) as any;
 try {
  await runWithSchool(A,async()=>{
   const code='CV-'+'A'.repeat(32),row=await lookupTrackingCode(code);
   assert.equal(row.status,'pending');assert.equal(JSON.stringify(row).includes('Internal private note'),false);
   assert.doesNotMatch(calls.find(c=>c[0]==='select')[1],/note|reviewed_by|user_id/);
   const hashes=calls.find(c=>c[0]==='in')[2];assert.ok(hashes.every((hash:string)=>/^[a-f0-9]{64}$/.test(hash)));assert.ok(!hashes.includes(code));
   await assert.rejects(lookupTrackingCode(A.id),/full private tracking/);
  });
 }finally{supabaseService.from=original;}
});
