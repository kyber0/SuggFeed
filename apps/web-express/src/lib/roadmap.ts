import {schoolCategory,schoolCategories} from './school-customization';
import { supabase } from './supabase';
import { sanitizeSearch, fetchWithCache, type CacheStatus } from './data';

export const ROADMAP_STAGES = ['approved', 'in_progress', 'resolved'] as const;
export const ROADMAP_PER_STAGE = 8;
export const ROADMAP_DONE_PER_PAGE = 20;
export const ROADMAP_TIMELINE_PER_PAGE = 20;
export function roadmapFilters(input: Record<string, unknown>) {
  const requestedPage = Number(input.page);
  const view = input.view === 'tree' || input.view === 'list' ? 'tree' : input.view === 'done' || input.view === 'outcomes' ? 'done' : input.view === 'timeline' ? 'timeline' : 'board';
  return {
    search: typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '',
    category: typeof input.category === 'string' ? schoolCategory(input.category)?.id || 'all' : 'all',
    stage: view === 'done' ? 'resolved' : typeof input.stage === 'string' && ROADMAP_STAGES.some(s => s === input.stage) ? input.stage : 'all',
    view,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1,
  };
}
const publicColumns = 'id,title,description,status,vote_count,comment_count,created_at,updated_at,resolved_at,resolved_at_estimated,progress_percent,started_at,is_blocked,staff_note';
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
    resolved_at_estimated: row.status === 'resolved' && (!row.resolved_at || row.resolved_at_estimated === true),
    progress_percent: Number.isInteger(row.progress_percent) && row.progress_percent >= 0 && row.progress_percent <= 100 ? row.progress_percent : null,
    started_at: row.started_at || null,
    is_blocked: row.is_blocked === true,
    response: row.staff_note || '',
    last_public_update: row.last_public_update || null,
    outcome: row.outcome || '',
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

