import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createTenantDb} from './tenant-db';
export async function safetyDb(migrationRole=false){
 const db=await createTenantDb({migrationRole});const directory=path.resolve(__dirname,'../../../../supabase/migrations');
 try{if(migrationRole)await db.exec('SET ROLE migration_owner');for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')&&n>'202610160002_tenant_isolation.sql').sort())await db.exec(readFileSync(path.join(directory,name),'utf8').replace(/\bCONCURRENTLY\b/g,''));if(migrationRole)await db.exec('RESET ROLE');return db;}catch(error){await db.close();throw error;}
}
