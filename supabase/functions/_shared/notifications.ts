import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function notifyReview(client: SupabaseClient, submission: { id: string; title: string; user_id: string | null }, status: string, note?: string | null) {
  if (!submission.user_id) return;
  const { data: profile } = await client.from("profiles").select("expo_push_token,email_notifications_enabled").eq("id", submission.user_id).maybeSingle();
  const text = `Your feedback “${submission.title}” is now ${status.replace("_", " ")}.${note ? ` ${note}` : ""}`;
  const jobs: Promise<Response>[] = [];
  if (profile?.expo_push_token) jobs.push(fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: profile.expo_push_token, title: "Campus Voice update", body: text, data: { submissionId: submission.id } }) }));
  if (profile?.email_notifications_enabled && Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) {
    const { data } = await client.auth.admin.getUserById(submission.user_id);
    if (data.user?.email) jobs.push(fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM_EMAIL"), to: [data.user.email], subject: "Your Campus Voice feedback was updated", text }) }));
  }
  const results = await Promise.allSettled(jobs);
  results.forEach((result) => { if (result.status === "rejected") console.error("Notification delivery failed", result.reason); });
}

export async function notifyComment(client: SupabaseClient, submission: { id: string; title: string; user_id: string | null }, comment: { body: string; display_name: string | null }) {
  if (!submission.user_id) return;
  const { data: profile } = await client.from("profiles").select("expo_push_token,email_notifications_enabled").eq("id", submission.user_id).maybeSingle();
  const text = `${comment.display_name || "Someone"} commented on your idea “${submission.title}”: "${comment.body.length > 50 ? comment.body.slice(0, 50) + "..." : comment.body}"`;
  const jobs: Promise<Response>[] = [];
  
  if (profile?.expo_push_token) {
    jobs.push(fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: profile.expo_push_token, title: "New Comment", body: text, data: { submissionId: submission.id } }) }));
  }
  
  if (profile?.email_notifications_enabled && Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) {
    const { data } = await client.auth.admin.getUserById(submission.user_id);
    if (data.user?.email) {
      jobs.push(fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("RESEND_FROM_EMAIL"), to: [data.user.email], subject: "New comment on your Campus Voice idea", text }) }));
    }
  }
  
  const results = await Promise.allSettled(jobs);
  results.forEach((result) => { if (result.status === "rejected") console.error("Comment notification failed", result.reason); });
}
