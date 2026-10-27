import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSearch,searchOrFilter} from '../src/lib/data';
test('search escapes LIKE wildcards and backslashes without rewriting punctuation',()=>{
 assert.equal(sanitizeSearch(String.raw`  library\%_,.("  `),String.raw`library\\\%\_,.("`);
});
test('PostgREST OR operands remain quoted data even with hostile filter punctuation',()=>{
 for(const term of ['library','a,b.(c)','"),status.eq.pending,or(title.eq.secret)',String.raw`x\",status.eq.pending`,'100%_done','A\nB']){
  const expression=searchOrFilter(term);
  const match=/^title\.ilike\.("(?:[^"\\]|\\.)*"),description\.ilike\.("(?:[^"\\]|\\.)*")$/.exec(expression);
  assert.ok(match,expression);assert.equal(JSON.parse(match[1]),'%'+sanitizeSearch(term)+'%');assert.equal(match[1],match[2]);
 }
 assert.equal(searchOrFilter('Ada',['email','display_name']),'email.ilike."%Ada%",display_name.ilike."%Ada%"');
});
