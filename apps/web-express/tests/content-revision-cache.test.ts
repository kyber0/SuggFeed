import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runWithSchool} from '../src/lib/school-scope';
import {getCache,setCache} from '../src/lib/data';
test('a fresh shared content revision cannot reuse stale ideas, comments or feed rows',()=>{
 const school={id:'00000000-0000-4000-8000-000000000001',slug:'demo',name:'Demo',actorId:null,role:null};
 for(const key of ['submission_fixture','comments_fixture','feed_fixture','roadmap_fixture']){
  runWithSchool({...school,contentRevision:'10'},()=>{setCache(key,'removed content',300000);assert.equal(getCache(key),'removed content');});
  runWithSchool({...school,contentRevision:'11'},()=>assert.equal(getCache(key),undefined));
  runWithSchool({...school,id:'00000000-0000-4000-8000-000000000002',contentRevision:'10'},()=>assert.equal(getCache(key),undefined));
 }
});
