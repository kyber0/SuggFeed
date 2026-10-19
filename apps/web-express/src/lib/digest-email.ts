/** Branded companion to the plain-text digest. Inputs are public notification fields. */
export interface DigestEmailEntry { title: string; kind: string; office_label: string; }
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
function httpsLink(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Email links require HTTPS.');
  return escapeHtml(url.href);
}
export function digestHtml(entries: DigestEmailEntry[], origin: string, unsubscribe: string, schoolPath = '',schoolNote=''): string {
  const updatesUrl = httpsLink(new URL(schoolPath + '/notifications', origin).href);
  const preferencesUrl = httpsLink(new URL(schoolPath + '/notifications#notification-preferences', origin).href);
  const unsubscribeUrl = httpsLink(unsubscribe);
  const labels: Record<string, string> = {started:'Work started',update:'Progress update',milestone:'Milestone reached',blocked:'Work paused',completed:'Completed',correction:'Correction',resumed:'Work resumed',reopened:'Reopened',withdrawn:'Withdrawn'};
  const noteHtml=schoolNote?'<p style="font-size:14px;line-height:1.7;white-space:pre-line">'+escapeHtml(schoolNote)+'</p>':'';
  const cards = entries.map(entry => `<tr><td class="email-update" style="padding:18px 20px;border-bottom:1px solid #d9e2ec;">
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#2563eb;">${escapeHtml(labels[entry.kind] || entry.kind.replace(/_/g, ' '))}</p>
    <h2 style="margin:0 0 6px;font-size:16px;line-height:1.5;color:#102a43;overflow-wrap:anywhere;">${escapeHtml(entry.title)}</h2>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#627d98;">${escapeHtml(entry.office_label)}</p>
  </td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>Your weekly SuggFeed school updates</title>
<style>
@media(max-width:600px){.email-shell{padding:16px 8px!important}.email-content{padding:24px 20px!important}.email-heading{font-size:25px!important}.email-button{display:block!important;text-align:center!important}}
@media(prefers-color-scheme:dark){body,.email-shell{background:#101923!important}.email-card{background:#182535!important;border-color:#34465b!important}.email-content h1,.email-update h2{color:#edf2f7!important}.email-content p,.email-update p,.email-footer p{color:#b9c9da!important}.email-updates,.email-footer{background:#13202e!important;border-color:#34465b!important}.email-update{border-color:#34465b!important}.email-footer a{color:#93c5fd!important}}
</style></head>
<body style="margin:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;color:#102a43;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${entries.length} public ${entries.length === 1 ? 'update' : 'updates'} from the school ideas you follow. See what moved forward this week.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="padding:36px 12px;background:#f0f4f8;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-card" style="max-width:580px;border:1px solid #d9e2ec;border-radius:16px;background:#fff;overflow:hidden;">
<tr><td style="padding:26px 28px;background:#0b3857;color:#fff;border-bottom:4px solid #f59e0b;">
<p style="margin:0;font-size:24px;font-weight:800;color:#fff;">SuggFeed<span style="color:#fbbf24;">.</span></p><p style="margin:6px 0 0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#d0eaf7;">Your voice. Our school.</p></td></tr>
<tr><td class="email-content" style="padding:32px 28px;">
<p style="margin:0 0 10px;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">The weekly roundup</p>
<h1 class="email-heading" style="margin:0 0 12px;font-size:29px;line-height:1.2;letter-spacing:-.02em;color:#102a43;">Small ideas.<br>Real progress.</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#627d98;">Here ${entries.length === 1 ? 'is the latest public update' : 'are the latest public updates'} on the school ideas you follow.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-updates" style="background:#f8fafc;border:1px solid #d9e2ec;border-radius:10px;">${noteHtml?'<tr><td style="padding:20px">'+noteHtml+'</td></tr>':''}${cards}</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td style="border-radius:8px;background:#0b3857;"><a class="email-button" href="${updatesUrl}" style="display:inline-block;padding:14px 24px;background:#0b3857;border-radius:8px;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">See your updates &rarr;</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#627d98;">Only public updates are included. Private clarifications and tracking codes stay out of email.</p>
</td></tr>
<tr><td class="email-footer" style="padding:22px 28px;background:#f8fafc;border-top:1px solid #d9e2ec;">
<p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#627d98;">You opted in to weekly updates on SuggFeed. Choose what arrives in your inbox, or pause whenever you need.</p>
<p style="margin:0;font-size:12px;line-height:1.8;"><a href="${preferencesUrl}" style="color:#0b3857;text-decoration:underline;">Manage email preferences</a> &nbsp;&middot;&nbsp; <a href="${unsubscribeUrl}" style="color:#0b3857;text-decoration:underline;">Unsubscribe</a></p>
<p style="margin:12px 0 0;font-size:11px;color:#627d98;">SuggFeed &middot; Campus Feedback Community</p>
</td></tr></table></td></tr></table></body></html>`;
}
