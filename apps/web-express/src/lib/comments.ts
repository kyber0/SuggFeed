import {supabaseService} from './supabase';
import {CommunityError,idField,textField} from './community';
import {commentVerdict} from './comment-moderation';
import {commentModerationConfig} from './comment-moderation-config';
import {invalidateCache} from './data';

export async function commentAction(action:string,data:Record<string,unknown>) {
 const {data:result,error}=await supabaseService.rpc('comment_action',{p_action:action,p_data:data});
 if(error) throw new CommunityError(error.code==='42501'?403:error.code==='P0002'?404:error.code==='40001'?409:error.code==='22023'||error.code==='23514'?400:503,
  error.code==='40001'?'This comment changed. Refresh before trying again.':error.code==='42501'?'This comment action is not allowed.':error.code==='P0002'?'This comment is unavailable.':'The comment action could not finish. Please try again.');
 for(const key of ['comments_','submission_','feed_','roadmap'])invalidateCache(key);
 return result;
}
export async function saveComment(input:{body:unknown;submissionId?:unknown;parentId?:unknown;anonToken?:string|null;displayName?:string;id?:unknown;version?:unknown}) {
 const body=textField(input.body,10,500),status=commentVerdict(body);
 if(status==='rejected')throw new CommunityError(422,'Please revise your comment to keep the discussion respectful.');
 if(input.id && (!Number.isSafeInteger(input.version)||Number(input.version)<1))throw new CommunityError(400,'Refresh the comment before editing.');
 return commentAction(input.id?'edit':'create',{body,status,...(input.id?{id:idField(input.id),version:input.version}:{submissionId:idField(input.submissionId),parentId:input.parentId?idField(input.parentId):null,anonToken:input.anonToken,displayName:input.displayName})});
}
export function reportComment(id:unknown,reason:unknown) {
 return commentAction('report',{commentId:idField(id),body:textField(reason,10,500),threshold:commentModerationConfig.reportThreshold});
}
export async function commentReviewQueue(input:unknown){
 const requested=typeof input==='string'&&/^\d{1,6}$/.test(input)?Math.max(1,Number(input)):1;
 const columns='id,submission_id,body,display_name,created_at,moderation_status,version,open_report_count';
 let result=await supabaseService.from('comment_moderation_queue').select(columns,{count:'exact'}).order('created_at').order('id').range((requested-1)*25,requested*25-1);
 if(result.error&&result.error.code!=='PGRST103')throw result.error;
 let count=result.count||0;
 if(result.error){const counted=await supabaseService.from('comment_moderation_queue').select('id',{head:true,count:'exact'});if(counted.error)throw counted.error;count=counted.count||0;if(!count)return {items:[],page:1,count:0};}
 const page=Math.min(requested,Math.max(1,Math.ceil(count/25)));
 if(page!==requested)result=await supabaseService.from('comment_moderation_queue').select(columns,{count:'exact'}).order('created_at').order('id').range((page-1)*25,page*25-1);
 if(result.error)throw result.error;
 return {items:result.data||[],page,count:result.count||0};
}
