"use client";
import { supabase } from "./supabase";

export type AttachmentPayload = { name: string; type: string; base64: string };
export type SubmitPayload = { title: string; description: string; category: string; isAnonymous: boolean; consent: true; turnstileToken: string; attachments: AttachmentPayload[] };
export type AttachmentFile = { id: string; mime_type: string; size_bytes: number; url: string | null; name: string };
export type PublishedSubmission = { id: string; title: string; description: string; status: "approved" | "in_progress" | "resolved"; vote_count: number; created_at: string; categories: { name: string } | null; attachments: { id: string }[] };
export type Comment = { id: string; submission_id: string; body: string; display_name: string | null; created_at: string };

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

export function submitFeedback(payload: SubmitPayload) {
  return invoke<{ trackingCode: string | null }>("submit-feedback", payload);
}

export function lookupTrackingCode(trackingCode: string) {
  return invoke<{ status: string; createdAt: string; timeline: { new_status: string; note: string | null; created_at: string }[] }>(
    "lookup-by-tracking-code", { trackingCode }
  );
}

export async function loadPublishedSubmissions(sortBy: "popular" | "newest" | "oldest" = "popular", offset = 0, limit = 18) {
  let query = supabase
    .from("submissions")
    .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)", { count: "exact" })
    .in("status", ["approved", "in_progress", "resolved"]);

  if (sortBy === "popular") {
    query = query.order("vote_count", { ascending: false }).order("created_at", { ascending: false });
  } else if (sortBy === "newest") {
    query = query.order("created_at", { ascending: false });
  } else if (sortBy === "oldest") {
    query = query.order("created_at", { ascending: true });
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) throw error;
  return { submissions: (data ?? []) as unknown as PublishedSubmission[], count: count ?? 0 };
}

export async function loadSingleSubmission(id: string): Promise<PublishedSubmission | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)")
    .eq("id", id)
    .in("status", ["approved", "in_progress", "resolved"])
    .maybeSingle();

  if (error) throw error;
  return data as unknown as PublishedSubmission | null;
}

export async function loadAttachments(submissionId: string): Promise<AttachmentFile[]> {
  const result = await invoke<{ files: AttachmentFile[] }>("get-attachments", { submissionId });
  return result.files ?? [];
}

export async function voteSubmission(submissionId: string, anonToken: string) {
  return invoke<{ voteCount: number; voted: boolean }>("vote-submission", { submissionId, anonToken });
}

export async function loadComments(submissionId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id,submission_id,body,display_name,created_at")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Comment[];
}

export function addComment(payload: {
  submissionId: string;
  body: string;
  displayName?: string;
  anonToken?: string;
  turnstileToken: string;
}) {
  return invoke<{ comment: Comment }>("add-comment", {
    submissionId:   payload.submissionId,
    body:           payload.body,
    displayName:    payload.displayName || undefined,
    anonToken:      payload.anonToken,
    turnstileToken: payload.turnstileToken,
  });
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
