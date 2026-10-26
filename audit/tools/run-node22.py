import os,subprocess,json,time
from pathlib import Path
root=Path.cwd();out=root/'audit/raw/node22';out.mkdir(exist_ok=True);env=os.environ.copy()
for k in list(env):
 if k.startswith(('SUPABASE_','RESEND_','GEMINI_','ASSISTANT_','SENTRY_','VERCEL_','NEXT_PUBLIC_')) or k in ['SESSION_SECRET','DATABASE_URL','CRON_SECRET','ASSIGNMENT_TEST_CONTAINER','APP_ORIGIN','ALLOWED_ORIGIN','NODE_OPTIONS','NODE_V8_COVERAGE']:env.pop(k,None)
env.update(SUPABASE_URL='https://audit-placeholder.supabase.co',SUPABASE_ANON_KEY='audit-not-a-real-key',SUPABASE_SERVICE_ROLE_KEY='audit-not-a-real-service-key',SESSION_SECRET='audit-synthetic-session-secret-not-for-deployment',APP_ORIGIN='http://localhost:3001',TMPDIR=str(root/'audit/tmp'),npm_config_cache=str(root/'audit/npm-cache'),NODE_OPTIONS='--require='+str(root/'audit/tools/no-network.cjs'))
node=json.loads((root/'audit/raw/node22.json').read_text());env['PATH']=str(Path(node['path']).parent)+os.pathsep+env['PATH'];env.pop('NODE_V8_COVERAGE',None)
commands=[('typecheck',['npm','run','typecheck']),('tests',['npm','test']),('build',['npm','run','build'])]
results=[]
for name,cmd in commands:
 start=time.time();child=env.copy()
 if name=='tests':(root/'audit/coverage-v8-node22').mkdir(exist_ok=True);child['NODE_V8_COVERAGE']=str(root/'audit/coverage-v8-node22')
 try:
  with (out/(name+'.log')).open('w') as log:r=subprocess.run(cmd,cwd=root/'audit/snapshot/apps/web-express',env=child,stdout=log,stderr=subprocess.STDOUT,timeout=900)
  result={'name':name,'command':' '.join(cmd),'exit':r.returncode,'seconds':round(time.time()-start,2)}
 except subprocess.TimeoutExpired:result={'name':name,'command':' '.join(cmd),'exit':'timeout','seconds':round(time.time()-start,2)}
 results.append(result);(out/'check-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(result),flush=True)
