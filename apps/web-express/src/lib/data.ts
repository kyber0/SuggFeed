import {schoolCategories,schoolFeature} from './school-customization';
import { schoolCacheKey } from './school-scope';
import { supabase, supabaseService } from "./supabase";
import type { Submission, Comment, Profile } from "../types";

export const DEFAULT_CATEGORIES = ["Facilities", "Learning", "Safety", "Student life", "Other"] as const;
export const PER_PAGE = 15;

export type Category = string;
export type SortMode = "latest" | "all" | "top" | "popular" | "oldest";

/* ─── Simple in-memory TTL cache with bounded size ────────────────────── */
interface CacheEntry<T> { value: T; expiresAt: number }
const MAX_CACHE_ENTRIES = 500;
const _cache = new Map<string, CacheEntry<unknown>>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of _cache.entries()) {
    if (now > entry.expiresAt) {
      _cache.delete(key);
    }
  }
}

export function getCache<T>(key: string): T | undefined {
  const entry = _cache.get(schoolCacheKey(key)) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _cache.delete(schoolCacheKey(key)); return undefined; }
  return entry.value;
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  if (_cache.size >= MAX_CACHE_ENTRIES) {
    evictExpired();
    while (_cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = _cache.keys().next().value;
      if (oldestKey !== undefined) _cache.delete(oldestKey);
      else break;
    }
  }
  _cache.set(schoolCacheKey(key), { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(prefix: string): void {
  prefix=schoolCacheKey(prefix);
  for(const key of inFlight.keys())if(key.startsWith(prefix))inFlight.delete(key);
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export function publishedTotalMaxAge(category='All',search=''){
  const entry=_cache.get(schoolCacheKey(`published_count_${JSON.stringify([category,search.trim()])}`));
  return entry?Math.max(0,Math.floor((entry.expiresAt-Date.now())/1000)):0;
}

export type CacheStatus = "hit" | "pending" | "miss";
const inFlight=new Map<string,Promise<unknown>>();
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000,
  report?: (status:CacheStatus)=>void
): Promise<T> {
  const cached = getCache<T>(key);
  if (cached !== undefined) {report?.("hit");return cached;}
  const running=inFlight.get(schoolCacheKey(key));if(running){report?.("pending");return running as Promise<T>;}
  report?.("miss");
  if(inFlight.size>=MAX_CACHE_ENTRIES)return fetcher();
  const request=fetcher().then(value=>{if(inFlight.get(schoolCacheKey(key))===request)setCache(key,value,ttlMs);return value;});
  inFlight.set(schoolCacheKey(key),request);
  try{return await request;}finally{if(inFlight.get(schoolCacheKey(key))===request)inFlight.delete(schoolCacheKey(key));}
}

/* ─── Search sanitization ──────────────────────────────────────────────── */
/**
 * Escapes PostgREST ilike metacharacters.
 * Mirrors sanitizeSearchTerm() in apps/web/lib/feedback-api.ts.
 */
export function sanitizeSearch(term: string): string {
  return term
    .trim()
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/,/g, "\\,")
    .replace(/\./g, "\\.");
}

/* ─── Category ID cache ────────────────────────────────────────────────── */
export function getCategoryIdMap(): Promise<Map<string, string>> {
  return fetchWithCache('categories_ids',async()=>{
    const data=schoolCategories(true);
    const map=new Map<string,string>();
    for(const category of data ?? []){
      map.set(category.id,category.id);
      map.set(category.slug,category.id);
      map.set(category.name,category.id);
      map.set(category.name.toLowerCase(),category.id);
    }
    return map;
  },300_000).catch(()=>new Map());
}

/* ─── Select fragments ─────────────────────────────────────────────────── */
const SUBMISSION_SELECT =
  "id,title,description,status,vote_count,comment_count,created_at,updated_at," +
  "user_id,category_id," +
  "categories(name),author:profiles!submissions_user_id_fkey(id,display_name,role)";

/** Public scalar count only; pagination never depends on this cached value. */
export function loadPublishedTotal(category='All',search='',report?:(status:CacheStatus)=>void){
  const term=search.trim();
  return fetchWithCache(`published_count_${JSON.stringify([category,term])}`,async()=>{
    const filtered=!!category && category!=='All';
    const ids=filtered?await getCategoryIdMap():null;
    const id=ids?.get(category) ?? ids?.get(category.toLowerCase());
    let query=supabase.from('submissions').select(filtered && !id?'id,categories!inner(name)':'id',{count:'exact',head:true})
      .in('status',['approved','in_progress','resolved']);
    if(filtered)query=id?query.eq('category_id',id):query.eq('categories.name',category);
    if(term){const safe=sanitizeSearch(term);query=query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);}
    const {count,error}=await query;
    if(error)throw error;
    return count ?? 0;
  },30_000,report);
}

