// Disposable local fixture only: no ports, host mounts, hosted credentials or production database URLs.
const assert=require('node:assert/strict'),path=require('node:path'),{randomBytes}=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');require('ts-node').register({project:path.join(root,'tsconfig.tests.json'),transpileOnly:true});
const {bootstrapTenantDb,SCHOOL_A,ADMIN_A,STUDENT}=require('../tests/support/tenant-db');
const {finishSafetyMigrations}=require('../tests/support/submission-safety-db');
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const name='sf-assignment-check-'+randomBytes(8).toString('hex');
const image='postgres@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0';
function docker(args,input,allowFailure=false){const result=spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,input,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});if(result.error)throw result.error;if(result.status!==0&&!allowFailure)throw new Error(result.stderr||'Local Docker fixture command failed');return result;}
function sql(database,text,allowFailure=false){return docker(['exec','-i',name,'psql','-U','postgres','-d',database,'-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],text,allowFailure);}
function literal(value){if(value===null)return 'NULL';if(typeof value==='string')return "'"+value.replace(/'/g,"''")+"'";if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')return String(value);throw new Error('Unsupported synthetic fixture parameter');}
class Fixture {
 async exec(text){if(/^\s*(SET|RESET) ROLE\b/i.test(text))throw new Error('Use the existing migration-role tests for session-scoped role checks');sql('postgres','BEGIN;\n'+text+'\n;COMMIT;');}
 async query(text,params=[]){
  // shortcut: bootstrap only needs INSERTs; extend this adapter when fixtures require returned rows.
  if(!/^\s*INSERT\b/i.test(text))throw new Error('Native bootstrap only supports the fixture INSERT queries');
  await this.exec(text.replace(/\$(\d+)/g,(_match,index)=>literal(params[Number(index)-1])));return {rows:[]};
 }
 async close(){}
}
async function main(){
 let created=false;const started=Date.now(),result={image,hostedWrites:false,portsPublished:false};
 try{
  docker(['run','--detach','--name',name,'--label','suggfeed.fixture=assignment','--network','none','--memory','768m','--cpus','2','--tmpfs','/var/lib/postgresql/data:rw,size=512m','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  let ready=false;
  for(let i=0;i<120;i++){
   const check=docker(['exec',name,'pg_isready','-U','postgres'],undefined,true),pid=docker(['exec',name,'cat','/proc/1/comm']).stdout.trim();
   if(check.status===0&&pid==='postgres'){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,'Local PostgreSQL fixture startup timed out');
  await finishSafetyMigrations(await bootstrapTenantDb(new Fixture()));result.migrationReplay='passed';
  const childEnv={...env};for(const key of Object.keys(childEnv))if(/^(SUPABASE_|RESEND_|GEMINI_|ASSISTANT_|SENTRY_|VERCEL_|NEXT_PUBLIC_)/.test(key)||['SESSION_SECRET','DATABASE_URL','CRON_SECRET','NODE_OPTIONS','NODE_V8_COVERAGE'].includes(key))delete childEnv[key];
  childEnv.ASSIGNMENT_TEST_CONTAINER=name;
  const test=spawnSync(process.execPath,['-r','ts-node/register/transpile-only','--test','tests/assignment-concurrency.test.ts'],{cwd:root,env:childEnv,encoding:'utf8',timeout:120000});
  if(test.error)throw test.error;process.stdout.write(test.stdout||'');assert.equal(test.status,0,test.stderr);result.concurrency='passed';
  docker(['exec',name,'pg_dump','-U','postgres','-Fc','-f','/tmp/fixture.dump','postgres']);
  docker(['exec',name,'createdb','-U','postgres','sf_restore']);
  docker(['exec',name,'pg_restore','-U','postgres','--exit-on-error','-d','sf_restore','/tmp/fixture.dump']);
  const manifest="SELECT format('SELECT %L,count(*),md5(coalesce(string_agg(row_to_json(t)::text,chr(10) ORDER BY row_to_json(t)::text),%L)) FROM %I.%I t;',table_schema||'.'||table_name,'',table_schema,table_name) FROM information_schema.tables WHERE table_schema IN('public','auth','storage') AND table_type='BASE TABLE' ORDER BY table_schema,table_name;";
  const commands=sql('postgres',manifest).stdout,before=sql('postgres',commands).stdout,after=sql('sf_restore',commands).stdout;
  assert.equal(after,before,'Restored table content or row counts differ');result.restoredTables=before.trim().split('\n').length;
  const acl="coalesce((SELECT string_agg(grantee::text||':'||privilege_type||':'||grantable::text,',' ORDER BY grantee,privilege_type) FROM (SELECT grantee,privilege_type,bool_or(is_grantable) grantable FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) GROUP BY grantee,privilege_type) p),'')";
  const protections="SELECT n.nspname||'.'||c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,c.reloptions::text,"+acl+" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage') AND c.relkind IN('r','v','m') ORDER BY 1;";
  const policies="SELECT n.nspname||'.'||c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY 1,2;";
  const functionAcl=acl.replaceAll('c.relacl','c.proacl').replaceAll('c.relowner','c.proowner').replace("acldefault('r'","acldefault('f'");
  const functions="SELECT n.nspname||'.'||c.proname||'('||pg_get_function_identity_arguments(c.oid)||')',pg_get_userbyid(c.proowner),c.prosecdef,c.proconfig::text,"+functionAcl+" FROM pg_proc c JOIN pg_namespace n ON n.oid=c.pronamespace WHERE n.nspname IN('public','auth','storage') ORDER BY 1;";
  for(const query of [protections,policies,functions])assert.equal(sql('sf_restore',query).stdout,sql('postgres',query).stdout,'Restored authorization metadata differs');
  const action=actor=>`SET ROLE service_role; SELECT assignment_action('${SCHOOL_A}','${actor}','state','{}');`;
  assert.ok(Object.keys(JSON.parse(sql('sf_restore',action(ADMIN_A)).stdout)).length);
  const denial=sql('sf_restore',action(STUDENT),true);assert.notEqual(denial.status,0);assert.match(denial.stderr,/42501/);
  result.restore='passed';result.authorization='passed';
 }finally{
  if(created){docker(['rm','--force',name]);result.containerRemoved=true;}result.seconds=Math.round((Date.now()-started)/10)/100;console.log(JSON.stringify(result));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
