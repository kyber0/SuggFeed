import { supabase } from "./supabase";
import { fetchWithCache, invalidateCache } from "./cache-manager";

export type AttachmentPayload = { name: string; type: string; base64: string };
export type SubmitPayload = { title: string; description: string; category: string; isAnonymous: boolean; consent: true; turnstileToken: string; attachments: AttachmentPayload[]; deviceFingerprint?: string };
export type AttachmentFile = { id: string; mime_type: string; size_bytes: number; url: string | null; name: string };
export type PublishedSubmission = {
  id: string;
  title: string;
  description: string;
  status: "approved" | "in_progress" | "resolved" | "pending";
  vote_count: number;
  created_at: string;
  user_id?: string | null;
  author?: { display_name: string | null } | null;
  categories: { name: string } | null;
  attachments: { id: string }[];
  comments?: { count: number }[];
  comment_count?: number;
};
export type Comment = {
  id: string;
  submission_id: string;
  body: string;
  display_name: string | null;
  created_at: string;
  parent_id?: string | null;
  is_pinned?: boolean;
  is_hidden?: boolean;
  report_count?: number;
  user_id?: string | null;
};

export const DEFAULT_CATEGORIES = [
  "Facilities",
  "Learning",
  "Safety",
  "Student life",
  "Other",
] as const;

/** In-memory map of category name → UUID, populated on first call */
let _categoryIdMap: Map<string, string> | null = null;

/**
 * Returns a map of { [categoryName]: uuid }.
 * Cached in-memory for the lifetime of the page — never re-fetches.
 */
export async function getCategoryIdMap(): Promise<Map<string, string>> {
  if (_categoryIdMap) return _categoryIdMap;
  try {
    const { data } = await supabase
      .from("categories")
      .select("id,name")
      .eq("is_active", true);
    _categoryIdMap = new Map((data ?? []).map((c: { id: string; name: string }) => [c.name, c.id]));
  } catch {
    _categoryIdMap = new Map();
  }
  return _categoryIdMap;
}

