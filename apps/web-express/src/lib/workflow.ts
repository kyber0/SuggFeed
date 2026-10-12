import {supabaseService} from './supabase';
import {ProgressError, validateProgress, manilaToday} from './progress';
import {UUID,validDate} from './staff-workspace';
export const WORK_ACTIONS=['approve','decline','start','update','milestone','pause','resume','complete','correction','reopen','withdraw'] as const;
export type WorkAction=typeof WORK_ACTIONS[number];
export interface WorkflowContext {mode:'guided'|'preview';paused:boolean;allowedActions:WorkAction[];issues:string[];canRepair:boolean;}
export class WorkflowError extends ProgressError {constructor(status:number,message:string,public code:string){super(status,message);}}
export function workflowError(error:any):never {
  const known:Record<string,[number,string,string]>={P0101:[409,'Use an available guided action for this submission.','WORKFLOW_ACTION_REQUIRED'],P0102:[409,'An administrator must verify the missing work dates first.','WORK_DATES_REQUIRED'],P0103:[503,'Work changes are temporarily paused. Reading and private follow-ups remain available.','LIFECYCLE_PAUSED'],P0104:[400,'Completion requires ready evidence attached to this update.','COMPLETION_EVIDENCE_REQUIRED'],
    '40001':[409,'This submission changed. Refresh its details; keep your draft.','VERSION_CONFLICT'],'23505':[409,'This request ID was already used. Keep your draft and refresh.','REQUEST_CONFLICT'],P0002:[404,'Submission not found.','NOT_FOUND'],'42501':[403,'Your current role cannot perform this action.','FORBIDDEN'],'22023':[400,'Check the action, dates, explanation and evidence.','INVALID_ACTION']};
  const mapped=known[error?.code];if(mapped)throw new WorkflowError(...mapped);
  throw error;
}
export async function workflowContext(id:string,actor:string):Promise<WorkflowContext>{
  const {data,error}=await supabaseService.rpc('staff_workflow_context',{p_submission_id:id,p_actor_id:actor});
  if(error)workflowError(error);return data as WorkflowContext;
}
const kindFor:Record<WorkAction,string>={approve:'update',decline:'update',start:'started',update:'update',milestone:'milestone',pause:'blocked',resume:'resumed',complete:'completed',correction:'correction',reopen:'reopened',withdraw:'withdrawn'};
export function validateAction(body:any){
  if(!body || !WORK_ACTIONS.includes(body.action))throw new WorkflowError(400,'Choose a valid workflow action.','INVALID_ACTION');
  const action=body.action as WorkAction;
  return {action,input:validateProgress({...body,kind:kindFor[action],visibility:'public'})};
}
export async function performAction(id:string,actor:string,body:unknown){
  const {action,input}=validateAction(body);
  const {data,error}=await supabaseService.rpc('perform_workflow_action',{p_submission_id:id,p_actor_id:actor,p_request_id:input.requestId,p_expected_updated_at:input.updatedAt,
    p_action:action,p_body:input.body,p_occurred_on:input.occurredOn,p_percent:input.percent,p_blocked_reason:input.blockedReason,p_next_step:input.nextStep,
    p_office_label:(process.env.SCHOOL_OFFICE_LABEL || 'School administration').slice(0,80),p_notify:input.notify});
  if(error)workflowError(error);
  return {replayed:data?.replayed===true,submission:data.submission,workflow:data.workflow};
}
export function validateRepair(body:any){
  if(!body || !UUID.test(body.requestId || '') || !Number.isFinite(Date.parse(body.updatedAt)) || !validDate(body.startedOn) || body.startedOn>manilaToday()
    || (body.completedOn && (!validDate(body.completedOn) || body.completedOn<body.startedOn || body.completedOn>manilaToday()))
    || typeof body.source!=='string' || !body.source.trim() || body.source.length>2000 || typeof body.reason!=='string' || !body.reason.trim() || body.reason.length>600)
    throw new WorkflowError(400,'Provide verified dates, a private source/reference and a repair reason.','INVALID_REPAIR');
  return {...body,source:body.source.trim(),reason:body.reason.trim(),completedOn:body.completedOn || null};
}
export async function repairDates(id:string,actor:string,body:any){
  const b=validateRepair(body);const {data,error}=await supabaseService.rpc('repair_work_dates',{p_submission_id:id,p_actor_id:actor,p_request_id:b.requestId,p_expected_updated_at:b.updatedAt,p_started_on:b.startedOn,p_completed_on:b.completedOn,p_source:b.source,p_reason:b.reason});
  if(error)workflowError(error);return {replayed:data?.replayed===true,submission:data.submission,workflow:data.workflow};
}
