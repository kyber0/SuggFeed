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
  const {error}=await supabasePlatform.rpc('issue_school_invitation',{p_school:school.id,p_actor:school.actorId,p_email:email.trim().toLowerCase(),p_role:role,p_hash:invitationHash(token)});
  if(error) throw error;
  return {success:true,isExisting:false,email:email.trim().toLowerCase(),role,inviteUrl:'/schools/invitations/'+token};
}

export async function loadAnalyticsData() {
  const { data: rows, error } = await supabaseService
    .from('submissions')
    .select('id,title,category_id,categories(name),status,vote_count,comment_count,created_at')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) throw error;
  const submissions = (rows ?? []).map((s: any) => ({
    id: s.id,
    title: s.title,
    category: s.categories?.name || 'Other',
    status: s.status,
    vote_count: Number(s.vote_count) || 0,
    comment_count: Number(s.comment_count) || 0,
    created_at: s.created_at,
  }));

  const now = new Date();
  const days30 = 30 * 24 * 60 * 60 * 1000;
  const curStart = new Date(now.getTime() - days30);
  const prevStart = new Date(now.getTime() - 2 * days30);

  const curSubs = submissions.filter((s: any) => new Date(s.created_at) >= curStart);
  const prevSubs = submissions.filter((s: any) => {
    const d = new Date(s.created_at);
    return d >= prevStart && d < curStart;
  });

  const curTotal = curSubs.length;
  const prevTotal = prevSubs.length;
  const totalDelta = prevTotal > 0 ? Math.round(((curTotal - prevTotal) / prevTotal) * 100) : (curTotal > 0 ? 100 : 0);

  const isApproved = (st: string) => ['approved', 'in_progress', 'resolved'].includes(st);
  const curApproved = curSubs.filter((s: any) => isApproved(s.status)).length;
  const prevApproved = prevSubs.filter((s: any) => isApproved(s.status)).length;
  const curAppRate = curTotal > 0 ? Math.round((curApproved / curTotal) * 100) : 0;
  const prevAppRate = prevTotal > 0 ? Math.round((prevApproved / prevTotal) * 100) : 0;
  const appDelta = curAppRate - prevAppRate;

  const curVotes = curSubs.reduce((sum: number, s: any) => sum + s.vote_count, 0);
  const prevVotes = prevSubs.reduce((sum: number, s: any) => sum + s.vote_count, 0);
  const votesDelta = prevVotes > 0 ? Math.round(((curVotes - prevVotes) / prevVotes) * 100) : (curVotes > 0 ? 100 : 0);

  const curResolved = curSubs.filter((s: any) => s.status === 'resolved').length;
  const prevResolved = prevSubs.filter((s: any) => s.status === 'resolved').length;
  const curResRate = curApproved > 0 ? Math.round((curResolved / curApproved) * 100) : 0;
  const prevResRate = prevApproved > 0 ? Math.round((prevResolved / prevApproved) * 100) : 0;
  const resDelta = curResRate - prevResRate;

  const curAvgVotes = curTotal > 0 ? Number((curVotes / curTotal).toFixed(1)) : 0;
  const prevAvgVotes = prevTotal > 0 ? Number((prevVotes / prevTotal).toFixed(1)) : 0;
  const avgVotesDelta = prevAvgVotes > 0 ? Math.round(((curAvgVotes - prevAvgVotes) / prevAvgVotes) * 100) : 0;

  // Timeline (daily for last 30 days)
  const timeline: Array<{ date: string; fullDate: string; submissions: number; approved: number; votes: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fullDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const daySubs = submissions.filter((s: any) => s.created_at.slice(0, 10) === dateStr);
    const dayApproved = daySubs.filter((s: any) => isApproved(s.status)).length;
    const dayVotes = daySubs.reduce((sum: number, s: any) => sum + s.vote_count, 0);
    timeline.push({ date: label, fullDate, submissions: daySubs.length, approved: dayApproved, votes: dayVotes });
  }

  // Category breakdown
  const catMap = new Map<string, { count: number; votes: number; approved: number; resolved: number }>();
  submissions.forEach((s: any) => {
    const cat = s.category || 'Other';
    const entry = catMap.get(cat) || { count: 0, votes: 0, approved: 0, resolved: 0 };
    entry.count++;
    entry.votes += s.vote_count;
    if (isApproved(s.status)) entry.approved++;
    if (s.status === 'resolved') entry.resolved++;
    catMap.set(cat, entry);
  });
  const allTotal = submissions.length || 1;
  const categories = Array.from(catMap.entries()).map(([name, stats]) => ({
    name,
    count: stats.count,
    votes: stats.votes,
    approved: stats.approved,
    resolved: stats.resolved,
    pct: Math.round((stats.count / allTotal) * 100),
  })).sort((a, b) => b.count - a.count);

  // Status Funnel
  const statusCounts = {
    pending: submissions.filter((s: any) => s.status === 'pending').length,
    approved: submissions.filter((s: any) => s.status === 'approved').length,
    in_progress: submissions.filter((s: any) => s.status === 'in_progress').length,
    resolved: submissions.filter((s: any) => s.status === 'resolved').length,
    rejected: submissions.filter((s: any) => s.status === 'rejected').length,
  };

  const funnel = [
    { status: 'pending', label: 'Needs review', count: statusCounts.pending, pct: 100 },
    { status: 'approved', label: 'Planned', count: statusCounts.approved, pct: allTotal ? Math.round((statusCounts.approved / allTotal) * 100) : 0 },
    { status: 'in_progress', label: 'In progress', count: statusCounts.in_progress, pct: allTotal ? Math.round((statusCounts.in_progress / allTotal) * 100) : 0 },
    { status: 'resolved', label: 'Completed', count: statusCounts.resolved, pct: allTotal ? Math.round((statusCounts.resolved / allTotal) * 100) : 0 },
    { status: 'rejected', label: 'Declined', count: statusCounts.rejected, pct: allTotal ? Math.round((statusCounts.rejected / allTotal) * 100) : 0 },
  ];

  return {
    kpis: {
      totalSubmissions: { value: curTotal, delta: totalDelta },
      approvalRate: { value: curAppRate, delta: appDelta },
      totalVotes: { value: curVotes, delta: votesDelta },
      resolutionRate: { value: curResRate, delta: resDelta },
      avgVotes: { value: curAvgVotes, delta: avgVotesDelta },
    },
    statusCounts,
    timeline,
    categories,
    funnel,
    rawSubmissions: submissions.slice(0, 500),
  };
}
