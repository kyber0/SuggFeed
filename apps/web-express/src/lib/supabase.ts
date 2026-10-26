import { providerFetch } from './provider-fetch';
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

export const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/**
 * Public (anon) client — respects RLS.
 * Use this for all reads that should be filtered by RLS policies (public feed, categories, etc.).
 */
const publicClient = createClient(
  supabaseUrl || "https://placeholder-project.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  { global: { fetch: providerFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

/**
 * Service-role client — bypasses RLS.
 * Use ONLY for trusted server-side writes (submissions, comments, votes, admin updates).
 * Never expose this client's credentials to the browser.
 * Falls back to anon key in dev when service key is absent (writes will fail via RLS — expected).
 */
export const supabasePlatform = createClient(
  supabaseUrl || "https://placeholder-project.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey || "placeholder-anon-key",
  { global: { fetch: providerFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

/** Never share mutable Auth state between requests or with the service-role client. */
export function createAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: providerFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Keep one immutable provider client; scope each operation to the async request/job.
import { requireSchool } from './school-scope';
const businessTables = new Set([
  'comment_moderation_queue','categories','submissions','comments','votes','bookmarks','shared_posts','reports','status_history','attachments',
  'submission_workflow','staff_internal_notes','staff_workflow_history','staff_saved_views','staff_submission_queue','staff_work_queue','staff_stale_work',
  'idea_updates','idea_update_drafts','idea_update_uploads','idea_follows','idea_notifications','idea_notification_outbox',
  'idea_clarifications','idea_merges','notification_preferences','weekly_digest_jobs','student_saved_searches',
  'submission_receipts','workflow_requests','work_date_repairs','retention_settings','school_profiles',
]);

/** Scope every builder before it can execute, including mutations and their returned rows. */
function scopedFrom(client: typeof publicClient, table: string) {
  const school = requireSchool();
  const relation = table === 'profiles' ? 'school_profiles' : table;
  if (!businessTables.has(relation)) throw new Error('This table is not a school data source.');
  const publicRead = client === publicClient;
  if (publicRead && !['categories','submissions','comments'].includes(relation)) throw new Error('This relation is not public.');
  const staffViews:Record<string,string>={submissions:'staff_assigned_submissions',staff_submission_queue:'staff_assignment_queue',staff_work_queue:'staff_work_queue',staff_stale_work:'staff_assignment_stale',staff_internal_notes:'staff_assignment_notes',staff_workflow_history:'staff_assignment_history',idea_clarifications:'staff_assignment_clarifications'};
  const restrictedView=!publicRead&&school.role==='moderator'&&(school.staffRead||['staff_submission_queue','staff_work_queue','staff_stale_work','staff_internal_notes','staff_workflow_history'].includes(relation))?staffViews[relation]:undefined;
  const builder = supabasePlatform.from(relation);
  return new Proxy(builder, {
    get(target, property) {
      if (property === 'select' || property === 'update' || property === 'delete') {
        return (...args: any[]) => {
          if (publicRead && property !== 'select') throw new Error('Public data cannot be modified.');
          if (property === 'update' && args[0] && Object.prototype.hasOwnProperty.call(args[0], 'school_id')) throw new Error('School ownership cannot be changed.');
          if (table === 'profiles' && property !== 'select') throw new Error('Account changes require a verified owner operation.');
          const readTarget=property==='select'&&restrictedView?supabasePlatform.from(restrictedView):target;
          let query = (readTarget as any)[property](...args).eq('school_id', school.id);
          if(property==='select'&&restrictedView)query=query.contains('assignment_staff_ids',[school.actorId]);
          if(!publicRead&&school.role==='moderator'&&relation==='reports')query=query.eq('user_id',school.actorId);
          if (publicRead && relation === 'submissions') query=query.in('status',['approved','in_progress','resolved']).eq('safety_state','clear');
          if (!publicRead && relation === 'submissions' && school.role==='moderator') query=query.eq('safety_state','clear');
          if (publicRead && relation === 'categories') query=query.eq('is_active',true);
          if (publicRead && relation === 'comments') query=query.eq('is_hidden',false).eq('submission.safety_state','clear');
          return query;
        };
      }
      if (property === 'insert' || property === 'upsert') return (values: any, options?: any) => {
        if (publicRead) throw new Error('Public data cannot be modified.');
        if (table === 'profiles') throw new Error('Account changes require a verified owner operation.');
        const stamp = (value: any) => {
          if (!value || typeof value !== 'object' || Array.isArray(value) || (value.school_id && value.school_id !== school.id)) throw new Error('Invalid school record.');
          return { ...value, school_id: school.id };
        };
        const payload = Array.isArray(values) ? values.map(stamp) : stamp(values);
        const scopedOptions = options?.onConflict && !options.onConflict.split(',').includes('school_id')
          ? { ...options, onConflict: 'school_id,' + options.onConflict } : options;
        return (target as any)[property](payload, scopedOptions).eq('school_id', school.id);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function schoolClient(client: typeof publicClient): typeof publicClient {
  const scoped = Object.create(client);
  scoped.from = (table: string) => scopedFrom(client, table);
  scoped.rpc = (name: string, args: Record<string, unknown> = {}) => {
    const school = requireSchool();
    return supabasePlatform.rpc('tenant_rpc', { p_school_id: school.id, p_actor_id: school.actorId, p_function: name, p_args: args });
  };
  return scoped;
}
export const supabase = schoolClient(publicClient);
export const supabaseService = schoolClient(supabasePlatform);
