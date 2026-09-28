import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticatedUser, corsHeaders, json, sha256 } from "../_shared/security.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  try {
    const { anonToken, trackingCodes, deviceFingerprint } = await request.json().catch(() => ({ anonToken: null, trackingCodes: [], deviceFingerprint: null }));
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
    if (user || anonToken || deviceFingerprint) {
      let query = client.from("votes").select("submission_id");
      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        const filters: string[] = [];
        if (anonToken) filters.push(`anon_token.eq.${anonToken}`);
        if (deviceFingerprint) {
          const deviceHash = await sha256(`suggfeed_device:${deviceFingerprint}`);
          filters.push(`device_hash.eq.${deviceHash}`);
        }
        if (filters.length > 0) {
          query = query.is("user_id", null).or(filters.join(","));
        }
      }
      
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

    // 3. Find the user's bookmarks
    let bookmarkedSubmissions: any[] = [];
    if (user) {
      const { data: bMarks } = await client
        .from("bookmarks")
        .select("submission_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (bMarks && bMarks.length > 0) {
        const bIds = bMarks.map((b: any) => b.submission_id);
        const { data: bData } = await client
          .from("submissions")
          .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)")
          .in("id", bIds)
          .in("status", ["approved", "in_progress", "resolved"]);
        if (bData) {
          const map = new Map(bData.map((d: any) => [d.id, d]));
          bookmarkedSubmissions = bIds.map((id: string) => map.get(id)).filter(Boolean);
        }
      }
    }

    // 4. Find the user's shared ideas
    let sharedSubmissions: any[] = [];
    if (user) {
      const { data: sPosts } = await client
        .from("shared_posts")
        .select("submission_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (sPosts && sPosts.length > 0) {
        const sIds = sPosts.map((s: any) => s.submission_id);
        const { data: sData } = await client
          .from("submissions")
          .select("id,title,description,status,vote_count,created_at,categories(name),attachments(id)")
          .in("id", sIds)
          .in("status", ["approved", "in_progress", "resolved"]);
        if (sData) {
          const map = new Map(sData.map((d: any) => [d.id, d]));
          sharedSubmissions = sIds.map((id: string) => map.get(id)).filter(Boolean);
        }
      }
    }

    return json({
      submissions,
      votedSubmissions,
      bookmarkedSubmissions,
      sharedSubmissions,
    });
  } catch (error) {
    console.error("my-activity failed", error);
    return json({ error: "Unable to load activity" }, 400);
  }
});