/* ─── Published feed ──────────────────────────────────────────────────── */
export async function loadPublishedSubmissions(opts: {
  page?: number;
  sortBy?: SortMode;
  category?: string;
  search?: string;
  followingUserId?: string;
  reportCache?: (status:CacheStatus)=>void;
  includeTotal?: boolean;
} = {}) {
  const { page = 1, sortBy = "all", category = "All", search = "", followingUserId } = opts;

  const normalizedSort: "all" | "top" | "oldest" =
    (sortBy === "top" || sortBy === "popular") && schoolFeature('voting')
      ? "top"
      : sortBy === "oldest"
      ? "oldest"
      : "all";

  const filteredCategory=!!category && category !== 'All';
  const term=search.trim();
  // Share category resolution between rows and totals on a cold cache miss.
  let categoryLookup:Promise<string | undefined> | undefined;
  const categoryId=()=>{
    if(!filteredCategory)return Promise.resolve(undefined);
    if(!categoryLookup)categoryLookup=getCategoryIdMap().then(map=>map.get(category) ?? map.get(category.toLowerCase()));
    return categoryLookup;
  };
  const applyFilters=(query:any,catId:string | undefined)=>{
    query=query.eq('safety_state','clear').in('status',['approved','in_progress','resolved']);
    if(followingUserId)query=query.eq('idea_follows.user_id',followingUserId);
    if(filteredCategory)query=catId?query.eq('category_id',catId):query.eq('categories.name',category);
    if(term){const safe=sanitizeSearch(term);query=query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);}
    return query;
  };
  const readRows=async()=>{
    const catId=await categoryId();
    const columns=filteredCategory && !catId?SUBMISSION_SELECT.replace('categories(name)','categories!inner(name)'):SUBMISSION_SELECT;
    let query=applyFilters((followingUserId?supabaseService:supabase).from('submissions')
      .select(columns+(followingUserId?',idea_follows!inner(user_id)':''),followingUserId?{count:'exact'}:undefined),catId);
    if(normalizedSort==='top')query=query.order('vote_count',{ascending:false}).order('created_at',{ascending:false});
    else query=query.order('created_at',{ascending:normalizedSort==='oldest'});
    query=query.order('id',{ascending:true});
    const from=(page-1)*PER_PAGE;
    // A public feed needs one extra row to know whether another page exists;
    // that decision must not depend on a briefly cached exact total.
    const {data,error,count}=await query.range(from,from+PER_PAGE-(followingUserId?1:0));
    if(error)throw error;
    const rows=(data || []).map(({idea_follows,...row}:any)=>row) as Submission[];
    return {data:rows.slice(0,PER_PAGE),count:count ?? 0,
      hasMore:followingUserId?(count ?? 0)>page*PER_PAGE:rows.length>PER_PAGE};
  };
  // Following queries are account-specific and retain their fresh exact count.
  if(followingUserId)return readRows();

  let rowsStatus:CacheStatus | undefined,totalStatus:CacheStatus | undefined;
  const report=()=>{
    if(!rowsStatus)return;
    if(opts.includeTotal===false){opts.reportCache?.(rowsStatus);return;}
    if(!totalStatus)return;
    opts.reportCache?.(rowsStatus==='miss' || totalStatus==='miss'?'miss':rowsStatus==='pending' || totalStatus==='pending'?'pending':'hit');
  };
  const rowsPending=fetchWithCache(`feed_${JSON.stringify([normalizedSort,category,term,page])}`,readRows,page===1?30_000:120_000,
    status=>{rowsStatus=status;report();});
  if(opts.includeTotal===false){
    const rows=await rowsPending;
    return {...rows,count:getCache<number>(`published_count_${JSON.stringify([category,term])}`) ?? null};
  }
  const [rows,count]=await Promise.all([rowsPending,loadPublishedTotal(category,term,status=>{totalStatus=status;report();})]);
  return {...rows,count};
}

