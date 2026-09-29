import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";
import { authenticatedUser, corsHeaders, json } from "../_shared/security.ts";

const inviteInput = z.object({
  email: z.string().trim().email(),
  role: z.enum(["moderator", "admin"]),
  redirectTo: z.string().url().optional(),
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInviteHtml({
  confirmationUrl,
  token,
  role,
}: {
  confirmationUrl: string;
  token?: string;
  role: string;
}): string {
  const roleName = role === "admin" ? "Administrator" : "Moderator";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join the SuggFeed Staff Team</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0f172a;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(11, 56, 87, 0.06);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0b3857 0%, #1e40af 100%); padding: 32px 28px; text-align: center;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <div style="width: 38px; height: 38px; background-color: #f59e0b; border-radius: 8px; text-align: center; line-height: 38px; font-weight: 900; color: #0b3857; font-size: 20px;">
                      S
                    </div>
                  </td>
                  <td style="vertical-align: middle; text-align: left;">
                    <div style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.1;">
                      SuggFeed
                    </div>
                    <div style="font-size: 12px; color: #cbd5e1; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px;">
                      Staff &amp; Governance Portal
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <div style="display: inline-block; padding: 4px 12px; background-color: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 20px; font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">
                Official Invitation &bull; ${escapeHtml(roleName)}
              </div>

              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Join the SuggFeed Team
              </h1>
              <p style="margin: 0 0 18px; font-size: 15px; color: #475569; line-height: 1.6;">
                You have been invited to join <strong>SuggFeed</strong> as a <strong>${escapeHtml(roleName)}</strong>.
              </p>
              <p style="margin: 0 0 28px; font-size: 15px; color: #475569; line-height: 1.6;">
                As a team member, you will have access to review student ideas, triage suggestions, manage community content, and help drive campus improvements.
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
                <tr>
                  <td align="center" style="border-radius: 8px; background: #0b3857;">
                    <a href="${confirmationUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.01em;">
                      Accept Staff Invitation &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              ${
                token
                  ? `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
                      <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">
                        Access Token / OTP
                      </div>
                      <div style="font-family: monospace; font-size: 20px; font-weight: 800; color: #0b3857; letter-spacing: 2px;">
                        ${escapeHtml(token)}
                      </div>
                    </div>`
                  : ""
              }

              <p style="margin: 0 0 8px; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                Or paste this link directly into your browser:
              </p>
              <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all; line-height: 1.4;">
                <a href="${confirmationUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">
                  ${confirmationUrl}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">
                If you did not expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 11.5px; color: #94a3b8;">
                &copy; SuggFeed &bull; Campus Feedback &amp; Voice
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) {
      return json({ error: "Server configuration missing" }, 500);
    }

    const client = createClient(supabaseUrl, serviceKey);
    const user = await authenticatedUser(client, request);
    if (!user) return json({ error: "Sign in required" }, 401);

    // Verify caller is admin
    const { data: callerProfile } = await client.from("profiles").select("role").eq("id", user.id).single();
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Administrator privileges required to invite staff" }, 403);
    }

    const input = inviteInput.parse(await request.json());
    const targetEmail = input.email.toLowerCase();

    // Determine target redirect url
    const origin = input.redirectTo || "https://campus-voice-web.vercel.app";
    const redirectUrl = `${origin}/admin`;

    // Generate magic link using admin API
    const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
      options: {
        redirectTo: redirectUrl,
        data: { role: input.role, invited_as_staff: true },
      },
    });

    if (linkError || !linkData) {
      console.error("Failed to generate magic link:", linkError);
      return json({ error: linkError?.message || "Failed to generate invite link" }, 400);
    }

    const actionLink = linkData.properties?.action_link;
    const emailOtp = linkData.properties?.email_otp;
    const invitedUserId = linkData.user?.id;

    // Pre-create or update profile role
    if (invitedUserId) {
      await client.from("profiles").upsert(
        {
          id: invitedUserId,
          email: targetEmail,
          role: input.role,
          display_name: targetEmail.split("@")[0],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }

    // Send custom SuggFeed invitation email via Resend if credentials exist
    let emailSent = false;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");

    if (resendKey && resendFrom && actionLink) {
      const htmlContent = renderInviteHtml({
        confirmationUrl: actionLink,
        token: emailOtp,
        role: input.role,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [targetEmail],
          subject: `You're invited to join the SuggFeed Staff Team as ${input.role === "admin" ? "an Administrator" : "a Moderator"}`,
          html: htmlContent,
          text: `You have been invited to join the SuggFeed staff team as a ${input.role}. Accept invitation: ${actionLink}`,
        }),
      });

      if (res.ok) {
        emailSent = true;
      } else {
        const errText = await res.text();
        console.error("Resend delivery failed:", errText);
      }
    }

    return json({
      ok: true,
      emailSent,
      inviteUrl: actionLink,
      role: input.role,
    });
  } catch (error) {
    console.error("invite-staff error:", error);
    return json(
      { error: error instanceof z.ZodError ? "Invalid invite parameters" : error instanceof Error ? error.message : "Failed to invite staff member" },
      400
    );
  }
});
