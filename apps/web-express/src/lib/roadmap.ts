import { supabase } from './supabase';
import { sanitizeSearch } from './data';

export const ROADMAP_STAGES = ['approved', 'in_progress', 'resolved'] as const;
export const ROADMAP_PER_STAGE = 8;
export function roadmapFilters(input: Record<string, unknown>) {
  const requestedPage = Number(input.page);
  return {
    search: typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '',
    category: typeof input.category === 'string' ? input.category.trim().slice(0, 80) || 'all' : 'all',
    stage: typeof input.stage === 'string' && ROADMAP_STAGES.some(s => s === input.stage) ? input.stage : 'all',
    view: input.view === 'tree' || input.view === 'list' ? 'tree' : input.view === 'timeline' ? 'timeline' : 'board',
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1,
  };
}
const publicColumns = 'id,title,description,status,vote_count,comment_count,created_at,updated_at,resolved_at,staff_note';
export function publicItem(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    category: row.categories?.name || 'Other',
    votes: row.vote_count || 0,
    comments: row.comment_count || 0,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    resolved_at: row.resolved_at || null,
    response: row.staff_note || '',
  };
}

export function formatManilaDate(dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  });
}

export async function loadRoadmapPage(filters: ReturnType<typeof roadmapFilters>) {
  const results = await Promise.all(ROADMAP_STAGES.map(async stage => {
    const visible = filters.stage === 'all' || filters.stage === stage;
    const categoryJoin = filters.category === 'all' ? 'categories(name)' : 'categories!inner(name)';
    let query = supabase.from('submissions').select(`${publicColumns},${categoryJoin}`, { count: 'exact', head: !visible }).eq('status', stage);
    if (filters.category !== 'all') query = query.eq('categories.name', filters.category);
    if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
    if (visible) {
      if (stage === 'resolved') {
        query = query.order('resolved_at', { ascending: false, nullsFirst: false }).order('vote_count', { ascending: false }).order('id');
      } else {
        query = query.order('vote_count', { ascending: false }).order('id');
      }
      query = query.range((filters.page - 1) * ROADMAP_PER_STAGE, filters.page * ROADMAP_PER_STAGE - 1);
    }
    const { data, count, error } = await query;
    if (error) throw error;
    return { stage, items: (data || []).map(publicItem), count: count || 0, visible };
  }));
  const counts = Object.fromEntries(results.map(r => [r.stage, r.count]));
  const matchingCount = results.reduce((total, r) => total + r.count, 0);
  const pageCount = Math.max(1, ...results.filter(r => r.visible).map(r => Math.ceil(r.count / ROADMAP_PER_STAGE)));
  let totalCount = matchingCount;
  if (filters.search || filters.category !== 'all') {
    const { count, error } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).in('status', [...ROADMAP_STAGES]);
    if (error) throw error;
    totalCount = count || 0;
  }
  return { items: results.flatMap(r => r.items), counts, totalCount, matchingCount, pageCount, perStage: ROADMAP_PER_STAGE };
}

export async function loadRecentlyCompleted(): Promise<Array<ReturnType<typeof publicItem>>> {
  const { data, error } = await supabase
    .from('submissions')
    .select(`${publicColumns},categories(name)`)
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .order('vote_count', { ascending: false })
    .limit(3);
  if (error) return [];
  return (data || []).map(publicItem);
}

export async function loadRoadmapCategories() {
  const { data, error } = await supabase.from('categories').select('name').order('name');
  if (error) throw error;
  return (data || []).map(c => c.name as string);
}

export async function loadPublicRoadmapIdea(id: string) {
  const { data, error } = await supabase.from('submissions').select(`${publicColumns},categories(name)`).eq('id', id).in('status', [...ROADMAP_STAGES]).maybeSingle();
  if (error) throw error;
  return data ? publicItem(data) : null;
}

export function groupTreeByCategory(items: Array<ReturnType<typeof publicItem>>, allCategories: string[]) {
  const catNames = Array.from(new Set([...allCategories, ...items.map(i => i.category)])).filter(Boolean).sort();
  return catNames.map(name => {
    const catItems = items.filter(i => i.category === name);
    const completed = catItems.filter(i => i.status === 'resolved').length;
    const inProgress = catItems.filter(i => i.status === 'in_progress').length;
    const planned = catItems.filter(i => i.status === 'approved').length;
    const total = catItems.length || 1;
    return {
      name,
      total: catItems.length,
      completed,
      inProgress,
      planned,
      pctCompleted: Math.round((completed / total) * 100),
      pctInProgress: Math.round((inProgress / total) * 100),
      pctPlanned: Math.round((planned / total) * 100),
      leaves: catItems,
    };
  }).filter(branch => branch.total > 0);
}

export function groupTimelineByMonth(items: Array<ReturnType<typeof publicItem>>) {
  const resolvedItems = items.filter(i => i.status === 'resolved').sort((a, b) => {
    const da = a.resolved_at || a.updated_at || a.created_at;
    const db = b.resolved_at || b.updated_at || b.created_at;
    return new Date(db).getTime() - new Date(da).getTime();
  });

  const monthMap = new Map<string, { monthKey: string; label: string; items: Array<ReturnType<typeof publicItem>> }>();
  resolvedItems.forEach(item => {
    const dateStr = item.resolved_at || item.updated_at || item.created_at;
    const d = new Date(dateStr);
    const monthKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(d);
    const label = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' }).format(d);
    const group = monthMap.get(monthKey) || { monthKey, label, items: [] };
    group.items.push(item);
    monthMap.set(monthKey, group);
  });

  return Array.from(monthMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

