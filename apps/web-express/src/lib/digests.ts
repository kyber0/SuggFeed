import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseService, supabasePlatform } from './supabase';
import { ENGAGEMENT_UUID } from './engagement';
import { digestConsent, filterDigestEntries } from './digest-preferences';
import { digestHtml } from './digest-email';
import { currentSchool } from './school-scope';
import { forEachActiveSchool } from './school-jobs';

export function digestEnabled() {
  return process.env.WEEKLY_DIGEST_ENABLED==='true' && !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL &&
    !!process.env.DIGEST_UNSUBSCRIBE_SECRET && process.env.DIGEST_UNSUBSCRIBE_SECRET.length>=32 && /^https:\/\//.test(process.env.APP_ORIGIN || '') && (process.env.CRON_SECRET?.length || 0)>=32;
}
export function unsubscribeToken(userId:string) {
  const secret=process.env.DIGEST_UNSUBSCRIBE_SECRET;
  if(!secret || secret.length<32 || !ENGAGEMENT_UUID.test(userId)) throw new Error('Digest signing is unavailable.');
  const school=currentSchool();
  if(!school) throw new Error('School context required.');
  const subject=school.id+'.'+userId;
  return subject+'.'+createHmac('sha256',secret).update('weekly-digest-unsubscribe:'+subject).digest('base64url');
}
export function unsubscribeUser(token:unknown):string|null {
  if(typeof token!=='string' || token.length>180) return null;
  const [schoolId,id]=token.split('.');
  if(!currentSchool() || schoolId!==currentSchool()!.id || !ENGAGEMENT_UUID.test(id)) return null;
  try {const expected=Buffer.from(unsubscribeToken(id)),provided=Buffer.from(token);return provided.length===expected.length && timingSafeEqual(provided,expected) ? id : null;}
  catch{return null;}
}
export function digestText(entries:Array<{title:string;kind:string;office_label:string}>,origin:string,unsubscribe:string,schoolPath='') {
  return 'Your weekly school updates\n\n'+entries.map(e=>`${e.title}\n${e.kind.replace(/_/g,' ')} · ${e.office_label}`).join('\n\n')+
    '\n\nSee your updates: '+new URL(schoolPath+'/notifications',origin).href+'\nStop weekly emails: '+unsubscribe+'\n\nOnly public updates on followed ideas are included. No private clarification or tracking code is included.';
}
export async function deliverWeeklyDigests(transport:typeof fetch=fetch) {
  const school=currentSchool();
  if(!school) throw new Error('School context required.');
  if(!digestEnabled()) return {enabled:false,delivered:0,failed:0,skipped:0};
  const customization=await supabasePlatform.rpc('school_published_configuration',{p_school:school.id});if(customization.error)throw customization.error;if(customization.data.email.digest==='off')return {enabled:false,delivered:0,failed:0,skipped:0};
  const schoolNote=[school.name,customization.data.email.introduction,customization.data.welcome.help].filter(Boolean).join('\n\n');
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
              const membership=await supabasePlatform.from('school_memberships').select('user_id,school:schools!inner(status,settings:school_settings!inner(approved_at))')
                .eq('school_id',school.id).eq('user_id',job.user_id).eq('status','active').eq('school.status','active').not('school.settings.approved_at','is',null).maybeSingle();
              if(membership.error) throw membership.error;
              const allowed=await supabasePlatform.rpc('school_actor_has_role',{p_school:school.id,p_actor:job.user_id,p_roles:['student','admin','moderator']});const currentConfig=await supabasePlatform.rpc('school_published_configuration',{p_school:school.id});if(allowed.error||currentConfig.error)throw new Error('School digest eligibility unavailable.');
              if(!membership.data||allowed.data!==true||currentConfig.data.email.digest==='off') {state='cancelled';} else {
              const origin=process.env.APP_ORIGIN!,token=unsubscribeToken(job.user_id),schoolPath='/s/'+school.slug;
              const unsubscribe=new URL(schoolPath+'/digest/unsubscribe',origin);unsubscribe.searchParams.set('token',token);
              const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
              state='uncertain';
              try {
                const response=await transport('https://api.resend.com/emails',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'weekly-digest-'+school.id+'-'+job.id},
                  body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[user.email],subject:'Your weekly SuggFeed school updates',text:digestText(eligible,origin,unsubscribe.href,schoolPath)+'\n\n'+schoolNote,html:digestHtml(eligible,origin,unsubscribe.href,schoolPath,schoolNote),headers:{'List-Unsubscribe':`<${unsubscribe.href}>`}})});
                state=response.ok ? 'delivered' : 'failed';
              }finally{clearTimeout(timer);}
              }
              }
            }
          }
        }
      }
    }catch{if(state!=='uncertain') state='failed';}
    let finishFailed=false;
    try {
      const finished=await supabaseService.from('weekly_digest_jobs').update({state,finished_at:new Date().toISOString()}).eq('id',job.id).eq('state','processing');
      finishFailed=!!finished.error;
    } catch { finishFailed=true; }
    if(finishFailed || state==='failed' || state==='uncertain') result.failed++;
    else if(state==='delivered') result.delivered++;
    else result.skipped++;
  }
  return result;
}

export async function deliverAllSchoolDigests(transport:typeof fetch=fetch) {
  const result={enabled:digestEnabled(),delivered:0,failed:0,skipped:0};
  if(!result.enabled) return {...result,schools:0,failedSchools:0};
  const outcomes=await forEachActiveSchool(async()=>{
    const school=await deliverWeeklyDigests(transport);
    result.delivered+=school.delivered;result.failed+=school.failed;result.skipped+=school.skipped;
  });
  return {...result,...outcomes,failed:result.failed+outcomes.failedSchools};
}
