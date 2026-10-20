import { schoolTest as test } from './support/school-context';
import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase';
import { roadmapFilters, loadRoadmapPage, loadPublicRoadmapIdea, formatManilaDate, publicItem, groupTimelineByMonth } from '../src/lib/roadmap';

test('roadmap paginates each public stage independently and counts matches across all pages', async () => {
 const original=supabase.from,originalRpc=supabase.rpc;const queries:Array<any>=[];
 supabase.rpc=(async()=>({data:[],error:null})) as any;
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
   assert.ok(query.eq.some(e=>e[0]==='category_id' && e[1]==='Facilities'));
   assert.deepEqual(query.range[0],[8,15]);
  }
  queries.length=0;
  const selected=await loadRoadmapPage(roadmapFilters({stage:'in_progress',page:'2'}));
  assert.equal(selected.pageCount,2);assert.equal(selected.items.length,1);
  assert.equal(queries.filter(q=>q.range).length,1);
 } finally {supabase.from=original;supabase.rpc=originalRpc;}
});

test('shared roadmap links load only public stages and expose only public fields', async () => {
 const original=supabase.from,originalRpc=supabase.rpc;let allowed:string[]=[];
 supabase.rpc=(async()=>({data:[],error:null})) as any;
 supabase.from=(()=>({select(){return this;},eq(){return this;},in(_key,values){allowed=values;return this;},async maybeSingle(){return {error:null,data:{id:'public-id',title:'Public idea',status:'approved',staff_note:'School update',anonymous_tracking_hash:'PRIVATE',user_id:'PRIVATE',assignee_id:'PRIVATE',categories:{name:'Learning'}}};}})) as any;
 try {
  const item=await loadPublicRoadmapIdea('public-id');assert.deepEqual(allowed,['approved','in_progress','resolved']);
  assert.equal(item.response,'School update');assert.equal(JSON.stringify(item).includes('PRIVATE'),false);
  assert.equal(roadmapFilters({page:'99999999999'}).page,1);
  assert.equal(roadmapFilters({view:'tree'}).view,'tree');
  assert.equal(roadmapFilters({view:'list'}).view,'tree');
  assert.equal(roadmapFilters({view:'timeline'}).view,'timeline');
  assert.equal(roadmapFilters({view:'done',stage:'approved'}).stage,'resolved');
  assert.equal(roadmapFilters({view:'board'}).view,'board');
  assert.equal(roadmapFilters({view:'invalid'}).view,'board');
  assert.match(formatManilaDate('2026-10-10T14:30:00Z'), /Oct 10, 2026/);
 } finally {supabase.from=original;supabase.rpc=originalRpc;}
});

function mockRoadmap(rows: any[]) {
 const originalFrom = supabase.from;
 const originalRpc = supabase.rpc;
 const queries: any[] = [];
 const rpcCalls: any[] = [];
 const filterRows = (state: any) => rows.filter(row => {
  if (state.equals.some(([key, value]) => (key === 'categories.name' ? row.categories.name : key === 'category_id' ? (row.category_id || row.categories?.name) : row[key]) !== value)) return false;
  if (state.inValues && !state.inValues.includes(row.status)) return false;
  return true;
 });
 supabase.from = (() => {
  const state: any = { equals: [], orders: [] }; queries.push(state);
  const query: any = {
   select(columns, options: any = {}) { state.columns = columns; state.head = !!options.head; return query; },
   eq(key, value) { state.equals.push([key, value]); return query; },
   in(_key, values) { state.inValues = values; return query; },
   or(value) { state.search = value; return query; },
   order(key, options = {}) { state.orders.push([key, options]); return query; },
   range(first, last) { state.range = [first, last]; return query; },
   then(resolve) {
    const filtered = filterRows(state);
    const data = [...filtered].sort((a, b) => {
     for (const [key, options] of state.orders) {
      const comparison = typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]));
      if (comparison) return options.ascending === false ? -comparison : comparison;
     }
     return 0;
    });
    resolve({ error: null, count: filtered.length, data: state.head ? [] : state.range ? data.slice(state.range[0], state.range[1] + 1) : data });
   },
  };
  return query;
 }) as any;
 supabase.rpc = (async (name, params: any) => {
  rpcCalls.push({ name, params });
  if(name==='read_roadmap_activity')return {error:null,data:params.p_ids.map((id:string)=>({id,last_public_update:null,outcome:null}))};
  const matching = rows.filter(row => (params.p_category === 'all' || row.categories.name === params.p_category) &&
    (params.p_stage === 'all' || row.status === params.p_stage));
  return { error: null, data: [...new Set(matching.map(row => row.categories.name))].sort().map(name => {
   const category = matching.filter(row => row.categories.name === name);
   return { name, total: category.length, planned: category.filter(row => row.status === 'approved').length,
    in_progress: category.filter(row => row.status === 'in_progress').length, completed: category.filter(row => row.status === 'resolved').length };
  }) };
 }) as any;
 return { queries, rpcCalls, restore() { supabase.from = originalFrom; supabase.rpc = originalRpc; } };
}

