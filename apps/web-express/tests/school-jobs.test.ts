import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forEachActiveSchool } from '../src/lib/school-jobs';
import { currentSchool, runWithSchool } from '../src/lib/school-scope';
import { supabasePlatform } from '../src/lib/supabase';

const school=(id:number)=>({id:`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`,slug:'school-'+id,name:'School '+id});
test('cron pages active registry schools, uses isolated system scopes, and continues after school failure',async()=>{
 const original=supabasePlatform.from,seen:string[]=[],pages:number[]=[],filters:any[]=[];
 supabasePlatform.from=((table:string)=>{
  assert.equal(table,'schools');
  const q:any={select(){return q;},not(key:string,operator:string,value:null){assert.equal(key,'settings.approved_at');assert.equal(operator,'is');assert.equal(value,null);return q;},eq(...args:any[]){filters.push(args);return q;},order(key:string){assert.equal(key,'id');return q;},async range(start:number,end:number){pages.push(start);assert.equal(end,start+99);return {error:null,data:start===0?Array.from({length:100},(_,i)=>school(i+1)):[school(101)]};}};return q;
 }) as any;
 try {
  const outer={...school(999),actorId:'outer-user',role:'admin' as const};
  const result=await runWithSchool(outer,()=>forEachActiveSchool(async()=>{
   const scope=currentSchool()!;seen.push(scope.id);assert.equal(scope.actorId,null);assert.equal(scope.role,null);
   await Promise.resolve();assert.equal(currentSchool(),scope);
   if(scope.slug==='school-2')throw new Error('One school unavailable');
  }));
  assert.deepEqual(result,{schools:101,failedSchools:1});assert.equal(new Set(seen).size,101);
  assert.deepEqual(pages,[0,100]);assert.ok(filters.every(([key,value])=>key==='status'&&value==='active'));assert.equal(currentSchool(),undefined);
 }finally{supabasePlatform.from=original;}
});
test('cron registry failure is not reported as a successful empty run',async()=>{
 const original=supabasePlatform.from;
 supabasePlatform.from=(()=>{const q:any={select(){return q;},not(){return q;},eq(){return q;},order(){return q;},async range(){return {error:new Error('Registry unavailable'),data:null};}};return q;}) as any;
 try{await assert.rejects(()=>forEachActiveSchool(async()=>{assert.fail('No school job allowed');}),/Registry unavailable/);}
 finally{supabasePlatform.from=original;}
});
