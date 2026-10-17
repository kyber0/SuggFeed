import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eta } from 'eta';
import path from 'node:path';
import { navigationContext, schoolLanding, safeAccountReturn } from '../src/lib/navigation-context';
import { supabasePlatform } from '../src/lib/supabase';

test('school landing is deterministic for role and lifecycle and return URLs cannot escape scope', () => {
 const school={slug:'school-a',status:'active'};
 assert.equal(schoolLanding(school,'student'),'/s/school-a/');
 for(const role of ['admin','moderator'])assert.equal(schoolLanding(school,role),'/s/school-a/admin');
 assert.equal(schoolLanding({...school,status:'pending'},'admin'),'/s/school-a/admin/school-settings');
 assert.equal(schoolLanding({...school,status:'pending'},'student'),'/schools');
 for(const value of ['//evil.test','https://evil.test','/s/abc/../x','/s/abc/%252f','/s/abc/\\x','/auth/callback','/account/home','/s/abc/feed\n'])assert.equal(safeAccountReturn(value),null);
 for(const value of ['/s/school-a/feed?sort=new','/platform/schools','/schools/invitations/token','/account/security'])assert.equal(safeAccountReturn(value),value);
});
test('verified platform accounts cannot enter school pages or write school APIs; failures never downgrade to member',async()=>{
 const original=supabasePlatform.rpc;let failed=false,allowed=true,lookups=0;
 supabasePlatform.rpc=(async()=>{lookups++;return {data:allowed,error:failed?{code:'unavailable'}:null};}) as any;
 async function check(method:string,path:string){let nextCalled=false,error:any;const result:any={locals:{},statusCode:200,status(n:number){this.statusCode=n;return this;},json(body:any){this.body=body;},redirect(status:number,url:string){this.statusCode=status;this.url=url;}};
 await new Promise<void>(resolve=>{const done=()=>resolve();result.json=(body:any)=>{result.body=body;done();};result.redirect=(status:number,url:string)=>{result.statusCode=status;result.url=url;done();};navigationContext({method,path,session:{user:{id:'operator'}}} as any,result,(err?:any)=>{error=err;nextCalled=!err;done();});});return {...result,error,nextCalled};}
 try{
  const read=await check('GET','/s/school-a/profile');assert.equal(read.statusCode,303);assert.equal(read.url,'/platform/schools');assert.equal(read.nextCalled,false);
  const write=await check('POST','/s/school-a/api/vote');assert.equal(write.statusCode,403);assert.equal(write.nextCalled,false);
  const dashboard=await check('GET','/platform/schools');assert.equal(dashboard.nextCalled,true);assert.equal(dashboard.locals.platformDashboard,true);
  const security=await check('GET','/account/security');assert.equal(security.nextCalled,true);
  allowed=false;assert.equal((await check('GET','/s/school-a/feed')).nextCalled,true);
  failed=true;const outage=await check('GET','/s/school-a/feed');assert.equal(outage.error.status,503);assert.equal(outage.nextCalled,false);
  failed=false;allowed=true;
  for(const route of ['/S/demo/admin/school-settings','/S/demo/admin/invitations','/Schools/apply'])assert.equal((await check('POST',route)).statusCode,403);
  assert.equal(lookups,9);
 }finally{supabasePlatform.rpc=original;}
});
test('platform and account layouts omit client actions while members retain their own school navigation',()=>{
 const eta=new Eta({views:path.resolve(__dirname,'../views')});
 const common={currentPath:'/platform/schools',user:{id:'operator',role:'admin',full_name:'Operator'},platformDashboard:true,isPlatformOperator:true,accountArea:true};
 const platform=eta.render('layout',{...common,body:'<main>Platform</main>'});
 for(const url of ['/profile','/notifications','/inbox','/feed?scope=following'])assert.equal(platform.includes('href="'+url+'"'),false,url);
 assert.doesNotMatch(platform,/class="mobile-tab-bar"|id="submit-panel"/);
 assert.match(platform,/href="\/account\/security"/);
 const member=eta.render('layout',{currentPath:'/feed',user:{id:'member',role:'student'},schoolBase:'/s/school-a',body:'<main>Ideas</main>'});
 assert.match(member,/class="mobile-tab-bar"/);assert.match(member,/My profile/);assert.doesNotMatch(member,/>School administration<|>Platform dashboard</);
});
