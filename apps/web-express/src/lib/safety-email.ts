import {contentSafetyConfig} from './content-safety-config';
import {requireSchool} from './school-scope';
import {supabasePlatform} from './supabase';
/** Optional existing sender: only generic metadata leaves the app, never submission text. */
export async function deliverSafetyEmail(){
 if(!contentSafetyConfig.notifications.urgentEmail||!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL||!process.env.APP_ORIGIN)return;
 const school=requireSchool();const origin=new URL(process.env.APP_ORIGIN);if(origin.protocol!=='https:')return;
 const notices=await supabasePlatform.from('submission_safety_notices').select('id,user_id').eq('school_id',school.id).eq('kind','urgent').eq('email_state','pending').gte('created_at',new Date(Date.now()-86400000).toISOString()).limit(10);
 if(notices.error){console.error('safety_email_queue_unavailable');return;}
 for(const notice of notices.data||[]){
  const claim=await supabasePlatform.from('submission_safety_notices').update({email_state:'processing'}).eq('school_id',school.id).eq('id',notice.id).eq('email_state','pending').select('id');if(claim.error||!claim.data?.length)continue;
  let state='uncertain';try{
   const role=await supabasePlatform.rpc('school_actor_has_role',{p_school:school.id,p_actor:notice.user_id,p_roles:['admin']});const user=await supabasePlatform.auth.admin.getUserById(notice.user_id);
   if(role.error||user.error)throw new Error('Recipient unavailable');
   if(role.data!==true||!user.data.user.email||!user.data.user.email_confirmed_at)state='cancelled';else{
    const link=new URL('/s/'+school.slug+'/admin/safety',origin);const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'safety-'+notice.id},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[user.data.user.email],subject:'SuggFeed: urgent school review required',text:'An item requires human review in your protected school workspace.\n\n'+link.href+'\n\nUse the school-approved escalation process. No submission content is included in this email.'})});if(response.ok)state='sent';
   }
  }catch{console.error('safety_email_delivery_unconfirmed');}
  await supabasePlatform.from('submission_safety_notices').update({email_state:state}).eq('school_id',school.id).eq('id',notice.id);
 }
}
