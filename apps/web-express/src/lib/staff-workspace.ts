import {summarizeAnalytics} from './analytics';
import { requireSchool } from './school-scope';
import { invitationToken, invitationHash } from './school-onboarding';
import { supabaseService, supabasePlatform } from './supabase';
import { MODERATION_STATUSES, PER_PAGE, sanitizeSearch } from './data';

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function staffRole(role: string | undefined) { return !!role && ['admin', 'moderator', 'staff'].includes(role); }
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100 &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function queueFilters(input: Record<string, unknown>) {
  return {
    status: typeof input.status === 'string' && (input.status === 'all' || MODERATION_STATUSES.some(s => s === input.status)) ? input.status : 'pending',
    search: typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '',
    assignment: input.assignment === 'mine' || input.assignment === 'unassigned' ? input.assignment : 'all',
    priority: typeof input.priority === 'string' && PRIORITIES.some(p => p === input.priority) ? input.priority : 'all',
    overdue: input.overdue === 'true' ? 'true' : 'false',
  };
}
export async function loadStaffQueue(filters: ReturnType<typeof queueFilters>, staffId: string, page: number) {
  let query = supabaseService.from('staff_submission_queue').select('*', { count: 'exact' });
  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.assignment === 'mine') query = query.eq('assignee_id', staffId);
  if (filters.assignment === 'unassigned') query = query.is('assignee_id', null);
  if (filters.priority !== 'all') query = query.eq('priority', filters.priority);
  if (filters.overdue === 'true') {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    query = query.lt('target_date', today).not('status', 'in', '(resolved,rejected)');
  }
  if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
  const { data, count, error } = await query.order('created_at', { ascending: filters.status === 'pending' }).order('id')
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}
export async function loadStaffMembers() {
  const { data, error } = await supabaseService
    .from('profiles')
    .select('id,display_name,email,role,created_at')
    .in('role', ['admin', 'moderator'])
    .order('role')
    .order('display_name');
  if (error) throw error;
  return data ?? [];
}
export async function loadSavedViews(ownerId: string) {
  const { data, error } = await supabaseService.from('staff_saved_views').select('id,name,filters').eq('owner_id', ownerId).order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function searchStudentProfiles(search = '', limit = 30) {
  const trimmed = search.trim();
  let q = supabaseService
    .from('profiles')
    .select('id,display_name,email,role,created_at')
    .eq('role', 'student')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (trimmed) {
    q = q.or(`email.ilike.%${sanitizeSearch(trimmed)}%,display_name.ilike.%${sanitizeSearch(trimmed)}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateStaffRole(actorId: string, memberId: string, newRole: 'admin' | 'moderator' | 'student') {
  const school=requireSchool();
  if(school.actorId!==actorId || school.role!=='admin') throw new Error('School administrator access required.');
  const {error}=await supabasePlatform.rpc('change_school_membership',{p_school:school.id,p_actor:actorId,p_user:memberId,p_role:newRole,p_status:'active'});
  if(error) throw error;
  return {success:true};
}

export async function inviteStaffMember(email: string, role: 'admin' | 'moderator') {
  const school=requireSchool();
  if(!school.actorId || school.role!=='admin') throw new Error('School administrator access required.');
  const token=invitationToken();
  const {error}=await supabasePlatform.rpc('create_school_member_invitation',{p_school:school.id,p_actor:school.actorId,p_email:email.trim().toLowerCase(),p_role:role,p_hash:invitationHash(token),p_delivery:'link'});
  if(error) throw error;
  return {success:true,isExisting:false,email:email.trim().toLowerCase(),role,inviteUrl:'/schools/invitations/'+token};
}

export async function loadAnalyticsData(filters:Record<string,unknown>={}) {
  const {data,error}=await supabaseService.from('submissions').select('categories(name),status,vote_count,created_at').order('created_at',{ascending:false}).limit(2000);
  if(error)throw error;
  return summarizeAnalytics(data || [],filters);
}
