import { sanitizeSearch } from './data';
import { supabaseService } from './supabase';

export const BOARD_STAGES = [
  { status: 'pending', label: 'Needs review' },
  { status: 'approved', label: 'Planned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'resolved', label: 'Completed' },
  { status: 'rejected', label: 'Declined' },
] as const;

export type BoardStage = typeof BOARD_STAGES[number]['status'];
export type BoardPageSize = 6 | 12 | 24;
export interface BoardFilters {
  search: string;
  sort: 'oldest' | 'newest';
  pageSize: BoardPageSize;
  pages: Record<BoardStage, number>;
}
export interface BoardLane {
  status: BoardStage;
  label: string;
  count: number;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
  items: Record<string, any>[];
}

// Keep range offsets within PostgreSQL's integer range, even for malformed URLs.
const MAX_PAGE = Math.floor(2_147_483_647 / 24);
function pageNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

export function boardFilters(query: Record<string, unknown>): BoardFilters {
  const pages = Object.fromEntries(BOARD_STAGES.map(stage => [stage.status, pageNumber(query[`${stage.status}Page`])])) as Record<BoardStage, number>;
  return {
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 120) : '',
    sort: query.sort === 'newest' ? 'newest' : 'oldest',
    pageSize: query.pageSize === '12' ? 12 : query.pageSize === '24' ? 24 : 6,
    pages,
  };
}

function stageQuery(status: BoardStage, filters: BoardFilters, head = false) {
  let query = supabaseService.from('staff_submission_queue')
    .select('*', { count: 'exact', head })
    .eq('status', status);
  if (filters.search) {
    // Quoting prevents a search term from introducing another PostgREST filter.
    const search = sanitizeSearch(filters.search).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    query = query.or(`title.ilike."%${search}%",description.ilike."%${search}%"`);
  }
  return query;
}

async function loadLane(stage: typeof BOARD_STAGES[number], filters: BoardFilters): Promise<BoardLane> {
  let page = filters.pages[stage.status];
  const ascending = filters.sort === 'oldest';
  const fetchPage = (page: number) => stageQuery(stage.status, filters)
    .order('created_at', { ascending })
    .order('id', { ascending })
    .range((page - 1) * filters.pageSize, page * filters.pageSize - 1);

  const lane = (count: number, items: Record<string, any>[]): BoardLane => {
    const pageCount = Math.max(1, Math.ceil(count / filters.pageSize));
    const from = items.length ? (page - 1) * filters.pageSize + 1 : 0;
    return {
      status: stage.status, label: stage.label, count, page, pageCount,
      from, to: items.length ? Math.min(count, from + items.length - 1) : 0,
      hasPrevious: page > 1, hasNext: page < pageCount, items,
    };
  };
  // Another staff member can move/delete rows between the count and a clamped
  // re-fetch. Bound retries rather than returning inconsistent page metadata.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchPage(page);
    if (result.error?.code === 'PGRST103') {
      // PostgREST can return 416 rather than an empty stale page. Recount only
      // this lane, never the entire board, and do not re-fetch a known empty lane.
      const counted = await stageQuery(stage.status, filters, true);
      if (counted.error) throw counted.error;
      const count = counted.count ?? 0;
      if (!count) { page = 1; return lane(0, []); }
      page = Math.min(page, Math.max(1, Math.ceil(count / filters.pageSize)));
      continue;
    }
    if (result.error) throw result.error;
    const count = result.count ?? 0;
    if (!count) { page = 1; return lane(0, []); }
    const lastPage = Math.max(1, Math.ceil(count / filters.pageSize));
    if (page > lastPage) { page = lastPage; continue; }
    return lane(count, result.data ?? []);
  }
  throw new Error('The work board changed while loading. Please refresh and try again.');
}

export async function loadStaffBoard(filters: BoardFilters) {
  const lanes = await Promise.all(BOARD_STAGES.map(stage => loadLane(stage, filters)));
  const pages = Object.fromEntries(lanes.map(lane => [lane.status, lane.page])) as Record<BoardStage, number>;
  return {
    items: lanes.flatMap(lane => lane.items),
    lanes,
    filters: { ...filters, pages },
    totalCount: lanes.reduce((total, lane) => total + lane.count, 0),
  };
}
