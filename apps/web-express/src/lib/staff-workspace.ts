import { supabaseService } from './supabase';
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
  const { data, error } = await supabaseService.from('profiles').select('id,display_name,role').in('role', ['admin', 'moderator']).order('display_name');
  if (error) throw error;
  return data ?? [];
}
export async function loadSavedViews(ownerId: string) {
  const { data, error } = await supabaseService.from('staff_saved_views').select('id,name,filters').eq('owner_id', ownerId).order('created_at');
  if (error) throw error;
  return data ?? [];
}
