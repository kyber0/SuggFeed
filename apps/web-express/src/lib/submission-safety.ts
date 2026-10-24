import {supabaseService} from './supabase';
import {CommunityError,idField,textField} from './community';
import {contentSafetyConfig} from './content-safety-config';
import {invalidateCache} from './data';
export async function safetyAction(action:string,data:Record<string,unknown>={}){
 const result=await supabaseService.rpc('submission_safety_action',{p_action:action,p_data:data});
 if(result.error)throw new CommunityError(result.error.code==='PT429'?429:result.error.code==='42501'?403:result.error.code==='P0002'?404:result.error.code==='40001'?409:result.error.code==='22023'?400:503,result.error.code==='PT429'?'Too many requests. Please wait before trying again.':result.error.code==='40001'?'This item changed. Refresh before reviewing again.':result.error.code==='42501'?'This action is not allowed.':'The action could not finish. Please try again.');
 if(!['queue','analytics','audit','notices','recipients','owner-read','notice-read'].includes(action))for(const key of ['feed_','submission_','roadmap','published_count_'])invalidateCache(key);
 return result.data;
}
export function reportSubmission(id:unknown,reason:unknown){return safetyAction('report',{id:idField(id),reason:typeof reason==='string'&&reason.trim()?textField(reason,1,500):'Reported for school administrator review.',policy:{...contentSafetyConfig.reports,reportThreshold:contentSafetyConfig.submissions.reportThreshold}});}
