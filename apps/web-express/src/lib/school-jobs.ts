import { supabasePlatform } from './supabase';
import { runWithSchool } from './school-scope';

/** Active status is guarded by the verified release gate and institutional approval. */
export async function forEachActiveSchool(job: () => Promise<void>) {
  let schools = 0, failedSchools = 0;
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabasePlatform.from('schools').select('id,slug,name,settings:school_settings!inner(approved_at)')
      .eq('status', 'active').not('settings.approved_at','is',null).order('id').range(offset, offset + 99);
    if (error) throw error;
    for (const school of data ?? []) {
      schools++;
      try { await runWithSchool({ id:school.id,slug:school.slug,name:school.name,actorId:null,role:null }, job); }
      catch { failedSchools++; }
    }
    if (!data || data.length < 100) return { schools, failedSchools };
  }
}
