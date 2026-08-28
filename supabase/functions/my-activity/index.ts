import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticatedUser, corsHeaders, json, sha256 } from "../_shared/security.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    const { anonToken, trackingCodes } = await request.json().catch(() => ({ anonToken: null, trackingCodes: [] }));
    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const user = await authenticatedUser(client, request);

    // 1. Find the user's submissions
    let submissions: any[] = [];
    if (user) {
      const { data } = await client
        .from("submissions")
        .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) submissions = data;
    } else if (Array.isArray(trackingCodes) && trackingCodes.length > 0) {
      const hashes = await Promise.all(trackingCodes.map((code: string) => sha256(code.toUpperCase())));
      const { data } = await client
        .from("submissions")
        .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)")
        .in("anonymous_tracking_hash", hashes)
        .order("created_at", { ascending: false });
      if (data) submissions = data;
    }

    // 2. Find the user's voted ideas
    let votedSubmissions: any[] = [];
    if (user || anonToken) {
      let query = client.from("votes").select("submission_id");
      if (user) query = query.eq("user_id", user.id);
      else query = query.eq("anon_token", anonToken);
      
      const { data: votes } = await query;
      if (votes && votes.length > 0) {
        const submissionIds = votes.map((v: any) => v.submission_id);
        const { data: votedData } = await client
          .from("submissions")
          .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)")
          .in("id", submissionIds)
          // Hide pending/rejected from the "My Votes" list if they don't own it
          .in("status", ["approved", "in_progress", "resolved"])
          .order("created_at", { ascending: false });
        if (votedData) votedSubmissions = votedData;
      }
    }

    return json({
      submissions,
      votedSubmissions
    });
  } catch (error) {
    console.error("my-activity failed", error);
    return json({ error: "Unable to load activity" }, 400);
  }
});
