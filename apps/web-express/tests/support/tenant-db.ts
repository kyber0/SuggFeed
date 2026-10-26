import { PGlite } from '@electric-sql/pglite';
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const DEMO_SCHOOL='00000000-0000-4000-8000-000000000001';
export const SCHOOL_A='00000000-0000-4000-8000-00000000000a';
export const SCHOOL_B='00000000-0000-4000-8000-00000000000b';
export const ADMIN_A='10000000-0000-4000-8000-00000000000a';
export const ADMIN_B='10000000-0000-4000-8000-00000000000b';
export const STUDENT='10000000-0000-4000-8000-000000000002';
export const CATEGORY_A='20000000-0000-4000-8000-00000000000a';
export const CATEGORY_B='20000000-0000-4000-8000-00000000000b';
export const IDEA_A='30000000-0000-4000-8000-00000000000a';
export const IDEA_B='30000000-0000-4000-8000-00000000000b';
export interface FixtureDatabase {
 exec(sql:string):Promise<unknown>;
 query<T=Record<string,unknown>>(sql:string,params?:unknown[]):Promise<{rows:T[]}>;
 close():Promise<void>;
}
export type TenantFixtureOptions={through?:string;seed?:boolean;migrationRole?:boolean};
export async function createTenantDb(options:TenantFixtureOptions={}) {
 return bootstrapTenantDb(new PGlite({extensions:{pg_trgm}}),options);
}
export async function bootstrapTenantDb<DB extends FixtureDatabase>(db:DB,options:TenantFixtureOptions={}):Promise<DB> {
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
  if(options.migrationRole) {
   await db.exec(`CREATE ROLE migration_owner NOLOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE;
    ALTER SCHEMA public OWNER TO migration_owner;ALTER SCHEMA auth OWNER TO migration_owner;
    ALTER SCHEMA storage OWNER TO migration_owner;ALTER TABLE auth.users OWNER TO migration_owner;
    ALTER FUNCTION auth.uid() OWNER TO migration_owner;ALTER TABLE storage.buckets OWNER TO migration_owner;
    ALTER TABLE storage.objects OWNER TO migration_owner;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
   const database=(await db.query<{name:string}>('SELECT current_database() AS name')).rows[0].name;
   await db.exec('GRANT CREATE ON DATABASE '+JSON.stringify(database)+' TO migration_owner');
   await db.exec('SET ROLE migration_owner');
  }
  const dir=path.resolve(__dirname,'../../../../supabase/migrations');
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<=(options.through??'202610160002_tenant_isolation.sql')).sort()) {
   // PGlite runs exec in a transaction; CONCURRENTLY changes only index-build locking.
   try {await db.exec(readFileSync(path.join(dir,name),'utf8').replace(/\bCONCURRENTLY\b/g,''));}
   catch(e:any) {const failure=new Error(`${name}: ${e.message}; ${e.internalQuery??''}`);(failure as any).cause=e;throw failure;}
  }
  if(options.migrationRole) await db.exec('RESET ROLE');
  if(options.seed!==false) {
   await db.exec('UPDATE school_release_gate SET isolation_verified=true');
   for(const [school,slug,admin] of [[SCHOOL_A,'school-a',ADMIN_A],[SCHOOL_B,'school-b',ADMIN_B]]) {
    await db.query("INSERT INTO schools(id,slug,name,status) VALUES($1,$2,$2,'active')",[school,slug]);
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[admin,slug+'@example.invalid']);
    await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'admin')",[school,admin]);
   }
   await db.query("INSERT INTO auth.users(id,email) VALUES($1,'student@example.invalid')",[STUDENT]);
   await db.query("INSERT INTO school_memberships(school_id,user_id,role) VALUES($1,$2,'student'),($3,$2,'student')",[SCHOOL_A,STUDENT,SCHOOL_B]);
   for(const [school,category,idea] of [[SCHOOL_A,CATEGORY_A,IDEA_A],[SCHOOL_B,CATEGORY_B,IDEA_B]]) {
    await db.query("INSERT INTO categories(school_id,id,name,slug) VALUES($1,$2,'Facilities','facilities') ON CONFLICT(school_id,slug) DO UPDATE SET id=excluded.id",[school,category]);
    await db.query("INSERT INTO submissions(school_id,id,title,description,category_id,user_id,status) VALUES($1,$2,'Improve library seating','Add additional library study area seating.',$3,$4,'approved')",[school,idea,category,STUDENT]);
   }
   await db.exec('UPDATE school_release_gate SET isolation_verified=false');
  }
  return db;
 }catch(e){await db.close();throw e;}
}
export async function tenantRpc(db:PGlite,school:string,actor:string|null,name:string,args:Record<string,unknown>={}) {
 await db.exec('SET ROLE service_role');
 try {return (await db.query<{result:any}>('SELECT tenant_rpc($1,$2,$3,$4::jsonb) result',[school,actor,name,JSON.stringify(args)])).rows[0].result;}
 finally {await db.exec('RESET ROLE');}
}
