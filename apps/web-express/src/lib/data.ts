import { supabase, supabaseService } from "./supabase";
import type { Submission, Comment, Profile } from "../types";

export const DEFAULT_CATEGORIES = ["Facilities", "Learning", "Safety", "Student life", "Other"] as const;
export const PER_PAGE = 15;

export type Category = (typeof DEFAULT_CATEGORIES)[number] | "All";
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
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return undefined; }
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
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(prefix: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000
): Promise<T> {
  const cached = getCache<T>(key);
  if (cached !== undefined) return cached;
  const value = await fetcher();
  setCache(key, value, ttlMs);
  return value;
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
let _categoryIdMap: Map<string, string> | null = null;

export async function getCategoryIdMap(): Promise<Map<string, string>> {
  if (_categoryIdMap) return _categoryIdMap;
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name")
      .eq("is_active", true);
    if (error) throw error;
    const map = new Map<string, string>();
    (data ?? []).forEach((c: { id: string; name: string }) => {
      map.set(c.name, c.id);
      map.set(c.name.toLowerCase(), c.id);
    });
    _categoryIdMap = map;
    return _categoryIdMap;
  } catch (err) {
    console.error("Failed to fetch categories:", err);
    return new Map();
  }
}

/* ─── Select fragments ─────────────────────────────────────────────────── */
const SUBMISSION_SELECT =
  "id,title,description,status,vote_count,comment_count,created_at,updated_at," +
  "user_id,category_id," +
  "categories(name),author:profiles!submissions_user_id_fkey(id,display_name,role)";

/* ─── Published feed ──────────────────────────────────────────────────── */
export async function loadPublishedSubmissions(opts: {
  page?: number;
  sortBy?: SortMode;
  category?: string;
  search?: string;
} = {}) {
  const { page = 1, sortBy = "all", category = "All", search = "" } = opts;

  const normalizedSort: "all" | "top" | "oldest" =
    sortBy === "top" || sortBy === "popular"
      ? "top"
      : sortBy === "oldest"
      ? "oldest"
      : "all";

  const cacheKey = `feed_${normalizedSort}_${category}_${search}_p${page}`;
  const cached = getCache<{ data: Submission[]; count: number; hasMore: boolean }>(cacheKey);
  if (cached) return cached;

  let query = supabase
    .from("submissions")
    .select(SUBMISSION_SELECT, { count: "exact" })
    .in("status", ["approved", "in_progress", "resolved"]);

  // Category filter: resolve name → UUID for reliable matching
  if (category && category !== "All") {
    const idMap = await getCategoryIdMap();
    const catId = idMap.get(category) ?? idMap.get(category.toLowerCase());
    if (catId) {
      query = query.eq("category_id", catId);
    } else {
      // Fallback to join filter if UUID resolution fails
      query = (query as any).eq("categories.name", category);
    }
  }

  // Sanitized search
  if (search && search.trim()) {
    const safe = sanitizeSearch(search);
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  if (normalizedSort === "top") {
    query = query.order("vote_count", { ascending: false }).order("created_at", { ascending: false });
  } else if (normalizedSort === "oldest") {
    query = query.order("created_at", { ascending: true });
  } else {
    // "all" / "latest": all published community ideas sorted newest first
    query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * PER_PAGE;
  query = query.range(from, from + PER_PAGE - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const result = {
    data: (data ?? []) as unknown as Submission[],
    count: count ?? 0,
    hasMore: (count ?? 0) > page * PER_PAGE,
  };

  // Cache 30s for first page (hot path), 2min for deeper pages
  setCache(cacheKey, result, page === 1 ? 30_000 : 120_000);
  return result;
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
        .select("*, author:profiles!comments_user_id_fkey(id,display_name,role)")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Comment[];
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
        // Match Next.js: only in_progress and resolved on the roadmap
        .in("status", ["in_progress", "resolved"])
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
    .select(`submission_id, submission:submissions(${SUBMISSION_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []).map((b: any) => b.submission).filter(Boolean)) as unknown as Submission[];
}

/* ─── Admin ────────────────────────────────────────────────────────────── */
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
    .select(SUBMISSION_SELECT, { count: "exact" });

  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    const safe = sanitizeSearch(search);
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  query = query.order("created_at", { ascending: false });

  const from = (page - 1) * PER_PAGE;
  query = query.range(from, from + PER_PAGE - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as unknown as Submission[], count: count ?? 0 };
}

/* ─── Tracking ─────────────────────────────────────────────────────────── */
export async function lookupTrackingCode(code: string) {
  const url = `${process.env.SUPABASE_URL}/functions/v1/lookup-by-tracking-code`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ trackingCode: code.trim().toUpperCase() }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error || "Idea not found");
  return data;
}
