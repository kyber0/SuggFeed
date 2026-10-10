import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase';
import { roadmapFilters, loadRoadmapPage, loadPublicRoadmapIdea } from '../src/lib/roadmap';

test('roadmap paginates each public stage independently and counts matches across all pages', async () => {
 const original=supabase.from;const queries:Array<any>=[];
 const totals={approved:40,in_progress:9,resolved:2};
 supabase.from=(()=>{
  const state:any={};queries.push(state);const query:any={};
  for(const method of ['select','eq','or','order','range','in'])query[method]=(...args)=>{(state[method] ||= []).push(args);return query;};
  query.then=resolve=>{
   const stage=state.eq?.find(e=>e[0]==='status')?.[1];
   const count=stage?totals[stage]:600;
   const visible=state.select[0][1].head===false;
   resolve({error:null,count,data:visible && state.range[0][0]<count?[{id:'public-id',title:'Published idea',status:stage,categories:{name:'Facilities'},staff_note:'Public response',assignee_id:'private-staff',internal_note:'PRIVATE'}]:[]});
  };return query;
 }) as any;
 try {
  const result=await loadRoadmapPage(roadmapFilters({page:'2',category:'Facilities',search:'library'}));
  assert.deepEqual(result.counts,totals);assert.equal(result.pageCount,5);assert.equal(result.totalCount,600);assert.equal(result.matchingCount,51);
  assert.deepEqual(result.items.map(i=>i.status),['approved','in_progress']);
  assert.ok(result.items.every(i=>i.response==='Public response' && !('internal_note' in i) && !('assignee_id' in i)));
  for(const query of queries.slice(0,3)){
   assert.match(query.select[0][0],/categories!inner/);
   assert.ok(query.eq.some(e=>e[0]==='categories.name' && e[1]==='Facilities'));
   assert.deepEqual(query.range[0],[8,15]);
  }
  queries.length=0;
  const selected=await loadRoadmapPage(roadmapFilters({stage:'in_progress',page:'2'}));
  assert.equal(selected.pageCount,2);assert.equal(selected.items.length,1);
  assert.equal(queries.filter(q=>q.range).length,1);
 } finally {supabase.from=original;}
});
test('shared roadmap links load only public stages and expose only public fields', async () => {
 const original=supabase.from;let allowed:string[]=[];
 supabase.from=(()=>({select(){return this;},eq(){return this;},in(_key,values){allowed=values;return this;},async maybeSingle(){return {error:null,data:{id:'public-id',title:'Public idea',status:'approved',staff_note:'School update',anonymous_tracking_hash:'PRIVATE',user_id:'PRIVATE',assignee_id:'PRIVATE',categories:{name:'Learning'}}};}})) as any;
 try {
  const item=await loadPublicRoadmapIdea('public-id');assert.deepEqual(allowed,['approved','in_progress','resolved']);
  assert.equal(item.response,'School update');assert.equal(JSON.stringify(item).includes('PRIVATE'),false);
  assert.equal(roadmapFilters({page:'99999999999'}).page,1);
 } finally {supabase.from=original;}
});
