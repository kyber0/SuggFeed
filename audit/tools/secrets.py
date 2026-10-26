import subprocess,json
from pathlib import Path
root=Path.cwd();exe='/tmp/sf-security-tools/gitleaks';summaries=[]
for mode,args in [('tracked-snapshot',['dir',str(root/'audit/snapshot')]),('git-history',['git','--log-opts=--all'])]:
 report=root/'audit/raw'/('secrets-'+mode+'-redacted.json')
 cmd=[exe,*args,'--redact=100','--no-banner','--report-format=json','--report-path='+str(report),'--gitleaks-ignore-path='+str(root/'.gitleaksignore')]
 with (root/'audit/raw'/('secrets-'+mode+'.log')).open('w') as log:
  result=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=180)
 rows=json.loads(report.read_text()) if report.exists() else []
 summaries.append({'scope':mode,'exit':result.returncode,'findings':[{'path':r.get('File'),'type':r.get('RuleID'),'line':r.get('StartLine'),'commit':r.get('Commit')} for r in rows]})
 report.unlink(missing_ok=True)
(root/'audit/raw/secret-findings-paths.json').write_text(json.dumps(summaries,indent=2));print(json.dumps([{'scope':s['scope'],'exit':s['exit'],'count':len(s['findings'])} for s in summaries]))
