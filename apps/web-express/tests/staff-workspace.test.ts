import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import staffRouter from '../src/routes/staff-workspace';
import { supabaseService } from '../src/lib/supabase';
import { queueFilters, validDate, loadStaffQueue } from '../src/lib/staff-workspace';
import { sameOriginOnly } from '../src/lib/security';

const id = '00000000-0000-4000-8000-000000000001';
test('staff filters normalize untrusted values and dates reject impossible calendar dates', () => {
  assert.deepEqual(queueFilters({status:'private', assignment:id, priority:'super', overdue:true, search:'  library  '}), {status:'pending', assignment:'all', priority:'all', overdue:'false', search:'library'});
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-99-99'), false);
  assert.equal(validDate('2028-02-29'), true);
});
test('workflow queue filters run against the private view before pagination', async () => {
  const original = supabaseService.from;
  const calls: unknown[][] = []; const query: any = {};
  for (const method of ['select','eq','is','lt','not','or','order','range']) query[method] = (...args) => { calls.push([method,...args]); return query; };
  query.then = resolve => resolve({data:[], count:36, error:null});
  supabaseService.from = ((table) => { assert.equal(table,'staff_submission_queue'); return query; }) as any;
  try {
    const result = await loadStaffQueue(queueFilters({status:'all',assignment:'unassigned',priority:'urgent',overdue:'true',search:'library'}),id,2);
    assert.equal(result.count,36);
    assert.ok(calls.some(c=>c[0]==='is' && c[1]==='assignee_id' && c[2]===null));
    assert.ok(calls.some(c=>c[0]==='eq' && c[1]==='priority' && c[2]==='urgent'));
    assert.ok(calls.some(c=>c[0]==='not' && c[1]==='status'));
    assert.deepEqual(calls.at(-1),['range',15,29]);
  } finally { supabaseService.from=original; }
});
test('staff endpoints enforce roles, CSRF, review validation, conflicts, private notes, and view ownership', async () => {
  const originalRpc=supabaseService.rpc; const originalFrom=supabaseService.from;
  let role: string | null = null; let rpcError: string | null=null; let called=0; let inserts: any; const matches: unknown[][]=[];
  supabaseService.rpc=(async (name,args) => {called++; assert.equal(name,'save_staff_review'); assert.equal(args.p_staff_id,id); return {error:rpcError?{code:rpcError}:null};}) as any;
  supabaseService.from=((table) => {
    if(table==='staff_internal_notes') return {async insert(row) {inserts=row; return {error:null};}};
    assert.equal(table,'staff_saved_views');
    const query:any={delete(){return this;},eq(...args){matches.push(args);return this;},then(resolve){resolve({error:null});}};
    return query;
  }) as any;
  const app=express(); app.use(express.json());
  app.use((req,_res,next)=>{req.session={user:role?{id,role}:undefined} as any;next();});
  app.use(sameOriginOnly); app.use('/api/staff',staffRouter);
  const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const review={status:'approved',note:'Public response',assignee:null,priority:'high',targetDate:'2026-12-20',updatedAt:'2026-10-10T10:00:00Z'};
  const send=(path:string,body:unknown,method='PATCH',source=origin)=>fetch(origin+'/api/staff'+path,{method,headers:{'Content-Type':'application/json',Origin:source},body:JSON.stringify(body)});
  try {
    assert.equal((await send('/submissions/'+id+'/review',review)).status,401);
    role='student';assert.equal((await send('/submissions/'+id+'/review',review)).status,403);
    role='admin';assert.equal((await send('/submissions/'+id+'/review',review,'PATCH','https://attacker.test')).status,403);
    assert.equal((await send('/submissions/'+id+'/review',{...review,targetDate:'2026-02-30'})).status,400);
    assert.equal(called,0);
    rpcError='40001';assert.equal((await send('/submissions/'+id+'/review',review)).status,409);
    rpcError=null;assert.equal((await send('/submissions/'+id+'/review',review)).status,200);
    assert.equal((await send('/submissions/'+id+'/notes',{body:'  Private coordination  '},'POST')).status,201);
    assert.deepEqual(inserts,{submission_id:id,actor_id:id,body:'Private coordination'});
    assert.equal((await send('/views/'+id,undefined,'DELETE')).status,200);
    assert.deepEqual(matches,[['id',id],['owner_id',id]]);
    role=null;
    const response=await fetch(origin+'/api/staff/submissions/'+id+'/activity');
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'private, no-store');
  } finally {supabaseService.rpc=originalRpc;supabaseService.from=originalFrom;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
