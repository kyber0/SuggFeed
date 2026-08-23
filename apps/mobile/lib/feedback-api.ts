import { supabase } from "./supabase";

export type AttachmentPayload = { name: string; type: string; base64: string };
export type SubmitPayload = {
  title: string;
  description: string;
  category: string;
  isAnonymous: boolean;
  consent: true;
  turnstileToken: string;
  attachments: AttachmentPayload[];
};
export type PublishedSubmission = {
  id: string;
  title: string;
  description: string;
  status: "approved" | "in_progress" | "resolved";
  vote_count: number;
  created_at: string;
  categories: { name: string } | null;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

function functionUrl(name: string) {
  if (!supabaseUrl) throw new Error("EXPO_PUBLIC_SUPABASE_URL is not set");
  return `${supabaseUrl}/functions/v1/${name}`;
}

async function invoke<T>(name: string, payload: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(functionUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "Request failed");
  return result as T;
}

export function submitFeedback(payload: SubmitPayload) {
  return invoke<{ trackingCode: string | null }>("submit-feedback", payload);
}

export function lookupTrackingCode(trackingCode: string) {
  return invoke<{
    status: string;
    createdAt: string;
    timeline: { new_status: string; note: string | null; created_at: string }[];
  }>("lookup-by-tracking-code", { trackingCode });
}

export async function loadPublishedSubmissions() {
  const { data, error, count } = await supabase
    .from("submissions")
    .select("id,title,description,status,vote_count,created_at,categories(name)", { count: "exact" })
    .in("status", ["approved", "in_progress", "resolved"])
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return { submissions: (data ?? []) as unknown as PublishedSubmission[], count: count ?? 0 };
}
