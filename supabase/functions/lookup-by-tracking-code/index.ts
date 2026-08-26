import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { corsHeaders, enforceSlidingWindow, json, requestIp, sha256 } from "../_shared/security.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { trackingCode } = z.object({ trackingCode: z.string().trim().min(12).max(40) }).parse(await request.json());
    await enforceSlidingWindow("tracking-lookup", requestIp(request), 10, 15 * 60);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await client.from("submissions").select("id,status,created_at,status_history(new_status,note,created_at)").eq("anonymous_tracking_hash", await sha256(trackingCode.toUpperCase())).maybeSingle();
    if (!data) return json({ error: "Not found" }, 404);
    const history = [...(data.status_history as { new_status: string; note: string | null; created_at: string }[])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return json({ status: data.status, createdAt: data.created_at, timeline: history });
  } catch (error) {
    console.error("tracking lookup failed", error);
    return json({ error: error instanceof Error ? error.message : "Unable to look up feedback" }, 400);
  }
});
