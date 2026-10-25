import {supabaseService} from './supabase';
export function studentIdeaState(item:{status?:string;safety_state?:string;editable?:boolean;review_started_at?:unknown},labels:Record<string,string>={}){
 if(item.safety_state==='deleted')return {label:'Text removed',detail:'Your school has removed this submission text. Check your private review decisions.',tone:'muted'};
 if(item.safety_state==='hidden')return {label:'Kept private',detail:'This idea is private following a school review. Check your review decisions.',tone:'muted'};
 if(item.safety_state==='flagged')return {label:'Private review',detail:'Your idea was received and is awaiting a private safety review.',tone:'review'};
 if(item.status==='pending')return item.review_started_at||item.editable===false?{label:'Under review',detail:'School staff have started reviewing your idea. Watch for private questions.',tone:'review'}:{label:'Awaiting decision',detail:'Your idea was received. School staff have not recorded a decision yet.',tone:'review'};
 const defaults:Record<string,string>={approved:'Planned',in_progress:'In progress',resolved:'Completed',rejected:'Declined'};
 const details:Record<string,string>={approved:'Approved for planning. School updates explain the next steps.',in_progress:'Work is underway. Read the latest school update for verified progress.',resolved:'The school has recorded completion. Read the update and evidence.',rejected:'The school has recorded a decision. Check your private updates for its explanation.'};
 return {label:labels[item.status||'']||defaults[item.status||'']||'Received',detail:details[item.status||'']||'Check your private submission status for the latest information.',tone:item.status==='resolved'?'success':item.status==='rejected'?'muted':'progress'};
}
/** Only identified owner records are used here; never attach anonymous receipts to an account. */
export async function studentHomeBrief(actor:string){
 const [recent,attention]=await Promise.all([
  supabaseService.from('submissions').select('id,title,status,safety_state,review_started_at,created_at').eq('user_id',actor).order('created_at',{ascending:false}).limit(3),
  supabaseService.from('idea_clarifications').select('id,submission:submissions!inner(user_id)',{count:'exact',head:true}).eq('submission.user_id',actor).is('closed_at',null).is('reply',null),
 ]);
 return {items:recent.error?[]:recent.data||[],itemsUnavailable:!!recent.error,needsReply:attention.error?null:attention.count??0};
}

export async function studentIdeasPage(actor:string,input:unknown){
 let page=typeof input==='string'&&/^\d{1,6}$/.test(input)?Math.max(1,Number(input)):1;
 const query=(head=false)=>supabaseService.from('submissions').select('id,title,description,status,safety_state,review_started_at,vote_count,created_at,categories(name)',{count:'exact',head}).eq('user_id',actor);
 for(let attempt=0;attempt<3;attempt++){
  const result=await query().order('created_at',{ascending:false}).order('id').range((page-1)*15,page*15-1);
  if(result.error&&result.error.code!=='PGRST103')throw result.error;
  let total=result.count;if(result.error){const count=await query(true);if(count.error)throw count.error;total=count.count;}
  const pages=Math.max(1,Math.ceil((total||0)/15));if(page>pages){page=pages;continue;}
  return {items:result.data||[],page,pages,total:total||0};
 }
 throw new Error('Your ideas changed while loading. Refresh to retry.');
}
