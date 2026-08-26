import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import {
  authenticatedUser,
  corsHeaders,
  enforceSlidingWindow,
  json,
  requestIp,
  requireTurnstile,
} from "../_shared/security.ts";
import { notifyComment } from "../_shared/notifications.ts";

const commentInput = z.object({
  submissionId:  z.string().uuid(),
  body:          z.string().min(10).max(500),
  displayName:   z.string().max(60).optional(),
  anonToken:     z.string().uuid().optional(),
  turnstileToken: z.string(),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const input = commentInput.parse(await request.json());
    await requireTurnstile(input.turnstileToken, request);

    // Rate-limit: max 20 comments per IP per hour globally, 5 per anon_token per submission
    await enforceSlidingWindow("comment:ip", requestIp(request), 20, 60 * 60);

    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const user = await authenticatedUser(client, request);

    // Submission must be publicly visible before comments are accepted
    const { data: submission, error: findError } = await client
      .from("submissions")
      .select("id, title, status, user_id")
      .eq("id", input.submissionId)
      .in("status", ["approved", "in_progress", "resolved"])
      .maybeSingle();
    if (findError || !submission) {
      return json({ error: "Submission not found or not yet public" }, 404);
    }

    // Per-anon-token rate limit: max 5 comments per submission
    if (input.anonToken && !user) {
      const { count } = await client
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", input.submissionId)
        .eq("anon_token", input.anonToken);
      if ((count ?? 0) >= 5) {
        return json({ error: "You've reached the comment limit for this idea." }, 429);
      }
    }

    const { data: comment, error: insertError } = await client
      .from("comments")
      .insert({
        submission_id: input.submissionId,
        body:          input.body.trim(),
        display_name:  input.displayName?.trim() || null,
        anon_token:    user ? null : (input.anonToken ?? crypto.randomUUID()),
        user_id:       user?.id ?? null,
      })
      .select("id, body, display_name, created_at")
      .single();

    if (insertError) throw insertError;
    
    // Notify the author (fire and forget)
    notifyComment(client, submission, comment).catch(console.error);
    
    return json({ comment });
  } catch (error) {
    console.error("add-comment failed", error);
    let errorMessage = "Unable to post comment";
    if (error instanceof z.ZodError) {
      errorMessage = "Invalid comment: " + error.errors[0]?.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === "object" && "message" in error) {
      // Supabase PostgrestError is an object, not an instance of Error
      errorMessage = `DB Error: ${String(error.message)} \nDetails: ${"details" in error ? String(error.details) : ""}`;
    }
    return json({ error: errorMessage }, 400);
  }
});
