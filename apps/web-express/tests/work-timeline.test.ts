import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkTimeline, publicItem, roadmapFilters, loadRoadmapPage } from '../src/lib/roadmap';
import { supabase } from '../src/lib/supabase';

const today = new Date('2026-10-12T06:00:00Z');
test('work timeline uses Manila calendar months, recorded starts and separate school estimates', () => {
  const chart = buildWorkTimeline([
    publicItem({ id:'active', title:'Lighting', status:'in_progress', started_at:'2026-09-30T16:00:00Z', progress_percent:35 }),
    publicItem({ id:'done', title:'Library', status:'resolved', started_at:'2026-09-12T08:00:00Z', resolved_at:'2026-10-10T08:00:00Z', progress_percent:100 }),
    publicItem({ id:'planned', title:'Benches', status:'approved' }),
    publicItem({ id:'unknown', title:'Past work', status:'resolved', resolved_at:'2026-10-10T08:00:00Z' }),
  ], today);
  assert.deepEqual(chart.months.map(month=>month.label), ['September 2026','October 2026','November 2026']);
  assert.equal(chart.rows.length,2); assert.equal(chart.undated.length,2);
  assert.match(chart.rows[0].dateLabel,/Oct 1, 2026 → Today/);
  assert.equal(chart.rows[0].item.progress_percent,35);
  assert.ok(chart.todayLeft>0&&chart.todayLeft<100);
  assert.ok(chart.rows.every(row=>row.left>=0&&row.width>=0&&row.left+row.width<=100));
  assert.match(chart.undated[0].reason,/Not scheduled/);
  assert.equal(chart.undated[1].item.started_at,null,'missing starts are never inferred from created_at');
});
test('work timeline clips long-running work and does not invent future or inverted work ranges', () => {
  const chart=buildWorkTimeline([
    publicItem({id:'old',status:'in_progress',started_at:'2025-01-01T00:00:00Z'}),
    publicItem({id:'future',status:'in_progress',started_at:'2026-11-01T00:00:00Z'}),
    publicItem({id:'inverted',status:'resolved',started_at:'2026-10-11T00:00:00Z',resolved_at:'2026-10-01T00:00:00Z'}),
  ],today);
  assert.equal(chart.months.length,6); assert.equal(chart.rows.length,1);
  assert.equal(chart.rows[0].clipped,true); assert.equal(chart.rows[0].left,0);
  assert.equal(chart.undated.length,2);
});
test('timeline has independent twenty-item pagination without forcing completed status', async () => {
  const original=supabase.from; const queries:any[]=[];
  supabase.from=(()=>{
    const state:any={};queries.push(state);const query:any={};
    for(const method of ['select','eq','in','or','order','range'])query[method]=(...args)=>{(state[method]??=[]).push(args);return query;};
    query.then=resolve=>{const status=state.eq?.find(([key])=>key==='status')?.[1];resolve({error:null,count:status==='approved'?45:0,data:state.range?[{id:'test',status:'approved',title:'Planned',categories:{name:'Facilities'}}]:[]});};
    return query;
  }) as any;
  try {
    const filters=roadmapFilters({view:'timeline',stage:'approved',page:'2'});
    assert.equal(filters.view,'timeline');assert.equal(filters.stage,'approved');
    const result=await loadRoadmapPage(filters);
    assert.equal(result.pageCount,3);assert.equal(result.perPage,20);assert.equal(result.doneData.length,0);
    const query=queries.find(query=>query.range);
    assert.deepEqual(query.range[0],[20,39]);assert.deepEqual(query.in[0],['status',['approved']]);
  } finally {supabase.from=original;}
});
