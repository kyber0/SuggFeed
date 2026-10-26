import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createTenantDb,type FixtureDatabase} from './tenant-db';
export async function safetyDb(migrationRole=false){
 return finishSafetyMigrations(await createTenantDb({migrationRole}),migrationRole);
}
export async function finishSafetyMigrations<DB extends FixtureDatabase>(db:DB,migrationRole=false):Promise<DB>{
 const directory=path.resolve(__dirname,'../../../../supabase/migrations');
 try{if(migrationRole)await db.exec('SET ROLE migration_owner');for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')&&n>'202610160002_tenant_isolation.sql').sort())await db.exec(readFileSync(path.join(directory,name),'utf8').replace(/\bCONCURRENTLY\b/g,''));if(migrationRole)await db.exec('RESET ROLE');return db;}catch(error){await db.close();throw error;}
}
