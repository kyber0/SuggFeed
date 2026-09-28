import { supabase } from "./supabase";
import { fetchWithCache, invalidateCache } from "./cache-manager";

export type AttachmentPayload = { name: string; type: string; base64: string };
export type SubmitPayload = { title: string; description: string; category: string; isAnonymous: boolean; consent: true; turnstileToken: string; attachments: AttachmentPayload[] };
export type AttachmentFile = { id: string; mime_type: string; size_bytes: number; url: string | null; name: string };
export type PublishedSubmission = {
  id: string;
  title: string;
  description: string;
  status: "approved" | "in_progress" | "resolved";
  vote_count: number;
  created_at: string;
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

export async function loadCategories(): Promise<string[]> {
  return fetchWithCache(
    "categories",
    async () => {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("name")
          .eq("is_active", true)
          .order("name");
        if (error || !data || data.length === 0) return [...DEFAULT_CATEGORIES];
        return data.map((c: { name: string }) => c.name);
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
  const response = await fetch(functionUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
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

export function lookupTrackingCode(trackingCode: string) {
  return invoke<{ status: string; createdAt: string; timeline: { new_status: string; note: string | null; created_at: string }[] }>(
    "lookup-by-tracking-code", { trackingCode }
  );
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

export async function loadPublishedSubmissions(
  sortBy: "popular" | "newest" | "oldest" = "popular",
  offset = 0,
  limit = 18,
  /** Server-side category filter — skips client-side string matching */
  category?: string,
  /** Server-side full-text search — works across entire dataset, not just loaded page */
  search?: string,
) {
  const fetcher = async () => {
    let query = supabase
      .from("submissions")
      .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id),comments(count)", { count: "exact" })
      .in("status", ["approved", "in_progress", "resolved"]);

    // Server-side category filter
    if (category && category !== "All") {
      query = query.eq("categories.name", category);
    }

    // Server-side search via ilike (case-insensitive) — OR across title and description.
    // The term is sanitized before interpolation to prevent PostgREST filter injection.
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

  // Cache initial page for instant load
  if (offset === 0) {
    const cacheKey = `feed_${sortBy}_${category || "All"}_${search ? search.trim().toLowerCase() : ""}_${limit}`;
    return fetchWithCache(cacheKey, fetcher, { ttlMs: 90 * 1000 });
  }

  return fetcher();
}

export async function loadRoadmapSubmissions(): Promise<PublishedSubmission[]> {
  return fetchWithCache(
    "roadmap_submissions",
    async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id),comments(count)")
        .in("status", ["approved", "in_progress", "resolved"])
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

export async function loadMyActivity(anonToken?: string, trackingCodes?: string[]) {
  return invoke<{ submissions: PublishedSubmission[]; votedSubmissions: PublishedSubmission[] }>(
    "my-activity",
    { anonToken, trackingCodes }
  );
}

export async function loadSingleSubmission(id: string): Promise<PublishedSubmission | null> {
  return fetchWithCache(
    `submission_${id}`,
    async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id),comments(count)")
        .eq("id", id)
        .in("status", ["approved", "in_progress", "resolved"])
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

export async function loadSubmissionsByIds(ids: string[]): Promise<PublishedSubmission[]> {
  if (!ids || ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id),comments(count)")
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

export async function voteSubmission(submissionId: string, anonToken: string) {
  const result = await invoke<{ voteCount: number; voted: boolean }>("vote-submission", { submissionId, anonToken });
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

export async function reportComment(commentId: string) {
  const { error } = await supabase.rpc("report_comment", { target_id: commentId });
  if (error) throw error;
  return { success: true };
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
