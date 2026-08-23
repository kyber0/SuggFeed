import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/security.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (request.headers.get("Authorization") !== `Bearer ${Deno.env.get("ARCHIVE_CRON_SECRET")}`) return json({ error: "Unauthorized" }, 401);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!);
    const { data: settings, error: settingsError } = await client.from("retention_settings").select("retention_days").eq("id", true).single();
    if (settingsError || !settings) throw settingsError ?? new Error("Retention settings unavailable");
    const cutoff = new Date(Date.now() - settings.retention_days * 86_400_000).toISOString();
    const { data: submissions, error } = await client.from("submissions").select("id,attachments(storage_path)").in("status", ["resolved", "rejected"]).lt("updated_at", cutoff).not("user_id", "is", null);
    if (error) throw error;
    for (const submission of submissions ?? []) {
      const paths = (submission.attachments as { storage_path: string }[]).map((attachment) => attachment.storage_path);
      if (paths.length) await client.storage.from("submission-attachments").remove(paths);
      await client.from("attachments").delete().eq("submission_id", submission.id);
      await client.from("submissions").update({ user_id: null, title: "Archived feedback", description: "This feedback was anonymized under the retention policy.", anonymous_tracking_hash: null }).eq("id", submission.id);
      await client.from("audit_log").insert({ actor_id: null, action: "archive_submission", target_table: "submissions", target_id: submission.id, metadata: { cutoff, retention_days: settings.retention_days } });
    }
    return json({ archived: submissions?.length ?? 0 });
  } catch (error) { console.error("archive-old-submissions failed", error); return json({ error: error instanceof Error ? error.message : "Archive failed" }, 400); }
});
