import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { corsHeaders, json } from "../_shared/security.ts";

const input = z.object({ submissionId: z.string().uuid() });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = input.parse(await request.json());
    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Check if the caller is staff/admin (allows fetching attachments for any submission)
    const authHeader = request.headers.get("Authorization");
    let isStaff = false;
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
        isStaff = profile?.role === "moderator" || profile?.role === "admin";
      }
    }

    // Verify submission exists — staff can see any, public can only see published
    const query = client.from("submissions").select("id").eq("id", body.submissionId);
    if (!isStaff) query.in("status", ["approved", "in_progress", "resolved"]);
    const { data: submission } = await query.maybeSingle();
    if (!submission) return json({ error: "Submission not found or not public" }, 404);

    // Load attachment rows
    const { data: attachments, error } = await client
      .from("attachments")
      .select("id, storage_path, mime_type, size_bytes")
      .eq("submission_id", body.submissionId)
      .order("id");
    if (error) throw error;

    // Generate 1-hour signed URLs for every file
    const files = await Promise.all((attachments ?? []).map(async (a) => {
      const { data: signed } = await client.storage
        .from("submission-attachments")
        .createSignedUrl(a.storage_path, 3600);
      return {
        id: a.id,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        url: signed?.signedUrl ?? null,
        name: a.storage_path.split("/").pop() ?? "file",
      };
    }));

    return json({ files });
  } catch (err) {
    console.error("get-attachments failed", err);
    return json({ error: err instanceof Error ? err.message : "Failed to load attachments" }, 400);
  }
});
