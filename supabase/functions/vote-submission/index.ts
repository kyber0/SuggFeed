import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { authenticatedUser, corsHeaders, enforceSlidingWindow, json, requestIp, sha256 } from "../_shared/security.ts";

const voteInput = z.object({
  submissionId: z.string().uuid(),
  anonToken: z.string().trim().min(16).max(128).optional(),
  deviceFingerprint: z.string().max(2048).optional(),
  action: z.enum(["vote", "unvote", "toggle"]).optional(),
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request);

  try {
    const input = voteInput.parse(await request.json());
    const ip = requestIp(request);
    await enforceSlidingWindow("vote-ip", ip, 60, 60 * 60);

    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const user = await authenticatedUser(client, request);
    const fingerprint = input.deviceFingerprint?.trim();
    // A shared school IP is a rate-limit signal, not voter identity. Signed-in
    // accounts are identified by account; anonymous votes by token/device only.
    const deviceHash = fingerprint ? await sha256(`suggfeed_device:${fingerprint}`) : null;
    const action = input.action ?? "toggle";
    const { data, error } = await client.rpc("set_idea_vote", {
      p_submission_id: input.submissionId,
      p_user_id: user?.id ?? null,
      p_anon_token: user ? null : input.anonToken ?? crypto.randomUUID(),
      p_device_hash: deviceHash,
      p_ip_hash: await sha256(`suggfeed_ip:${ip}`),
      p_action: action,
    });
    if (error?.code === "P0002") return json({ error: "Submission not found or not yet public" }, 404, request);
    if (error?.code === "42501") return json({ error: "Sign in again to vote" }, 401, request);
    if (error?.code === "22023") return json({ error: "Invalid vote request" }, 400, request);
    if (error) throw error;

    // Retain the anonymous 'vote' duplicate response used by older mobile clients.
    if (!user && action === "vote" && data.already_voted) {
      return json({ error: "You have already supported this idea from this browser. Sign in to vote with your account.",
        voteCount: data.vote_count, voted: true, alreadyVoted: true }, 409, request);
    }
    return json({ voteCount: data.vote_count, voted: data.voted }, 200, request);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "Invalid vote request" }, 400, request);
    if (error instanceof Error && error.message === "Too many requests. Please try again later.") return json({ error: "Too many vote requests. Please try again later." }, 429, request);
    // Avoid logging request identity, token, IP, database details or raw errors.
    console.error("vote-submission failed");
    return json({ error: "Unable to record vote. Please try again later." }, 500, request);
  }
});