export function loadRoadmapPage(filters: ReturnType<typeof roadmapFilters>,reportCache?:(status:CacheStatus)=>void) {
  // Public lists only. Detail routes retain fresh publication checks.
  const key='roadmap_page_'+JSON.stringify(filters);
  return fetchWithCache(key,()=>readRoadmapPage(filters),15_000,reportCache);
}
async function readRoadmapPage(filters: ReturnType<typeof roadmapFilters>) {
  const results = await Promise.all(ROADMAP_STAGES.map(async stage => {
    const visible = filters.stage === 'all' || filters.stage === stage;
    const categoryJoin = filters.category === 'all' ? 'categories(name)' : 'categories!inner(name)';
    const loadItems = filters.view === 'board' && visible;
    let query = supabase.from('submissions').select(`${publicColumns},${categoryJoin}`, { count: 'exact', head: !loadItems }).eq('status', stage);
    if (filters.category !== 'all') query = query.eq('category_id', schoolCategory(filters.category)?.id || filters.category);
    if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
    if (loadItems) {
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
  const matchingCount = results.filter(r => r.visible).reduce((total, r) => total + r.count, 0);
  let pageCount = Math.max(1, ...results.filter(r => r.visible).map(r => Math.ceil(r.count / ROADMAP_PER_STAGE)));
  let totalCount = results.reduce((total, r) => total + r.count, 0);
  if (filters.search || filters.category !== 'all') {
    const { count, error } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).in('status', [...ROADMAP_STAGES]);
    if (error) throw error;
    totalCount = count || 0;
  }
  let items = results.flatMap(r => r.items);
  let treeData: Array<ReturnType<typeof treeBranch>> = [];
  let doneData: ReturnType<typeof groupTimelineByMonth> = [];
  if (filters.view === 'tree') {
    const { data: aggregates, error } = await supabase.rpc('roadmap_category_counts', {
      p_search: sanitizeSearch(filters.search), p_category: filters.category, p_stage: filters.stage,
    });
    if (error) throw error;
    treeData = await Promise.all((aggregates || []).map(async (aggregate: any) => {
      let query = supabase.from('submissions').select(`${publicColumns},categories!inner(name)`)
        .eq('categories.name', aggregate.name).in('status', filters.stage === 'all' ? [...ROADMAP_STAGES] : [filters.stage]);
      if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
      query = query.order('vote_count', { ascending: false }).order('id');
      const page = filters.category === 'all' ? 1 : filters.page;
      const { data, error: previewError } = await query.range((page - 1) * ROADMAP_PER_STAGE, page * ROADMAP_PER_STAGE - 1);
      if (previewError) throw previewError;
      return treeBranch(aggregate.name, (data || []).map(publicItem), {
        total: Number(aggregate.total), completed: Number(aggregate.completed),
        inProgress: Number(aggregate.in_progress), planned: Number(aggregate.planned),
      });
    }));
    items = treeData.flatMap(branch => branch.leaves);
    pageCount = filters.category === 'all' ? 1 : Math.max(1, Math.ceil(matchingCount / ROADMAP_PER_STAGE));
  } else if (filters.view === 'done') {
    let query = supabase.from('submissions').select(`${publicColumns},${filters.category === 'all' ? 'categories(name)' : 'categories!inner(name)'}`).eq('status', 'resolved');
    if (filters.category !== 'all') query = query.eq('category_id', schoolCategory(filters.category)?.id || filters.category);
    if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
    const { data, error } = await query.order('resolved_at', { ascending: false, nullsFirst: false }).order('id')
      .range((filters.page - 1) * ROADMAP_DONE_PER_PAGE, filters.page * ROADMAP_DONE_PER_PAGE - 1);
    if (error) throw error;
    items = (data || []).map(publicItem);
    doneData = groupTimelineByMonth(items);
    pageCount = Math.max(1, Math.ceil(matchingCount / ROADMAP_DONE_PER_PAGE));
  } else if (filters.view === 'timeline') {
    let query = supabase.from('submissions').select(`${publicColumns},${filters.category === 'all' ? 'categories(name)' : 'categories!inner(name)'}`)
      .in('status', filters.stage === 'all' ? [...ROADMAP_STAGES] : [filters.stage]);
    if (filters.category !== 'all') query = query.eq('category_id', schoolCategory(filters.category)?.id || filters.category);
    if (filters.search) query = query.or(`title.ilike.%${sanitizeSearch(filters.search)}%,description.ilike.%${sanitizeSearch(filters.search)}%`);
    const { data, error } = await query.order('updated_at', { ascending: false }).order('id')
      .range((filters.page - 1) * ROADMAP_TIMELINE_PER_PAGE, filters.page * ROADMAP_TIMELINE_PER_PAGE - 1);
    if (error) throw error;
    items = (data || []).map(publicItem);
    pageCount = Math.max(1, Math.ceil(matchingCount / ROADMAP_TIMELINE_PER_PAGE));
  }
  await attachActivity(items);
  return { items, counts, totalCount, matchingCount, pageCount, perStage: ROADMAP_PER_STAGE,
    perPage: filters.view === 'done' ? ROADMAP_DONE_PER_PAGE : filters.view === 'timeline' ? ROADMAP_TIMELINE_PER_PAGE : ROADMAP_PER_STAGE,
    treeData, doneData, timelineData: doneData, workTimeline: buildWorkTimeline(items) };
}

/** Calendar geometry only; no target dates, dependencies or fabricated historic starts. */
export function buildWorkTimeline(items: Array<ReturnType<typeof publicItem>>, now = new Date()) {
  const dayMs = 86400000;
  const manilaDay = (value: string | Date) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? Math.floor((date.getTime() + 8 * 3600000) / dayMs) : null;
  };
  const today = manilaDay(now)!;
  const calendarToday = new Date(today * dayMs);
  const monthDay = (offset: number) => Date.UTC(calendarToday.getUTCFullYear(), calendarToday.getUTCMonth() + offset, 1) / dayMs;
  const dated = items.filter(item => {
    const start = manilaDay(item.started_at || '');
    const finish = manilaDay(item.resolved_at || '');
    return start !== null && start <= today && (item.status !== 'resolved' || (finish !== null && finish >= start && finish <= today));
  });
  const earliest = Math.min(monthDay(-1), ...dated.map(item => manilaDay(item.started_at!)!));
  const startDay = Math.max(monthDay(-4), Date.UTC(new Date(earliest * dayMs).getUTCFullYear(), new Date(earliest * dayMs).getUTCMonth(), 1) / dayMs);
  const endDay = monthDay(2);
  const totalDays = endDay - startDay;
  const percent = (day: number) => Math.max(0, Math.min(100, (day - startDay) / totalDays * 100));
  const months: Array<{ label: string; left: number; width: number }> = [];
  for (let date = new Date(startDay * dayMs); date.getTime() / dayMs < endDay;) {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    months.push({ label: date.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' }), left: percent(date.getTime() / dayMs), width: (next.getTime() / dayMs - date.getTime() / dayMs) / totalDays * 100 });
    date = next;
  }
  const rows = dated.map(item => {
    const actualStart = manilaDay(item.started_at!)!;
    const recordedEnd = item.status === 'resolved' ? manilaDay(item.resolved_at || '') : today;
    const actualEnd = Math.min(today, recordedEnd ?? today);
    return {
      item, left: percent(actualStart), width: Math.max(0, percent(actualEnd + 1) - percent(actualStart)),
      clipped: actualStart < startDay,
      dateLabel: `${formatManilaDate(item.started_at)} → ${item.status === 'resolved' && item.resolved_at ? (item.resolved_at_estimated ? 'around ' : '') + formatManilaDate(item.resolved_at) : 'Today'}`,
    };
  }).filter(row => manilaDay(row.item.started_at!)! <= today && (row.item.status !== 'resolved' || (manilaDay(row.item.resolved_at || '') ?? today) >= startDay));
  const plotted = new Set(rows.map(row => row.item.id));
  const undated = items.filter(item => !plotted.has(item.id)).map(item => ({ item,
    reason: !item.started_at ? item.status === 'approved' ? 'Not scheduled — a start date has not been announced.' : 'A work start date has not been recorded.' : item.status === 'resolved' && !item.resolved_at ? 'A completion date has not been recorded.' : 'Confirmed work dates are unavailable in this calendar window.',
  }));
  return { months, rows, undated, todayLeft: percent(today), minWidth: Math.max(1040, months.length * 270), totalDays,
    todayLabel: formatManilaDate(now.toISOString()), weekWidth: 7 / totalDays * 100 };
}

export function loadRecentlyCompleted(): Promise<Array<ReturnType<typeof publicItem>>> {
  return fetchWithCache('roadmap_recent',readRecentlyCompleted,15_000).catch(()=>[]);
}
async function readRecentlyCompleted(): Promise<Array<ReturnType<typeof publicItem>>> {
  const { data, error } = await supabase
    .from('submissions')
    .select(`${publicColumns},categories(name)`)
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .order('vote_count', { ascending: false })
    .limit(3);
  if (error) throw error;
  return (data || []).map(publicItem);
}

export async function loadRoadmapCategories(){return schoolCategories(true).map(c=>c.name);}

export async function loadPublicRoadmapIdea(id: string) {
  const { data, error } = await supabase.from('submissions').select(`${publicColumns},categories(name)`).eq('id', id).in('status', [...ROADMAP_STAGES]).maybeSingle();
  if (error) throw error;
  if(!data)return null;const item=publicItem(data);await attachActivity([item]);return item;
}
async function attachActivity(items:Array<ReturnType<typeof publicItem>>){
 for(let offset=0;offset<items.length;offset+=100){
  const chunk=items.slice(offset,offset+100);
  const {data,error}=await supabase.rpc('read_roadmap_activity',{p_ids:chunk.map(item=>item.id)});
  if(error)throw error;
  const records=new Map((data || []).map((row:any)=>[row.id,row]));
  for(const item of chunk){const record:any=records.get(item.id);item.last_public_update=record?.last_public_update || null;item.outcome=record?.outcome || '';}
 }
}

export function groupTreeByCategory(items: Array<ReturnType<typeof publicItem>>, allCategories: string[]) {
  const catNames = Array.from(new Set([...allCategories, ...items.map(i => i.category)])).filter(Boolean).sort();
  return catNames.map(name => {
    const catItems = items.filter(i => i.category === name);
    const completed = catItems.filter(i => i.status === 'resolved').length;
    const inProgress = catItems.filter(i => i.status === 'in_progress').length;
    const planned = catItems.filter(i => i.status === 'approved').length;
    return treeBranch(name, catItems, { total: catItems.length, completed, inProgress, planned });
  }).filter(branch => branch.total > 0);
}

function treeBranch(name: string, leaves: Array<ReturnType<typeof publicItem>>, counts: { total: number; completed: number; inProgress: number; planned: number }) {
  const denominator = counts.total || 1;
  return { name, ...counts, leaves,
    pctCompleted: Math.round(counts.completed / denominator * 100),
    pctInProgress: Math.round(counts.inProgress / denominator * 100),
    pctPlanned: Math.round(counts.planned / denominator * 100),
  };
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

