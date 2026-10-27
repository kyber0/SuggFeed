import type {Request,Response} from 'express';
import {requireSchool,schoolUser} from './school-scope';
import {supabasePlatform} from './supabase';
import {submissionContext} from './submission-context';

export async function staffSubmissionAccess(req:Request,id:string|null):Promise<boolean>{
 const school=requireSchool(),user=schoolUser(req);
 if(!user||!['admin','moderator'].includes(user.role||''))return false;
 const result=await supabasePlatform.rpc('assignment_can_access',{p_school:school.id,p_actor:user.id,p_kind:'suggestion',p_id:id});
 if(result.error)throw Object.assign(new Error('Private submission permissions unavailable.'),{status:503});
 return result.data===true;
}
/** Ownership and receipt access are independent of staff assignment privileges. */
export async function privateSubmission(req:Request,id:string){
 const school=requireSchool();
 const result=await supabasePlatform.from('submissions').select('id,title,user_id,form_version_id').eq('school_id',school.id).eq('id',id).maybeSingle();
 if(result.error)throw result.error;if(!result.data)return null;
 const user=schoolUser(req);
 if(user&&result.data.user_id===user.id)return result.data;
 const context=submissionContext(req,{} as Response);
 if(context){
  const receipt=await supabasePlatform.from('submission_receipts').select('request_id').eq('school_id',school.id).eq('submission_id',id).eq('owner_hash',context.actor).limit(1);
  if(receipt.error)throw receipt.error;if(receipt.data?.length)return result.data;
 }
 return await staffSubmissionAccess(req,id)?result.data:null;
}