export async function loadCategories(): Promise<string[]> {
  return fetchWithCache(
    "categories",
    async () => {
      try {
        const map = await getCategoryIdMap();
        const names = Array.from(map.keys()).sort();
        if (names.length === 0) return [...DEFAULT_CATEGORIES];
        return names;
      } catch {
        return [...DEFAULT_CATEGORIES];
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );
}

function functionUrl(name: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase is not configured in apps/web/.env.local");
  return `${url}/functions/v1/${name}`;
}

async function invoke<T>(name: string, payload: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  // Supabase Edge Function Gateway requires a Bearer token.
  // Use the user's access token when authenticated, fall back to the anon key for guests.
  const authToken = session?.access_token ?? anonKey;
  const response = await fetch(functionUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result as T;
}

export async function submitFeedback(payload: SubmitPayload) {
  const res = await invoke<{ trackingCode: string | null }>("submit-feedback", payload);
  invalidateCache("feed_");
  invalidateCache("roadmap_");
  return res;
}

export type TrackingResult = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  timeline: { new_status: string; note: string | null; created_at: string }[];
};

export function lookupTrackingCode(trackingCode: string) {
  return invoke<TrackingResult>("lookup-by-tracking-code", { trackingCode });
}

/**
 * Sanitize a user-supplied search string before interpolating it into a
 * PostgREST `.or()` filter string.  Characters that have special meaning in
 * PostgREST filter syntax (parentheses delimit nested filters, commas separate
 * filter items, dots separate column/operator/value) must be escaped so they
 * are treated as literal text by the ilike operator.
 *
 * The ilike wildcards % and _ are also escaped so a user cannot craft
 * arbitrary prefix/suffix patterns beyond the ones we intentionally add.
 */
function sanitizeSearchTerm(term: string): string {
  return term
    .trim()
    // Escape ilike pattern metacharacters first
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    // Escape PostgREST filter-string metacharacters
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/,/g, "\\,")
    .replace(/\./g, "\\.");
}

/**
 * Slimmed select for the feed list view — omits `description` (not shown on cards)
 * and heavy join data. Description is loaded on demand when the detail panel opens.
 * This reduces per-page payload by ~60%.
 */
const FEED_LIST_SELECT =
  "id,title,status,vote_count,created_at,user_id,category_id," +
  "categories(name),attachments(id),comments(count)";

export async function loadPublishedSubmissions(
  sortBy: "popular" | "newest" | "oldest" = "popular",
  offset = 0,
  limit = 18,
  /** Server-side category filter — uses UUID for correctness on all devices */
  category?: string,
  /** Server-side full-text search — works across entire dataset, not just loaded page */
  search?: string,
) {
  const fetcher = async () => {
    // Resolve category name → UUID (fixes broken filter on fresh devices/browsers)
    let categoryId: string | undefined;
    if (category && category !== "All") {
      const idMap = await getCategoryIdMap();
      categoryId = idMap.get(category);
    }

    let query = supabase
      .from("submissions")
      // count:planned uses the query planner's row estimate — much faster than count:exact
      .select(FEED_LIST_SELECT, { count: "planned" })
      .in("status", ["approved", "in_progress", "resolved"]);

    // Filter by UUID — works correctly on every browser, not just ones with cached joins
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    // Server-side search via ilike — OR across title and description.
    if (search && search.trim()) {
      const safe = sanitizeSearchTerm(search);
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    if (sortBy === "popular") {
      query = query.order("vote_count", { ascending: false }).order("created_at", { ascending: false });
    } else if (sortBy === "newest") {
      query = query.order("created_at", { ascending: false });
    } else if (sortBy === "oldest") {
      query = query.order("created_at", { ascending: true });
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;
    const submissions = (data ?? []).map((item: any) => ({
      ...item,
      comment_count: item.comments?.[0]?.count ?? 0,
    }));
    return { submissions: submissions as PublishedSubmission[], count: count ?? 0 };
  };

  const cacheKey = `feed_${sortBy}_${category || "All"}_${search ? search.trim().toLowerCase() : ""}_${limit}_${offset}`;
  const { getCacheItem, setCacheItem } = await import("./cache-manager");

  // For paginated pages (offset > 0), check cache first for instant infinite scroll
  if (offset > 0) {
    const cached = getCacheItem<{ submissions: PublishedSubmission[]; count: number }>(cacheKey);
    if (cached && !cached.isStale) {
      return cached.data;
    }
  }

  // Fetch fresh data from network so new/incoming ideas are never blocked or overwritten by stale cache
  const fresh = await fetcher();
  setCacheItem(cacheKey, fresh, { ttlMs: 30 * 1000 }); // Short 30s TTL for prefetch cache
  return fresh;
}

/**
 * Prefetches the next page of the feed into cache without blocking the UI.
 * Call this when the user is ~60% scrolled through the current page.
 */
export function prefetchNextPage(
  sortBy: "popular" | "newest" | "oldest",
  nextOffset: number,
  limit: number,
  category?: string,
  search?: string,
): void {
  // Fire and forget — the result lands in cache, next page renders instantly
  loadPublishedSubmissions(sortBy, nextOffset, limit, category, search).catch(() => {});
}

export async function loadRoadmapSubmissions(): Promise<PublishedSubmission[]> {
  return fetchWithCache(
    "roadmap_submissions",
    async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("id,title,description,status,vote_count,created_at,user_id,category_id,categories(name),attachments(id),comments(count),author:profiles!submissions_user_id_fkey(display_name)")
        .in("status", ["in_progress", "resolved"])
        .order("vote_count", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []).map((item: any) => ({
        ...item,
        comment_count: item.comments?.[0]?.count ?? 0,
      })) as PublishedSubmission[];
    },
    { ttlMs: 3 * 60 * 1000 }
  );
}

export async function loadMyActivity(anonToken?: string, trackingCodes?: string[], deviceFingerprint?: string) {
  return invoke<{
    submissions: PublishedSubmission[];
    votedSubmissions: PublishedSubmission[];
    bookmarkedSubmissions?: PublishedSubmission[];
    sharedSubmissions?: PublishedSubmission[];
  }>(
    "my-activity",
    { anonToken, trackingCodes, deviceFingerprint }
  );
}

export async function loadSingleSubmission(id: string): Promise<PublishedSubmission | null> {
  return fetchWithCache(
    `submission_${id}`,
    async () => {
      // Full select including description for the detail panel
      const { data, error } = await supabase
        .from("submissions")
        .select("id,title,description,status,vote_count,created_at,user_id,category_id,categories(name),attachments(id),comments(count),author:profiles!submissions_user_id_fkey(display_name)")
        .eq("id", id)
        .in("status", ["approved", "in_progress", "resolved", "pending"])
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return {
        ...(data as any),
        comment_count: (data as any).comments?.[0]?.count ?? 0,
      } as PublishedSubmission;
    },
    { ttlMs: 5 * 60 * 1000 }
  );
}

/**
 * Prefetches a single submission into cache on card hover.
 * The detail panel will open instantly when clicked.
 */
export function prefetchSingleSubmission(id: string): void {
  loadSingleSubmission(id).catch(() => {});
}

export async function loadAuthorPendingSubmissions(
  userId?: string,
  trackingCodes: string[] = [],
  deviceFingerprint?: string
): Promise<PublishedSubmission[]> {
  const pendingMap = new Map<string, PublishedSubmission>();

  // 1. If user is authenticated, query their pending submissions directly from Supabase
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select(
          "id,title,description,status,vote_count,created_at,user_id,categories(name),attachments(id),comments(count),author:profiles!submissions_user_id_fkey(display_name)"
        )
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!error && data) {
        data.forEach((item: any) => {
          pendingMap.set(item.id, {
            ...item,
            comment_count: item.comments?.[0]?.count ?? 0,
          } as PublishedSubmission);
        });
      }
    } catch (e) {
      console.error("Failed to load user pending submissions", e);
    }
  }

  // 2. If anonymous tracking codes or device fingerprint are provided, also query via my-activity
  if (trackingCodes.length > 0 || deviceFingerprint) {
    try {
      const { getAnonToken } = await import("./anon-token");
      const activity = await loadMyActivity(getAnonToken(), trackingCodes, deviceFingerprint);
      if (activity?.submissions) {
        activity.submissions
          .filter((s) => s.status === "pending")
          .forEach((s) => {
            if (!pendingMap.has(s.id)) {
              pendingMap.set(s.id, {
                ...s,
                comment_count: s.comment_count ?? 0,
              });
            }
          });
      }
    } catch (e) {
      console.error("Failed to load anonymous pending submissions", e);
    }
  }

  return Array.from(pendingMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function loadSubmissionsByIds(ids: string[]): Promise<PublishedSubmission[]> {
  if (!ids || ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("id,title,description,status,vote_count,created_at,user_id,categories(name),attachments(id),comments(count),author:profiles!submissions_user_id_fkey(display_name)")
    .in("id", uniqueIds)
    .in("status", ["approved", "in_progress", "resolved"]);

  if (error) throw error;
  const map = new Map<string, PublishedSubmission>();
  (data ?? []).forEach((item: any) => {
    map.set(item.id, {
      ...item,
      comment_count: item.comments?.[0]?.count ?? 0,
    } as PublishedSubmission);
  });
  // Maintain the caller's ID order (e.g. most recently bookmarked/shared first)
  const ordered: PublishedSubmission[] = [];
  for (const id of uniqueIds) {
    const found = map.get(id);
    if (found) ordered.push(found);
  }
  return ordered;
}

export async function loadAttachments(submissionId: string): Promise<AttachmentFile[]> {
  const result = await invoke<{ files: AttachmentFile[] }>("get-attachments", { submissionId });
  return result.files ?? [];
}

export async function voteSubmission(
  submissionId: string,
  anonToken: string,
  deviceFingerprint?: string,
  action?: "vote" | "unvote" | "toggle"
) {
  const result = await invoke<{ voteCount: number; voted: boolean }>("vote-submission", {
    submissionId,
    anonToken,
    deviceFingerprint,
    action,
  });
  // NOTE: Do NOT invalidate feed_ cache here. The optimistic update in use-voting.ts
  // already handles the UI count, and the server-returned voteCount patches it correctly.
  // Blowing the cache causes a stale re-fetch race that makes vote_count appear to reset.
  // Only invalidate the per-submission detail cache (used by the drawer/detail panel).
  invalidateCache(`submission_${submissionId}`);
  return result;
}

export async function loadComments(submissionId: string): Promise<Comment[]> {
  return fetchWithCache(
    `comments_${submissionId}`,
    async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id,submission_id,body,display_name,created_at,parent_id,is_pinned,is_hidden,report_count,user_id")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
    { ttlMs: 60 * 1000 }
  );
}

export async function addComment(payload: {
  submissionId: string;
  body: string;
  displayName?: string;
  anonToken?: string;
  turnstileToken: string;
  parentId?: string;
}) {
  const result = await invoke<{ comment: Comment }>("add-comment", {
    submissionId:   payload.submissionId,
    body:           payload.body,
    displayName:    payload.displayName || undefined,
    anonToken:      payload.anonToken,
    turnstileToken: payload.turnstileToken,
    parentId:       payload.parentId || undefined,
  });
  invalidateCache(`comments_${payload.submissionId}`);
  invalidateCache(`submission_${payload.submissionId}`);
  invalidateCache("feed_");
  return result;
}

export async function loadUserBookmarkIds(): Promise<string[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];
  const { data, error } = await supabase
    .from("bookmarks")
    .select("submission_id")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load user bookmarks", error);
    return [];
  }
  return (data ?? []).map((row: any) => row.submission_id);
}