function ideaRows(count: number, status: string, category = 'Facilities', prefix = status) {
 return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${String(index).padStart(3, '0')}`, title: `${prefix} idea ${index}`,
  status, categories: { name: category }, category_id: category, vote_count: count - index, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
  resolved_at: status === 'resolved' ? '2026-10-10T00:00:00Z' : null, resolved_at_estimated: false }));
}

test('tree category totals are exact independently of bounded previews and stage board pages', async () => {
 const mock = mockRoadmap([...ideaRows(24, 'approved'), ...ideaRows(12, 'in_progress'), ...ideaRows(12, 'resolved'), ...ideaRows(18, 'approved', 'Learning', 'learning')]);
 try {
  const result = await loadRoadmapPage(roadmapFilters({ view: 'tree', page: '4' }));
  assert.equal(result.pageCount, 1);
  assert.equal(result.matchingCount, 66);
  assert.equal(result.items.length, 16);
  const facilities = result.treeData.find(branch => branch.name === 'Facilities');
  assert.deepEqual([facilities.total, facilities.planned, facilities.inProgress, facilities.completed, facilities.pctCompleted], [48, 24, 12, 12, 25]);
  assert.equal(facilities.leaves.length, 8);
  assert.ok(mock.queries.filter(query => query.range).every(query => query.range[0] === 0 && query.range[1] === 7));
  assert.equal(mock.rpcCalls[0].name, 'roadmap_category_counts');
  assert.equal(result.doneData.length, 0);
 } finally { mock.restore(); }
});

test('tree category drill-down paginates eight items while preserving exact category counts', async () => {
 const mock = mockRoadmap([...ideaRows(24, 'approved'), ...ideaRows(12, 'resolved'), ...ideaRows(20, 'approved', 'Learning')]);
 try {
  const result = await loadRoadmapPage(roadmapFilters({ view: 'tree', category: 'Facilities', page: '3', stage: 'approved' }));
  assert.equal(result.pageCount, 3);
  assert.equal(result.matchingCount, 24);
  assert.equal(result.totalCount, 56);
  assert.equal(result.items.length, 8);
  assert.equal(result.treeData[0].total, 24);
  assert.equal(result.treeData[0].completed, 0);
  assert.deepEqual(mock.queries.find(query => query.range).range, [16, 23]);
  assert.equal(mock.rpcCalls[0].params.p_stage, 'approved');
 } finally { mock.restore(); }
});

test('completed outcomes use their own twenty-item pagination even with hundreds of planned ideas', async () => {
 const mock = mockRoadmap([...ideaRows(140, 'approved'), ...ideaRows(45, 'resolved')]);
 try {
  const result = await loadRoadmapPage(roadmapFilters({ view: 'done', page: '2', stage: 'approved' }));
  assert.equal(result.pageCount, 3);
  assert.equal(result.perPage, 20);
  assert.equal(result.matchingCount, 45);
  assert.equal(result.items.length, 20);
  assert.ok(result.items.every(item => item.status === 'resolved'));
  assert.deepEqual(mock.queries.find(query => query.range).range, [20, 39]);
  assert.equal(result.doneData[0].items.length, 20);
  assert.deepEqual(result.timelineData, result.doneData);
  assert.equal(result.treeData.length, 0);
  const finalPage = await loadRoadmapPage(roadmapFilters({ view: 'done', page: '3' }));
  assert.equal(finalPage.items.length, 5);
 } finally { mock.restore(); }
});

test('completion provenance and public progress are explicit while inferred dates remain approximate', () => {
 const exact = publicItem({ status: 'resolved', resolved_at: '2026-10-11T00:00:00Z', resolved_at_estimated: false, progress_percent: 100, started_at: '2026-09-30T00:00:00Z', is_blocked: false, posted_by: 'PRIVATE' });
 assert.equal(exact.resolved_at_estimated, false);
 assert.equal(exact.progress_percent, 100);
 assert.ok(!('posted_by' in exact));
 assert.equal(publicItem({ status: 'resolved', updated_at: '2026-10-11T00:00:00Z' }).resolved_at_estimated, true);
 assert.equal(publicItem({ status: 'resolved', resolved_at: '2026-10-11T00:00:00Z', resolved_at_estimated: true }).resolved_at_estimated, true);
 assert.equal(publicItem({ status: 'approved', progress_percent: 105 }).progress_percent, null);
});

test('completed month grouping follows Manila boundaries and newest months first', () => {
 const items = [
  publicItem({ id: 'september', status: 'resolved', resolved_at: '2026-09-30T15:59:59Z' }),
  publicItem({ id: 'october', status: 'resolved', resolved_at: '2026-09-30T16:00:00Z' }),
 ];
 const groups = groupTimelineByMonth(items);
 assert.deepEqual(groups.map(group => group.items[0].id), ['october', 'september']);
 assert.match(groups[0].label, /October 2026/);
 assert.match(groups[1].label, /September 2026/);
});