/* ─── Single submission ───────────────────────────────────────────────── */
export async function loadSingleSubmission(id: string): Promise<Submission | null> {
  return fetchWithCache(
    `submission_${id}`,
    async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select(SUBMISSION_SELECT)
        .eq("id", id)
        .single();
      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data as unknown as Submission;
    },
    5 * 60_000 // 5 min
  );
}

/* ─── Comments ────────────────────────────────────────────────────────── */
export async function loadComments(submissionId: string): Promise<Comment[]> {
  return fetchWithCache(
    `comments_${submissionId}`,
    async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id,submission_id,user_id,body,display_name,created_at,parent_id,version,text_revision,author:profiles!comments_user_id_fkey(id,display_name),submission:submissions!inner(status)")
        .eq("is_hidden",false).in("submission.status",["approved","in_progress","resolved"])
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids=new Set((data||[]).map(c=>c.id));
      return (data||[]).map(c=>({...c,parent_id:c.parent_id&&ids.has(c.parent_id)?c.parent_id:null})) as unknown as Comment[];
    },
    60_000 // 1 min
  );
}

/* ─── Roadmap ─────────────────────────────────────────────────────────── */
export async function loadRoadmapSubmissions(): Promise<Submission[]> {
  return fetchWithCache(
    "roadmap_submissions",
    async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select(SUBMISSION_SELECT)
        .in("status", ["approved", "in_progress", "resolved"])
        .order("vote_count", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Submission[];
    },
    3 * 60_000 // 3 min
  );
}

/* ─── Profile / User ──────────────────────────────────────────────────── */
export async function loadUserProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseService
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as Profile;
}

export async function loadUserSubmissions(userId: string): Promise<Submission[]> {
  const { data, error } = await supabaseService
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Submission[];
}

export async function loadUserBookmarks(userId: string): Promise<Submission[]> {
  const { data, error } = await supabaseService
    .from("bookmarks")
    .select(`submission_id, submission:submissions!inner(${SUBMISSION_SELECT})`).eq('submission.safety_state','clear')
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []).map((b: any) => b.submission).filter(Boolean)) as unknown as Submission[];
}

/* ─── Admin ────────────────────────────────────────────────────────────── */
export const MODERATION_STATUSES = ["pending", "approved", "in_progress", "resolved", "rejected"] as const;

export async function loadModerationCounts(): Promise<Record<string, number>> {
  const entries = await Promise.all(MODERATION_STATUSES.map(async (status) => {
    const { count, error } = await supabaseService.from("submissions")
      .select("id", { count: "exact", head: true }).eq("safety_state","clear").eq("status", status);
    if (error) throw error;
    return [status, count ?? 0] as const;
  }));
  return Object.fromEntries([...entries, ["all", entries.reduce((sum, [, count]) => sum + count, 0)]]);
}

export async function loadPendingSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabaseService
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Submission[];
}

export async function loadAllSubmissionsForAdmin(opts: {
  page?: number;
  status?: string;
  search?: string;
} = {}) {
  const { page = 1, status = "all", search = "" } = opts;

  let query = supabaseService
    .from("submissions")
    .select(`${SUBMISSION_SELECT},staff_note`, { count: "exact" });

  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    const safe = sanitizeSearch(search);
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  query = query.order("created_at", { ascending: status === "pending" }).order("id");

  const from = (page - 1) * PER_PAGE;
  query = query.range(from, from + PER_PAGE - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as unknown as Submission[], count: count ?? 0 };
}

import { createHash } from "node:crypto";

/* ─── Tracking ─────────────────────────────────────────────────────────── */
export async function lookupTrackingCode(code: string) {
  const clean=code.trim().toUpperCase();
  if(!/^CV-[A-F0-9]{32}$/.test(clean)) throw new Error('A full private tracking code is required.');
  const hashes=[clean,clean.slice(3)].map(value=>createHash('sha256').update(value).digest('hex'));
  const {data,error}=await supabaseService.from('submissions')
    .select('id,title,description,status,created_at,categories(name),status_history(new_status,created_at)')
    .in('anonymous_tracking_hash',hashes).maybeSingle();
  if(error) throw new Error('Tracking is temporarily unavailable.');
  if(!data)return null;
  return {id:data.id,title:data.title,description:data.description,status:data.status,createdAt:data.created_at,
    category:(data.categories as any)?.name || 'General',
    timeline:[...((data.status_history as any[]) || [])].map(row=>({new_status:row.new_status,created_at:row.created_at})).sort((a,b)=>a.created_at.localeCompare(b.created_at))};
}
