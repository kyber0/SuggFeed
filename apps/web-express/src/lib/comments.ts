import {supabaseService} from './supabase';
import {CommunityError,idField,textField} from './community';
import {assessComment} from './comment-moderation';
import {commentModerationConfig} from './comment-moderation-config';
import {invalidateCache} from './data';

export async function commentAction(action:string,data:Record<string,unknown>) {
 const {data:result,error}=await supabaseService.rpc('comment_action',{p_action:action,p_data:data});
 if(error) throw new CommunityError(error.code==='42501'?403:error.code==='P0002'?404:error.code==='40001'?409:error.code==='22023'||error.code==='23514'?400:503,
  error.code==='40001'?'This comment changed. Refresh before trying again.':error.code==='42501'?'This comment action is not allowed.':error.code==='P0002'?'This comment is unavailable.':'The comment action could not finish. Please try again.');
 if(['create','edit','report','approve','hide','delete'].includes(action))for(const key of ['comments_','submission_','feed_','roadmap'])invalidateCache(key);
 return result;
}
export async function saveComment(input:{body:unknown;submissionId?:unknown;parentId?:unknown;anonToken?:string|null;displayName?:string;id?:unknown;version?:unknown}) {
 const body=textField(input.body,10,500),assessment=assessComment(body),status=assessment.status;
 if(status==='rejected')throw new CommunityError(422,'Please revise your comment to keep the discussion respectful.');
 if(input.id && (!Number.isSafeInteger(input.version)||Number(input.version)<1))throw new CommunityError(400,'Refresh the comment before editing.');
 return commentAction(input.id?'edit':'create',{body,status,assessment,...(input.id?{id:idField(input.id),version:input.version}:{submissionId:idField(input.submissionId),parentId:input.parentId?idField(input.parentId):null,anonToken:input.anonToken,displayName:input.displayName})});
}
export function reportComment(id:unknown,reason:unknown,revision?:unknown) {
 if(!Number.isSafeInteger(revision)||Number(revision)<1)throw new CommunityError(400,'Refresh the discussion before reporting.');
 return commentAction('report',{commentId:idField(id),body:textField(reason,10,500),threshold:commentModerationConfig.reportThreshold,textRevision:revision});
}
export async function commentReviewQueue(input:unknown,view:unknown){
 const page=typeof input==='string'&&/^\d{1,6}$/.test(input)?Math.max(1,Number(input)):1;
 const section=['needs-review','reported','resolved'].includes(String(view))?String(view):'needs-review';
 return commentAction('queue',{page,view:section});
}
export async function ownCommentUpdates(submissionId?:unknown){
 return commentAction('mine',submissionId?{submissionId:idField(submissionId)}:{});
}
