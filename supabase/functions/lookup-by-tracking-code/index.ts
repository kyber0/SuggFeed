import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { corsHeaders, enforceSlidingWindow, json, requestIp, sha256 } from "../_shared/security.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { trackingCode } = z.object({
      trackingCode: z.string().trim().min(3).max(64)
    }).parse(await request.json());

    await enforceSlidingWindow("tracking-lookup", requestIp(request), 30, 15 * 60);

    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const cleanInput = trackingCode.trim().toUpperCase().replace(/\s+/g, "");
    const withCv = cleanInput.startsWith("CV-") ? cleanInput : `CV-${cleanInput}`;
    const withoutCv = cleanInput.replace(/^CV-/, "");

    const hashes = Array.from(new Set([
      await sha256(cleanInput),
      await sha256(withCv),
      await sha256(withoutCv),
    ]));

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trackingCode.trim());

    let query = client
      .from("submissions")
      .select("id,title,description,status,created_at,categories(name),status_history(new_status,note,created_at)");

    if (isUuid) {
      query = query.or(`id.eq.${trackingCode.trim()},anonymous_tracking_hash.in.(${hashes.join(",")})`);
    } else {
      query = query.in("anonymous_tracking_hash", hashes);
    }

    const { data, error: dbError } = await query.maybeSingle();
    if (dbError) throw dbError;
    if (!data) return json({ error: "Idea not found. Please check your tracking code and try again." }, 404);

    const history = [...((data.status_history as { new_status: string; note: string | null; created_at: string }[]) ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    return json({
      id: data.id,
      title: data.title,
      description: data.description,
      category: (data as any).categories?.name || "General",
      status: data.status,
      createdAt: data.created_at,
      timeline: history,
    });
  } catch (error) {
    console.error("tracking lookup failed", error);
    return json({ error: error instanceof Error ? error.message : "Unable to look up feedback" }, 400);
  }
});
