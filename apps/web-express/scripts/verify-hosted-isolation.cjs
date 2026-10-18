// Read-only metadata by default; --probes executes the reviewed rollback-only SQL.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
async function main(){
 const host=new URL(process.env.SUPABASE_URL||'').hostname;const ref=host.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
 assert.ok(ref&&process.env.SUPABASE_ACCESS_TOKEN,'A configured Supabase project and management token are required.');
 async function query(sql){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});const body=await r.json();if(!r.ok)throw Error(`Hosted verification query failed (${r.status}): ${body.message||body.error||'database error'}`);return body;}
 const snapshotSql=`SELECT jsonb_build_object(
 'gate',(SELECT to_jsonb(g) FROM public.school_release_gate g WHERE singleton),
 'counts',jsonb_build_object('accounts',(SELECT count(*) FROM auth.users),'schools',(SELECT count(*) FROM public.schools),'probes',(SELECT count(*) FROM public.schools WHERE slug LIKE 'probe-%')),
 'owned_tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'not_null',a.attnotnull,'anon_read',has_any_column_privilege('anon',c.oid,'SELECT'),'authenticated_read',has_any_column_privilege('authenticated',c.oid,'SELECT'),'executor_read',has_table_privilege('tenant_executor',c.oid,'SELECT'),'executor_scoped_policy',EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND 'tenant_executor'::regrole=ANY(p.polroles) AND pg_get_expr(p.polqual,p.polrelid) LIKE '%tenant_school_id%'))) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='school_id' WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'),
 'executor',(SELECT jsonb_build_object('login',rolcanlogin,'superuser',rolsuper,'bypass_rls',rolbypassrls,'create_role',rolcreaterole) FROM pg_roles WHERE rolname='tenant_executor'),
 'executor_public_memberships',(SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member WHERE r.rolname='tenant_executor' AND u.rolname IN('anon','authenticated','service_role')),
 'gate_service_write',has_table_privilege('service_role','public.school_release_gate','UPDATE'),
 'private_buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'public',public)) FROM storage.buckets WHERE id IN('submission-attachments','idea-update-evidence')),
 'invalid_tenant_foreign_keys',(SELECT count(*) FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='school_id' JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attname='school_id' WHERE c.contype='f' AND NOT(a.attnum=ANY(c.conkey) AND b.attnum=ANY(c.confkey))),
 'boundary_fingerprint',(SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\\n' ORDER BY p.proname,p.oid)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN('tenant_rpc','school_actor_has_role','guard_school_activation','guard_tenant_ownership','school_publication_allowed'))
 ) AS snapshot`;
 const before=(await query(snapshotSql))[0].snapshot;
 assert.equal(before.counts.probes,0,'Unclean probe baseline');assert.equal(before.executor_public_memberships,0);assert.equal(before.gate_service_write,false);assert.equal(before.invalid_tenant_foreign_keys,0);
 assert.ok(before.owned_tables.length>=30);
 for(const table of before.owned_tables){assert.equal(table.rls,true,table.name+' requires RLS');if(table.executor_read)assert.equal(table.executor_scoped_policy,true,table.name+' requires executor scope policy');if(table.name!=='school_applications')assert.equal(table.not_null,true,table.name+' requires ownership');assert.equal(table.anon_read,false,table.name+' must not grant anonymous direct access');if(!['school_memberships'].includes(table.name))assert.equal(table.authenticated_read,false,table.name+' must not grant authenticated direct access');}
 for(const value of Object.values(before.executor))assert.equal(value,false,'Executor role is too privileged');
 assert.equal(before.private_buckets.length,2);for(const bucket of before.private_buckets)assert.equal(bucket.public,false);
 const report={project:ref,captured_at:new Date().toISOString(),metadata:before,probes:null};
 if(process.argv.includes('--probes')){
  const file=path.join(root,'supabase/verification/hosted_tenant_isolation.sql');const sql=fs.readFileSync(file,'utf8');
  assert.ok(sql.includes('ROLLBACK;')&&!/COMMIT\s*;/i.test(sql.replace(/^--.*$/gm,'')),'Probe must roll back');
  const results=await query(sql);const value=results.find(row=>row.verification)?.verification;
  assert.equal(value?.all_passed,true,'Hosted probe did not return a passing result');
  report.probes={...value,sql_sha256:crypto.createHash('sha256').update(sql).digest('hex')};
  const after=(await query(snapshotSql))[0].snapshot;
  assert.deepEqual(after,before,'Probe changed persistent registry, accounts, metadata, or activation gate');report.rollback_verified=true;
 }
 const output=process.env.ISOLATION_REPORT_PATH||'/tmp/suggfeed-hosted-isolation.json';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({metadata_passed:true,probe_checks:report.probes?.check_count||0,rollback_verified:report.rollback_verified||false,report:output}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
