import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { authenticatedUser, corsHeaders, enforceSlidingWindow, json, requestIp } from "../_shared/security.ts";

const voteInput = z.object({
  submissionId: z.string().uuid(),
  anonToken: z.string().uuid().optional(),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const input = voteInput.parse(await request.json());
    await enforceSlidingWindow("vote", requestIp(request), 20, 60 * 60);

    // Use standard SUPABASE_SERVICE_ROLE_KEY (always auto-set) with PROJECT_SERVICE_ROLE_KEY as override
    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const user = await authenticatedUser(client, request);

    // Submission must be publicly visible before votes are accepted
    const { data: submission, error: findError } = await client
      .from("submissions")
      .select("id, vote_count, status")
      .eq("id", input.submissionId)
      .in("status", ["approved", "in_progress", "resolved"])
      .maybeSingle();
    if (findError || !submission) return json({ error: "Submission not found or not yet public" }, 404);

    let didVote: boolean;

    if (user) {
      // Authenticated: toggle by user_id
      const { data: existing } = await client
        .from("votes")
        .select("submission_id")
        .eq("submission_id", input.submissionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await client.from("votes")
          .delete()
          .eq("submission_id", input.submissionId)
          .eq("user_id", user.id);
        if (error) throw error;
        didVote = false;
      } else {
        const { error } = await client.from("votes")
          .insert({ submission_id: input.submissionId, user_id: user.id });
        if (error) throw error;
        didVote = true;
      }
    } else {
      // Anonymous: toggle by anon_token
      const anonToken = input.anonToken ?? crypto.randomUUID();
      const { data: existing } = await client
        .from("votes")
        .select("submission_id")
        .eq("submission_id", input.submissionId)
        .eq("anon_token", anonToken)
        .maybeSingle();

      if (existing) {
        const { error } = await client.from("votes")
          .delete()
          .eq("submission_id", input.submissionId)
          .eq("anon_token", anonToken);
        if (error) throw error;
        didVote = false;
      } else {
        const { error } = await client.from("votes")
          .insert({ submission_id: input.submissionId, anon_token: anonToken });
        if (error) throw error;
        didVote = true;
      }
    }

    // Count the actual votes in the DB — this is what the trigger would do.
    // We do it explicitly here so vote_count is persisted correctly even if
    // the trigger hasn't been applied or hasn't propagated yet.
    const { count: actualCount } = await client
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("submission_id", input.submissionId);

    const voteCount = actualCount ?? Math.max(0, (submission.vote_count as number) + (didVote ? 1 : -1));

    // Write the accurate count back to submissions so the next feed refresh sees it
    await client
      .from("submissions")
      .update({ vote_count: voteCount })
      .eq("id", input.submissionId);

    return json({ voteCount, voted: didVote });
  } catch (error) {
    console.error("vote-submission failed", error);
    return json({
      error: error instanceof z.ZodError
        ? "Invalid vote request"
        : error instanceof Error ? error.message : "Unable to record vote",
    }, 400);
  }
});
