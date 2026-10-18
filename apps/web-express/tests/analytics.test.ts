import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsFilters,summarizeAnalytics} from '../src/lib/analytics';
const now=new Date('2026-10-18T05:00:00Z');
const rows=[
 {categories:{name:'Learning'},status:'resolved',vote_count:5,created_at:'2026-10-17T18:00:00Z'},
 {categories:{name:'Facilities'},status:'pending',vote_count:2,created_at:'2026-10-10T12:00:00Z'},
 {categories:{name:'Learning'},status:'approved',vote_count:3,created_at:'2026-09-01T12:00:00Z'},
];
test('analytics normalizes filters and keeps every aggregate inside the chosen snapshot scope',()=>{
 assert.deepEqual(analyticsFilters({range:'invalid',category:'  Learning '}),{range:'30d',category:'Learning'});
 const result=summarizeAnalytics(rows,{range:'7d',category:'Learning'},now);
 assert.equal(result.kpis.totalSubmissions.value,1);assert.equal(result.kpis.totalVotes.value,5);
 assert.deepEqual(result.categories.map(row=>row.name),['Learning']);assert.equal(result.funnel.reduce((sum,row)=>sum+row.count,0),1);
 assert.equal(result.timeline.length,7);assert.equal(result.timeline.at(-1)?.submissions,1);assert.equal(result.timeline.at(-1)?.key,'2026-10-18');
 assert.equal(result.kpis.totalSubmissions.delta,null);assert.equal(result.comparisonCount,0);
 assert.equal(result.snapshotCount,3);assert.equal(result.recordLimit,2000);assert.deepEqual(result.categoryOptions,['Facilities','Learning']);
 assert.equal('rawSubmissions' in result,false);
});
test('analytics 90 days and available history include older data, zero results stay honest',()=>{
 assert.equal(summarizeAnalytics(rows,{range:'90d'},now).kpis.totalSubmissions.value,3);
 const all=summarizeAnalytics(rows,{range:'all'},now);assert.equal(all.timeline.length,3);assert.equal(all.kpis.totalVotes.value,10);
 const zero=summarizeAnalytics(rows,{category:'Missing'},now);assert.equal(zero.categories.length,0);assert.equal(zero.kpis.approvalRate.value,0);assert.ok(zero.funnel.every(row=>row.pct===0));
 assert.equal(summarizeAnalytics([],{range:'all'},now).timeline.length,0);
});
