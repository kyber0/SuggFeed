import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { notifyReview } from "../_shared/notifications.ts";
import { authenticatedUser, corsHeaders, json } from "../_shared/security.ts";

const reviewInput = z.object({ submissionId: z.string().uuid(), status: z.enum(["approved", "rejected", "in_progress", "resolved"]), note: z.string().trim().max(1000).optional() });
const transitions: Record<string, string[]> = { pending: ["approved", "rejected", "in_progress"], approved: ["in_progress", "resolved", "rejected"], in_progress: ["resolved", "rejected"], rejected: [], resolved: [] };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!);
    const user = await authenticatedUser(client, request);
    if (!user) return json({ error: "Sign in required" }, 401);
    const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["moderator", "admin"].includes(profile.role)) return json({ error: "Moderator access required" }, 403);
    const input = reviewInput.parse(await request.json());
    const { data: existing, error: findError } = await client.from("submissions").select("id,title,user_id,status").eq("id", input.submissionId).single();
    if (findError || !existing) return json({ error: "Submission not found" }, 404);
    if (!transitions[existing.status]?.includes(input.status)) return json({ error: "That status change is not allowed" }, 409);
    const { error: updateError } = await client.from("submissions").update({ status: input.status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", existing.id);
    if (updateError) throw updateError;
    const { error: historyError } = await client.from("status_history").insert({ submission_id: existing.id, old_status: existing.status, new_status: input.status, changed_by: user.id, note: input.note || null });
    if (historyError) throw historyError;
    const { error: auditError } = await client.from("audit_log").insert({ actor_id: user.id, action: "review_submission", target_table: "submissions", target_id: existing.id, metadata: { old_status: existing.status, new_status: input.status } });
    if (auditError) throw auditError;
    await notifyReview(client, existing, input.status, input.note);
    return json({ ok: true });
  } catch (error) {
    console.error("review-submission failed", error);
    return json({ error: error instanceof z.ZodError ? "Invalid review request" : error instanceof Error ? error.message : "Unable to review submission" }, 400);
  }
});
