import os,json,subprocess,time,urllib.request,urllib.error
from pathlib import Path
root=Path.cwd();env=os.environ.copy()
for k in list(env):
 if k.startswith(('SUPABASE_','RESEND_','GEMINI_','ASSISTANT_','SENTRY_','VERCEL_','NEXT_PUBLIC_')) or k in ['SESSION_SECRET','DATABASE_URL','CRON_SECRET','NODE_OPTIONS','NODE_V8_COVERAGE','NODE_ENV']:env.pop(k,None)
env.update(SUPABASE_URL='https://audit-placeholder.supabase.co',SUPABASE_ANON_KEY='audit-not-a-real-key',SUPABASE_SERVICE_ROLE_KEY='audit-not-a-real-service-key',SESSION_SECRET='audit-synthetic-session-secret-not-for-deployment',PORT='31337',TMPDIR=str(root/'audit/tmp'),NODE_OPTIONS='--require='+str(root/'audit/tools/no-network.cjs'))
node=json.loads((root/'audit/raw/node22.json').read_text())['path'];responses=[]
with (root/'audit/raw/start.log').open('w') as log:
 proc=subprocess.Popen([node,'dist/server.js'],cwd=root/'audit/snapshot/apps/web-express',env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  for i in range(50):
   try:
    with urllib.request.urlopen('http://127.0.0.1:31337/account/home',timeout=1) as response:responses.append({'path':'/account/home','status':response.status});break
   except Exception:time.sleep(.1)
  try:
   with urllib.request.urlopen('http://127.0.0.1:31337/health',timeout=3) as response:responses.append({'path':'/health','status':response.status})
  except urllib.error.HTTPError as e:responses.append({'path':'/health','status':e.code,'expected':'fake database and external-network block'})
  except Exception as e:responses.append({'path':'/health','errorType':type(e).__name__,'deadlineSeconds':3,'note':'synthetic database unavailable; no live credentials used'})
 finally:proc.terminate();proc.wait(timeout=15)
(root/'audit/raw/onboarding-start.json').write_text(json.dumps({'node':json.loads((root/'audit/raw/node22.json').read_text())['version'],'responses':responses,'externalAccess':'blocked; synthetic credentials only'},indent=2));print(responses)
