import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_SITE_URL = "https://campus-voice-web.vercel.app";

function getSiteUrl(): string {
  return Deno.env.get("SITE_URL") || DEFAULT_SITE_URL;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSuggFeedEmail({
  title,
  subtitle,
  badgeText,
  badgeBg = "#0b3857",
  badgeColor = "#ffffff",
  mainCardContent,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  title: string;
  subtitle: string;
  badgeText?: string;
  badgeBg?: string;
  badgeColor?: string;
  mainCardContent: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(11, 56, 87, 0.06);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0b3857 0%, #1e40af 100%); padding: 28px 24px; text-align: center;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <div style="width: 36px; height: 36px; background-color: #f59e0b; border-radius: 8px; text-align: center; line-height: 36px; font-weight: 900; color: #0b3857; font-size: 19px;">
                      S
                    </div>
                  </td>
                  <td style="vertical-align: middle; text-align: left;">
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.1;">
                      SuggFeed
                    </div>
                    <div style="font-size: 11px; color: #cbd5e1; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px;">
                      Campus Voice & Feedback
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px;">
              ${
                badgeText
                  ? `<div style="display: inline-block; padding: 4px 12px; background-color: ${badgeBg}; color: ${badgeColor}; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 14px;">
                      ${escapeHtml(badgeText)}
                    </div>`
                  : ""
              }

              <h1 style="margin: 0 0 10px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                ${escapeHtml(title)}
              </h1>
              
              <p style="margin: 0 0 20px; font-size: 14.5px; color: #475569; line-height: 1.6;">
                ${subtitle}
              </p>

              <!-- Main Content Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
                ${mainCardContent}
              </div>

              ${
                ctaText && ctaUrl
                  ? `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 16px;">
                      <tr>
                        <td align="center" style="border-radius: 8px; background: #0b3857;">
                          <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.01em;">
                            ${escapeHtml(ctaText)} &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #64748b;">
                ${footerNote || "You received this email because email notifications are enabled for your SuggFeed account."}
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; SuggFeed &bull; Campus Feedback Community
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function notifyReview(
  client: SupabaseClient,
  submission: { id: string; title: string; user_id: string | null },
  status: string,
  note?: string | null
) {
  if (!submission.user_id) return;
  const { data: profile } = await client
    .from("profiles")
    .select("expo_push_token,email_notifications_enabled")
    .eq("id", submission.user_id)
    .maybeSingle();

  const formattedStatus = status.replace("_", " ").toUpperCase();
  const text = `Your feedback “${submission.title}” is now ${status.replace("_", " ")}.${note ? ` Staff note: ${note}` : ""}`;
  const jobs: Promise<Response>[] = [];

  if (profile?.expo_push_token) {
    jobs.push(
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title: "SuggFeed Status Update",
          body: text,
          data: { submissionId: submission.id },
        }),
      })
    );
  }

  if (profile?.email_notifications_enabled && Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) {
    const { data } = await client.auth.admin.getUserById(submission.user_id);
    if (data.user?.email) {
      const siteUrl = getSiteUrl();
      const ideaUrl = `${siteUrl}/idea/${submission.id}`;

      let badgeBg = "rgba(11, 56, 87, 0.1)";
      let badgeColor = "#0b3857";
      if (status === "approved") {
        badgeBg = "rgba(16, 185, 129, 0.15)";
        badgeColor = "#059669";
      } else if (status === "in_progress") {
        badgeBg = "rgba(37, 99, 235, 0.15)";
        badgeColor = "#2563eb";
      } else if (status === "resolved") {
        badgeBg = "rgba(124, 58, 237, 0.15)";
        badgeColor = "#7c3aed";
      } else if (status === "rejected") {
        badgeBg = "rgba(239, 68, 68, 0.15)";
        badgeColor = "#dc2626";
      }

      const mainCardContent = `
        <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
          “${escapeHtml(submission.title)}”
        </div>
        <div style="font-size: 13px; color: #64748b; margin-bottom: ${note ? "12px" : "0"};">
          Status updated to: <strong style="color: ${badgeColor};">${formattedStatus}</strong>
        </div>
        ${
          note
            ? `<div style="border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 13px; color: #334155; line-height: 1.5;">
                <span style="font-weight: 700; color: #0b3857;">Official Staff Note:</span> “${escapeHtml(note)}”
              </div>`
            : ""
        }
      `;

      const html = renderSuggFeedEmail({
        title: "Your SuggFeed Feedback Status Was Updated",
        subtitle: `Campus staff has updated the status of your suggestion to <strong>${escapeHtml(formattedStatus)}</strong>.`,
        badgeText: formattedStatus,
        badgeBg,
        badgeColor,
        mainCardContent,
        ctaText: "View Feedback Details",
        ctaUrl: ideaUrl,
      });

      jobs.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_EMAIL"),
            to: [data.user.email],
            subject: `SuggFeed: Your idea is now ${formattedStatus.toLowerCase()}`,
            text,
            html,
          }),
        })
      );
    }
  }

  const results = await Promise.allSettled(jobs);
  results.forEach((result) => {
    if (result.status === "rejected") console.error("Notification delivery failed", result.reason);
  });
}

export async function notifyComment(
  client: SupabaseClient,
  submission: { id: string; title: string; user_id: string | null },
  comment: { body: string; display_name: string | null }
) {
  if (!submission.user_id) return;
  const { data: profile } = await client
    .from("profiles")
    .select("expo_push_token,email_notifications_enabled")
    .eq("id", submission.user_id)
    .maybeSingle();

  const authorName = comment.display_name || "A community member";
  const commentSnippet = comment.body.length > 80 ? comment.body.slice(0, 80) + "..." : comment.body;
  const text = `${authorName} commented on your idea “${submission.title}”: "${commentSnippet}"`;
  const jobs: Promise<Response>[] = [];

  if (profile?.expo_push_token) {
    jobs.push(
      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title: "New Comment on SuggFeed",
          body: text,
          data: { submissionId: submission.id },
        }),
      })
    );
  }

  if (profile?.email_notifications_enabled && Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) {
    const { data } = await client.auth.admin.getUserById(submission.user_id);
    if (data.user?.email) {
      const siteUrl = getSiteUrl();
      const ideaUrl = `${siteUrl}/idea/${submission.id}`;

      const mainCardContent = `
        <div style="font-size: 13px; color: #64748b; margin-bottom: 6px;">
          On suggestion: <strong style="color: #0b3857;">“${escapeHtml(submission.title)}”</strong>
        </div>
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-top: 8px;">
          <div style="font-size: 12px; font-weight: 700; color: #0b3857; margin-bottom: 4px;">
            ${escapeHtml(authorName)} wrote:
          </div>
          <div style="font-size: 13.5px; color: #334155; line-height: 1.5; font-style: italic;">
            “${escapeHtml(comment.body)}”
          </div>
        </div>
      `;

      const html = renderSuggFeedEmail({
        title: "New Comment on Your Suggestion",
        subtitle: `<strong>${escapeHtml(authorName)}</strong> joined the conversation on your SuggFeed post.`,
        badgeText: "New Comment",
        badgeBg: "rgba(37, 99, 235, 0.12)",
        badgeColor: "#2563eb",
        mainCardContent,
        ctaText: "Read Conversation & Reply",
        ctaUrl: ideaUrl,
      });

      jobs.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_EMAIL"),
            to: [data.user.email],
            subject: `SuggFeed: New comment from ${authorName}`,
            text,
            html,
          }),
        })
      );
    }
  }

  const results = await Promise.allSettled(jobs);
  results.forEach((result) => {
    if (result.status === "rejected") console.error("Comment notification failed", result.reason);
  });
}
