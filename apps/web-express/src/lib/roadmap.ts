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
    view: input.view === 'list' ? 'list' : 'board',
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1,
  };
}
const publicColumns = 'id,title,description,status,vote_count,comment_count,created_at,updated_at,staff_note';
function publicItem(row: any) {
  return { id: row.id, title: row.title, description: row.description || '', status: row.status,
    category: row.categories?.name || 'Other', votes: row.vote_count || 0, comments: row.comment_count || 0,
    created_at: row.created_at, updated_at: row.updated_at || row.created_at, response: row.staff_note || '' };
}
export async function loadRoadmapPage(filters: ReturnType<typeof roadmapFilters>) {
  const results = await Promise.all(ROADMAP_STAGES.map(async stage => {
    const visible = filters.stage === 'all' || filters.stage === stage;
    const categoryJoin = filters.category === 'all' ? 'categories(name)' : 'categories!inner(name)';
    let query = supabase.from('submissions').select(`${publicColumns},${categoryJoin}`, { count: 'exact', head: !visible }).eq('status', stage);
    if (filters.category !== 'all') query = query.eq('categories.name', filters.category);
    if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
    if (visible) query = query.order('vote_count', { ascending: false }).order('id')
      .range((filters.page - 1) * ROADMAP_PER_STAGE, filters.page * ROADMAP_PER_STAGE - 1);
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
