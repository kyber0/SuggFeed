import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root=path.resolve(__dirname,'../../..');
function moduleExports(source:string,require:(name:string)=>any){
 const exports:any={};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports,require,Response,Request,Deno:{env:{get:()=>undefined}}});return exports;
}
test('all legacy Edge entrypoints retire before constructing service clients or parsing request bodies',async()=>{
 const dir=path.join(root,'supabase/functions');
 const security=moduleExports(readFileSync(path.join(dir,'_shared/security.ts'),'utf8'),()=>{throw new Error('Unexpected runtime dependency');});
 const endpoint=moduleExports(readFileSync(path.join(dir,'_shared/retired-school-endpoint.ts'),'utf8'),()=>security).retiredSchoolEndpoint;
 const entries=readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('_'));
 assert.equal(entries.length,10,'Every deployed legacy function must remain in the retirement inventory.');
 for(const entry of entries){
  const source=readFileSync(path.join(dir,entry.name,'index.ts'),'utf8');
  if(entry.name==='register-push-token'){assert.match(source,/Deno.serve\(retiredPushRegistration\)/);continue;}
  assert.match(source,/^import \{ retiredSchoolEndpoint \} from "\.\.\/_shared\/retired-school-endpoint.ts";\s+Deno.serve\(retiredSchoolEndpoint\);\s*$/);
 }
 for(const method of ['POST','GET','DELETE']){
  const request=new Request('https://functions.test/legacy',{method,headers:{Authorization:'Bearer previously-valid-service-key'},...(method==='POST'?{body:'{invalid json school_id=forged'}:{})});
  const response=endpoint(request);assert.equal(response.status,410);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).code,'SCHOOL_CLIENT_RETIRED');
 }
 assert.equal(endpoint(new Request('https://functions.test/legacy',{method:'OPTIONS'})).status,200);
});
test('legacy Next middleware retires every route with no environment toggle or database access',()=>{
 const source=readFileSync(path.join(root,'apps/web/middleware.ts'),'utf8');
 const {middleware,config}=moduleExports(source,name=>{assert.equal(name,'next/server');return {NextResponse:Response};});
 assert.equal(config.matcher,'/:path*');const response=middleware();assert.equal(response.status,410);assert.equal(response.headers.get('cache-control'),'no-store');
});
