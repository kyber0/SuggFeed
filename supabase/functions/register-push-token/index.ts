import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { authenticatedUser, corsHeaders, json } from "../_shared/security.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!);
    const user = await authenticatedUser(client, request);
    if (!user) return json({ error: "Sign in required" }, 401);
    const { expoPushToken } = z.object({ expoPushToken: z.string().startsWith("ExponentPushToken[").max(255) }).parse(await request.json());
    const { error } = await client.from("profiles").update({ expo_push_token: expoPushToken }).eq("id", user.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unable to register device" }, 400); }
});
