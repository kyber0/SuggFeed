import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseService } from './supabase';
import { ENGAGEMENT_UUID } from './engagement';
import { digestConsent, filterDigestEntries } from './digest-preferences';

export function digestEnabled() {
  return process.env.WEEKLY_DIGEST_ENABLED==='true' && !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL &&
    !!process.env.DIGEST_UNSUBSCRIBE_SECRET && process.env.DIGEST_UNSUBSCRIBE_SECRET.length>=32 && /^https:\/\//.test(process.env.APP_ORIGIN || '') && (process.env.CRON_SECRET?.length || 0)>=32;
}
export function unsubscribeToken(userId:string) {
  const secret=process.env.DIGEST_UNSUBSCRIBE_SECRET;
  if(!secret || secret.length<32 || !ENGAGEMENT_UUID.test(userId)) throw new Error('Digest signing is unavailable.');
  return userId+'.'+createHmac('sha256',secret).update('weekly-digest-unsubscribe:'+userId).digest('base64url');
}
export function unsubscribeUser(token:unknown):string|null {
  if(typeof token!=='string' || token.length>128) return null;
  const [id]=token.split('.');
  if(!ENGAGEMENT_UUID.test(id)) return null;
  try {const expected=Buffer.from(unsubscribeToken(id)),provided=Buffer.from(token);return provided.length===expected.length && timingSafeEqual(provided,expected) ? id : null;}
  catch{return null;}
}
export function digestText(entries:Array<{title:string;kind:string;office_label:string}>,origin:string,unsubscribe:string) {
  return 'Your weekly school updates\n\n'+entries.map(e=>`${e.title}\n${e.kind.replace(/_/g,' ')} · ${e.office_label}`).join('\n\n')+
    '\n\nSee your updates: '+new URL('/notifications',origin).href+'\nStop weekly emails: '+unsubscribe+'\n\nOnly public updates on followed ideas are included. No private clarification or tracking code is included.';
}
export async function deliverWeeklyDigests(transport:typeof fetch=fetch) {
  if(!digestEnabled()) return {enabled:false,delivered:0,failed:0,skipped:0};
  const claimed=await supabaseService.rpc('claim_weekly_digests');
  if(claimed.error) throw claimed.error;
  const result={enabled:true,delivered:0,failed:0,skipped:0};
  for(const job of claimed.data || []) {
    let state='cancelled';
    try {
      const preference=await supabaseService.from('notification_preferences').select('weekly_digest,digest_paused,digest_kinds').eq('user_id',job.user_id).maybeSingle();
      if(preference.error) throw preference.error;
      if(digestConsent(preference.data)) {
        const start=new Date(job.week_start+'T00:00:00+08:00'),end=new Date(start.getTime()+7*86400000);
        const notifications=await supabaseService.from('idea_notifications').select('title,kind,office_label,submission_id,submission:submissions!inner(status),update:idea_updates!inner(visibility,deleted_at)')
          .eq('user_id',job.user_id).gte('created_at',start.toISOString()).lt('created_at',end.toISOString()).in('submission.status',['approved','in_progress','resolved'])
          .eq('update.visibility','public').is('update.deleted_at',null).order('created_at').limit(100);
        if(notifications.error) throw notifications.error;
        const follows=await supabaseService.from('idea_follows').select('submission_id').eq('user_id',job.user_id);
        if(follows.error) throw follows.error;
        const ids=new Set((follows.data || []).map(f=>f.submission_id));
        const entries=(notifications.data || []).filter(n=>ids.has(n.submission_id));
        if(!entries.length) state='empty';
        else {
          const identity=await supabaseService.auth.admin.getUserById(job.user_id);
          if(identity.error) throw identity.error;
          const user=identity.data.user;
          if(user?.email && user.email_confirmed_at) {
            // Re-check consent immediately before network delivery. Account email
            // comes from verified Auth, never from caller-supplied addresses.
            const consent=await supabaseService.from('notification_preferences').select('weekly_digest,digest_paused,digest_kinds').eq('user_id',job.user_id).maybeSingle();
            if(consent.error) throw consent.error;
            if(digestConsent(consent.data)) {
              const eligible=filterDigestEntries(entries,consent.data);
              if(!eligible.length) {state='empty';} else {
              const origin=process.env.APP_ORIGIN!,token=unsubscribeToken(job.user_id);
              const unsubscribe=new URL('/digest/unsubscribe',origin);unsubscribe.searchParams.set('token',token);
              const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
              state='uncertain';
              try {
                const response=await transport('https://api.resend.com/emails',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'weekly-digest-'+job.id},
                  body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[user.email],subject:'Your weekly SuggFeed school updates',text:digestText(eligible,origin,unsubscribe.href),headers:{'List-Unsubscribe':`<${unsubscribe.href}>`}})});
                state=response.ok ? 'delivered' : 'failed';
              }finally{clearTimeout(timer);}
              }
            }
          }
        }
      }
    }catch{if(state!=='uncertain') state='failed';}
    const finished=await supabaseService.from('weekly_digest_jobs').update({state,finished_at:new Date().toISOString()}).eq('id',job.id).eq('state','processing');
    if(finished.error || state==='failed' || state==='uncertain') result.failed++;
    else if(state==='delivered') result.delivered++;
    else result.skipped++;
  }
  return result;
}
