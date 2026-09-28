import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { authenticatedUser, corsHeaders, enforceSlidingWindow, json, requestIp, sha256 } from "../_shared/security.ts";

const voteInput = z.object({
  submissionId: z.string().uuid(),
  anonToken: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  action: z.enum(["vote", "unvote", "toggle"]).optional(),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const input = voteInput.parse(await request.json());
    const ip = requestIp(request);
    const ipHash = await sha256(`suggfeed_ip:${ip}`);

    // Compute stable server-salted device hash
    const rawFingerprint = input.deviceFingerprint?.trim() || "";
    const deviceHash = rawFingerprint
      ? await sha256(`suggfeed_device:${rawFingerprint}`)
      : await sha256(`suggfeed_ip_fallback:${ip}`);

    // General rate limit: 60 vote actions per hour per IP
    await enforceSlidingWindow("vote-ip", ip, 60, 60 * 60);

    // Use standard SUPABASE_SERVICE_ROLE_KEY with PROJECT_SERVICE_ROLE_KEY fallback
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

    if (findError || !submission) {
      return json({ error: "Submission not found or not yet public" }, 404, request);
    }

    let didVote: boolean;
    const action = input.action ?? "toggle";

    if (user) {
      // ══════════════════════════════════════════════════════════════════
      // AUTHENTICATED USER: EXEMPT from device fingerprint limit.
      // Votes are tracked strictly per account (user.id). Multiple users
      // on the same device can each vote with their own account.
      // ══════════════════════════════════════════════════════════════════
      const { data: existing } = await client
        .from("votes")
        .select("submission_id")
        .eq("submission_id", input.submissionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        if (action === "vote") {
          return json({ voteCount: submission.vote_count, voted: true }, 200, request);
        }
        // Remove vote
        const { error } = await client.from("votes")
          .delete()
          .eq("submission_id", input.submissionId)
          .eq("user_id", user.id);
        if (error) throw error;
        didVote = false;
      } else {
        if (action === "unvote") {
          return json({ voteCount: submission.vote_count, voted: false }, 200, request);
        }
        // Insert vote
        const { error } = await client.from("votes")
          .insert({
            submission_id: input.submissionId,
            user_id: user.id,
            device_hash: deviceHash,
            ip_hash: ipHash,
          });
        if (error) throw error;
        didVote = true;
      }
    } else {
      // ══════════════════════════════════════════════════════════════════
      // ANONYMOUS USER: ENFORCE device fingerprint / IP rule.
      // An anonymous device can only have 1 vote per submission.
      // Clearing localStorage or incognito tabs will NOT allow repeat voting.
      // ══════════════════════════════════════════════════════════════════
      const anonToken = input.anonToken ?? crypto.randomUUID();

      // Check if an anonymous vote already exists for this submission from this device or token
      let existingQuery = client
        .from("votes")
        .select("submission_id, anon_token, device_hash")
        .eq("submission_id", input.submissionId)
        .is("user_id", null);

      if (anonToken && deviceHash) {
        existingQuery = existingQuery.or(`device_hash.eq.${deviceHash},anon_token.eq.${anonToken}`);
      } else if (deviceHash) {
        existingQuery = existingQuery.eq("device_hash", deviceHash);
      } else {
        existingQuery = existingQuery.eq("anon_token", anonToken);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        // Device has already voted for this submission!
        if (action === "vote") {
          // Explicit "vote" request on an already-voted submission is blocked
          return json({
            error: "You have already supported this idea from this device. Sign in to manage your votes across devices.",
            voteCount: submission.vote_count,
            voted: true,
          }, 409, request);
        }

        // Action is "unvote" or "toggle": remove the existing vote
        const { error } = await client.from("votes")
          .delete()
          .eq("submission_id", input.submissionId)
          .is("user_id", null)
          .or(`device_hash.eq.${deviceHash},anon_token.eq.${anonToken}`);
        if (error) throw error;
        didVote = false;
      } else {
        // Device has NOT voted for this submission yet.
        if (action === "unvote") {
          return json({ voteCount: submission.vote_count, voted: false }, 200, request);
        }

        // Anti-sybil rate limit for anonymous voting: max 25 votes per hour per IP
        await enforceSlidingWindow("anon-vote-ip", ip, 25, 60 * 60);

        const { error: insertError } = await client.from("votes")
          .insert({
            submission_id: input.submissionId,
            anon_token: anonToken,
            device_hash: deviceHash,
            ip_hash: ipHash,
          });

        if (insertError) {
          // Unique violation on votes_anonymous_device_unique
          if ((insertError as { code?: string }).code === "23505") {
            return json({
              error: "You have already supported this idea from this device.",
              voteCount: submission.vote_count,
              voted: true,
            }, 409, request);
          }
          throw insertError;
        }
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

    return json({ voteCount, voted: didVote }, 200, request);
  } catch (error) {
    console.error("vote-submission failed", error);
    return json({
      error: error instanceof z.ZodError
        ? "Invalid vote request"
        : error instanceof Error ? error.message : "Unable to record vote",
    }, 400, request);
  }
});
