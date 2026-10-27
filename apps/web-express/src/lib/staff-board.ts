import { requireSchool } from './school-scope';
import { searchOrFilter } from './data';
import { supabaseService } from './supabase';

export const BOARD_STAGES = [
  { status: 'pending', label: 'Needs review' },
  { status: 'approved', label: 'Planned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'resolved', label: 'Completed' },
  { status: 'rejected', label: 'Declined' },
] as const;

export type BoardStage = typeof BOARD_STAGES[number]['status'];
export const WORK_STAGES = BOARD_STAGES.filter(stage => !['pending','rejected'].includes(stage.status));
export const BOARD_WINDOW_LIMIT = 72;
export type BoardPageSize = 6 | 12 | 24;
export interface BoardFilters {
  assignment?:'all'|'mine'|'team'|'unassigned';
  priority?:string;
  overdue?:boolean;
  search: string;
  sort: 'oldest' | 'newest';
  pageSize: BoardPageSize;
  pages: Record<BoardStage, number>;
  windows?: Partial<Record<BoardStage,number>>;
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
  nextPage:number;
  windowSize:number;
  items: Record<string, any>[];
}

// Keep range offsets within PostgreSQL's integer range, even for malformed URLs.
const MAX_PAGE = Math.floor((2_147_483_647 - BOARD_WINDOW_LIMIT) / 24);
function pageNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

export function boardFilters(query: Record<string, unknown>): BoardFilters {
  const pages = Object.fromEntries(BOARD_STAGES.map(stage => [stage.status, pageNumber(query[`${stage.status}Page`])])) as Record<BoardStage, number>;
  const pageSize:BoardPageSize=query.pageSize==='12'?12:query.pageSize==='24'?24:6;
  const windows=Object.fromEntries(BOARD_STAGES.flatMap(({status})=>{const value=query[status+'Loaded'];return typeof value==='string'&&/^\d{1,3}$/.test(value)&&Number(value)>pageSize?[[status,Math.min(BOARD_WINDOW_LIMIT,Math.ceil(Number(value)/pageSize)*pageSize)]]:[];}));
  return {
    ...(Object.keys(windows).length?{windows}:{}),
    assignment:query.assignment==='mine'||query.assignment==='team'||query.assignment==='unassigned'?query.assignment:'all',
    priority:['low','normal','high','urgent'].includes(String(query.priority))?String(query.priority):'all',
    overdue:query.overdue==='true',
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 120) : '',
    sort: query.sort === 'newest' ? 'newest' : 'oldest',
    pageSize,
    pages,
  };
}

function boardQuery(filters: BoardFilters, head = false) {
  let query = supabaseService.from('staff_work_queue')
    .select('*', { count: 'exact', head });
  if(filters.assignment==='mine')query=query.eq('assignee_id',requireSchool().actorId);
  if(filters.assignment==='team')query=query.contains('team_staff_ids',[requireSchool().actorId]);
  if(filters.assignment==='unassigned')query=query.is('assignee_id',null);
  if(filters.priority&&filters.priority!=='all')query=query.eq('priority',filters.priority);
  if(filters.overdue){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());query=query.lt('target_date',today).neq('status','resolved');}
  if (filters.search) {
    query = query.or(searchOrFilter(filters.search));
  }
  return query;
}

function stageQuery(status:BoardStage,filters:BoardFilters,head=false){return boardQuery(filters,head).eq('status',status);}

async function loadLane(stage: typeof BOARD_STAGES[number], filters: BoardFilters): Promise<BoardLane> {
  let page = filters.pages[stage.status];
  const ascending = filters.sort === 'oldest';
  const windowSize=Math.min(BOARD_WINDOW_LIMIT,Math.max(filters.pageSize,filters.windows?.[stage.status]||filters.pageSize));
  const fetchPage = (page: number) => stageQuery(stage.status, filters)
    .order('created_at', { ascending })
    .order('id', { ascending })
    .range((page - 1) * filters.pageSize, (page-1)*filters.pageSize+windowSize-1);

  const lane = (count: number, items: Record<string, any>[]): BoardLane => {
    const pageCount = Math.max(1, Math.ceil(count / filters.pageSize));
    const from = items.length ? (page - 1) * filters.pageSize + 1 : 0;
    return {
      status: stage.status, label: stage.label, count, page, pageCount,
      from, to: items.length ? Math.min(count, from + items.length - 1) : 0,
      hasPrevious: page > 1, hasNext: items.length>0&&from+items.length-1<count, nextPage:Math.ceil((from+items.length-1)/filters.pageSize)+1,windowSize,items,
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

export async function loadStaffBoard(filters: BoardFilters, stages: ReadonlyArray<typeof BOARD_STAGES[number]> = BOARD_STAGES) {
  const lanes = await Promise.all(stages.map(stage => loadLane(stage, filters)));
  const pages = Object.fromEntries(lanes.map(lane => [lane.status, lane.page])) as Record<BoardStage, number>;
  return {
    windowLimit: BOARD_WINDOW_LIMIT,
    items: lanes.flatMap(lane => lane.items),
    lanes,
    filters: { ...filters, pages },
    totalCount: lanes.reduce((total, lane) => total + lane.count, 0),
  };
}

/** Calendar dates are school target dates; actual work dates remain in progress history. */
export async function loadStaffCalendar(filters:BoardFilters,input:Record<string,unknown>){
 const fallback=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
 const month=typeof input.month==='string'&&/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(input.month)?input.month:fallback;
 const [year,number]=month.split('-').map(Number),start=month+'-01',next=new Date(Date.UTC(year,number,1)).toISOString().slice(0,10);
 let page=pageNumber(input.calendarPage);page=Math.min(page,100000);
 for(let attempt=0;attempt<3;attempt++){
  const result=await boardQuery(filters).in('status',WORK_STAGES.map(stage=>stage.status)).gte('target_date',start).lt('target_date',next).order('target_date').order('id').range((page-1)*100,page*100-1);
  if(result.error&&result.error.code!=='PGRST103')throw result.error;
  let total=result.count;
  if(result.error){const count=await boardQuery(filters,true).in('status',WORK_STAGES.map(stage=>stage.status)).gte('target_date',start).lt('target_date',next);if(count.error)throw count.error;total=count.count;}
  const pages=Math.max(1,Math.ceil((total||0)/100));if(page>pages){page=pages;continue;}
  return {month,items:result.data||[],total:total||0,page,pages,year,monthNumber:number};
 }
 throw new Error('Scheduled work changed while loading. Please refresh the calendar.');
}
