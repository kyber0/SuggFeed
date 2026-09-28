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

    // Compute device hash — ONLY from the client fingerprint.
    // We intentionally do NOT fall back to IP here because multiple legitimate
    // devices can share the same public-facing IP (e.g. shared Wi-Fi, corporate
    // networks). Using IP as identity would wrongly block those users.
    const rawFingerprint = input.deviceFingerprint?.trim() || "";
    const deviceHash = rawFingerprint
      ? await sha256(`suggfeed_device:${rawFingerprint}`)
      : null; // No fingerprint → no device identity; anon_token is the fallback

    // Rate limit per IP: max 60 vote actions per hour
    await enforceSlidingWindow("vote-ip", ip, 60, 60 * 60);

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
      // AUTHENTICATED USER: EXEMPT from device/IP limits.
      // Tracked strictly by account user_id. Multiple accounts on the
      // same device or IP can each vote independently.
      // ══════════════════════════════════════════════════════════════════
      const { data: existingVotes, error: authFindErr } = await client
        .from("votes")
        .select("submission_id")
        .eq("submission_id", input.submissionId)
        .eq("user_id", user.id);

      if (authFindErr) throw authFindErr;
      const existing = (existingVotes && existingVotes.length > 0) ? existingVotes[0] : null;

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
      // ANONYMOUS USER: ENFORCE device & address limits.
      // Prevents infinite voting from the same device / IP address.
      // ══════════════════════════════════════════════════════════════════
      const anonToken = input.anonToken?.trim() || crypto.randomUUID();

      // Query any anonymous votes for this submission
      const { data: anonVotes, error: anonFindErr } = await client
        .from("votes")
        .select("submission_id, anon_token, device_hash")
        .eq("submission_id", input.submissionId)
        .is("user_id", null);

      if (anonFindErr) throw anonFindErr;

      // Match ONLY by device_hash or anon_token — NOT by IP.
      // IP is not used for identity because many legitimate users share
      // the same public IP (school Wi-Fi, office networks, etc.).
      const existing = (anonVotes ?? []).find((v) =>
        (deviceHash && v.device_hash === deviceHash) ||
        (anonToken && v.anon_token === anonToken)
      );

      if (existing) {
        // This browser has already voted on this submission
        if (action === "vote") {
          return json({
            error: "You have already supported this idea from this browser. Sign in to vote with your account.",
            voteCount: submission.vote_count,
            voted: true,
            alreadyVoted: true,
          }, 409, request);
        }

        // Action is "unvote" or "toggle": remove the existing vote
        const deleteQuery = client
          .from("votes")
          .delete()
          .eq("submission_id", input.submissionId)
          .is("user_id", null);

        const deleteFilters: string[] = [];
        if (existing.device_hash) deleteFilters.push(`device_hash.eq.${existing.device_hash}`);
        if (existing.anon_token) deleteFilters.push(`anon_token.eq.${existing.anon_token}`);

        const { error } = deleteFilters.length > 0
          ? await deleteQuery.or(deleteFilters.join(","))
          : await deleteQuery.eq("anon_token", anonToken);

        if (error) throw error;
        didVote = false;
      } else {
        // Not voted yet on this submission
        if (action === "unvote") {
          return json({ voteCount: submission.vote_count, voted: false }, 200, request);
        }

        const { error: insertError } = await client.from("votes")
          .insert({
            submission_id: input.submissionId,
            anon_token: anonToken,
            device_hash: deviceHash,
            ip_hash: ipHash,
          });

        if (insertError) {
          if ((insertError as { code?: string }).code === "23505") {
            return json({
              error: "You have already supported this idea from this browser.",
              voteCount: submission.vote_count,
              voted: true,
              alreadyVoted: true,
            }, 409, request);
          }
          throw insertError;
        }
        didVote = true;
      }
    }

    // Update vote_count incrementally on the submission
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