export async function toggleUserBookmark(submissionId: string, shouldBookmark: boolean): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Authentication required");

  if (shouldBookmark) {
    const { error } = await supabase
      .from("bookmarks")
      .upsert({ user_id: session.user.id, submission_id: submissionId }, { onConflict: "user_id,submission_id" });
    if (error) throw error;
    return true;
  } else {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .match({ user_id: session.user.id, submission_id: submissionId });
    if (error) throw error;
    return false;
  }
}

export async function recordUserShare(submissionId: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const { error } = await supabase
    .from("shared_posts")
    .upsert({ user_id: session.user.id, submission_id: submissionId }, { onConflict: "user_id,submission_id" });
  if (error) {
    console.error("Failed to record share", error);
    return false;
  }
  return true;
}

export async function loadUserSharedIds(): Promise<string[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return [];
  const { data, error } = await supabase
    .from("shared_posts")
    .select("submission_id")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Failed to load shared posts", error);
    return [];
  }
  return (data ?? []).map((row: any) => row.submission_id);
}

export async function reportSubmission(submissionId: string, reason = "inappropriate") {
  const { data, error } = await supabase.rpc("report_submission", {
    target_id: submissionId,
    report_reason: reason,
  });
  if (error) throw error;
  return data as { success: boolean; message?: string };
}

export async function reportComment(commentId: string, reason = "inappropriate") {
  const { data, error } = await supabase.rpc("report_comment", {
    target_id: commentId,
    report_reason: reason,
  });
  if (error) throw error;
  return data as { success: boolean; message?: string };
}

export async function loadUserReportedIds(): Promise<{
  reportedSubmissions: Set<string>;
  reportedComments: Set<string>;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { reportedSubmissions: new Set(), reportedComments: new Set() };
  }
  const { data, error } = await supabase
    .from("reports")
    .select("submission_id, comment_id");
  if (error) {
    console.error("Failed to load user reports", error);
    return { reportedSubmissions: new Set(), reportedComments: new Set() };
  }
  const subs = new Set<string>();
  const comments = new Set<string>();
  (data ?? []).forEach((r: any) => {
    if (r.submission_id) subs.add(r.submission_id);
    if (r.comment_id) comments.add(r.comment_id);
  });
  return { reportedSubmissions: subs, reportedComments: comments };
}

export async function fileToPayload(file: File): Promise<AttachmentPayload> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read attachment"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, base64 };
}
