import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { authenticatedUser, corsHeaders, decodeAttachment, enforceSlidingWindow, json, requireTurnstile, requestIp, sha256 } from "../_shared/security.ts";

const submissionInput = z.object({
  title: z.string().trim().min(8).max(120), description: z.string().trim().min(20).max(2000),
  category: z.enum(["Facilities", "Learning", "Safety", "Student life", "Other"]), isAnonymous: z.boolean(), consent: z.literal(true),
  turnstileToken: z.string(), attachments: z.array(z.object({ name: z.string(), type: z.string(), base64: z.string() })).max(3).default([])
});
const extension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const input = submissionInput.parse(await request.json());
    await requireTurnstile(input.turnstileToken, request);
    await enforceSlidingWindow("submit", requestIp(request), 5, 60 * 60);
    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const user = await authenticatedUser(client, request);
    if (!input.isAnonymous && !user) return json({ error: "Sign in to submit account-linked feedback" }, 401);
    const { data: category } = await client.from("categories").select("id").eq("name", input.category).eq("is_active", true).single();
    if (!category) return json({ error: "That category is no longer available" }, 400);
    const attachments = input.attachments.map(decodeAttachment);
    const trackingCode = input.isAnonymous ? `CV-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}` : null;
    const { data: submission, error } = await client.from("submissions").insert({ title: input.title, description: input.description, category_id: category.id, user_id: input.isAnonymous ? null : user!.id, anonymous_tracking_hash: trackingCode ? await sha256(trackingCode) : null }).select("id").single();
    if (error || !submission) throw error ?? new Error("Unable to create submission");
    try {
      for (const attachment of attachments) {
        const path = `${submission.id}/${crypto.randomUUID()}.${extension[attachment.type]}`;
        const { error: uploadError } = await client.storage.from("submission-attachments").upload(path, attachment.bytes, { contentType: attachment.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error: recordError } = await client.from("attachments").insert({ submission_id: submission.id, storage_path: path, mime_type: attachment.type, size_bytes: attachment.bytes.byteLength });
        if (recordError) throw recordError;
      }
    } catch (attachmentError) {
      await client.from("submissions").delete().eq("id", submission.id);
      throw attachmentError;
    }
    await client.from("audit_log").insert({ actor_id: user?.id ?? null, action: "create_submission", target_table: "submissions", target_id: submission.id, metadata: { anonymous: input.isAnonymous, attachment_count: attachments.length } });
    return json({ trackingCode });
  } catch (error) {
    console.error("submit-feedback failed", error);
    return json({ error: error instanceof z.ZodError ? "Check the required fields and try again" : error instanceof Error ? error.message : "Unable to submit feedback" }, 400);
  }
});
