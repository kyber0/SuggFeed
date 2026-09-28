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

    // Update vote_count incrementally on the submission.
    // Do NOT count(*) from votes table because seed/pre-existing submissions
    // have initial vote counts without individual vote rows in votes table;
    // counting would wipe those totals down to 1 or 0.
    const currentVotes = typeof submission.vote_count === "number" ? submission.vote_count : 0;
    const voteCount = Math.max(0, currentVotes + (didVote ? 1 : -1));

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
