import type { Request, Response, NextFunction } from 'express';
import { supabaseService } from './supabase';
import { schoolUser } from './school-scope';
import { fetchWithCache } from './data';
import {ENGAGEMENT_UUID} from './engagement';

// Read-only UI state, keyed by the account in the encrypted server session.
// Auth/roles are still checked freshly before returning a response.
export function loadBookmarkIds(userId:string):Promise<string[]>{
  return fetchWithCache('account_bookmarks_'+userId,async()=>{
    const {data,error}=await supabaseService.from('bookmarks').select('submission_id').eq('user_id',userId);
    if(error)throw error;
    return (data || []).map(row=>row.submission_id as string);
  },10_000);
}
export function loadSavedSearches(userId:string){
  return fetchWithCache('account_searches_'+userId,async()=>{
    const {data,error}=await supabaseService.from('student_saved_searches').select('id,name,filters').eq('user_id',userId).order('created_at');
    if(error)throw error;
    return data || [];
  },10_000);
}
export async function readFeedAccountState(userId:string){
  // Keep the public feed usable even if one optional account section fails.
  const [bookmarks,searches]=await Promise.allSettled([loadBookmarkIds(userId),loadSavedSearches(userId)]);
  return {userId,bookmarks:bookmarks.status==='fulfilled'?bookmarks.value:null,
    searches:searches.status==='fulfilled'?searches.value:null};
}
export function startFeedAccountState(req:Request,res:Response,next:NextFunction){
  const userId=schoolUser(req)?.id;
  if(req.method==='GET' && /^\/feed\/?$/.test(req.path) && userId){
    res.locals.feedAccountOwner=userId;
    res.locals.feedAccountPending=readFeedAccountState(userId);
  }
  next();
}
export async function verifiedFeedAccountState(req:Request,res:Response){
  const userId=schoolUser(req)?.id;
  if(!userId || res.locals.feedAccountOwner!==userId || !res.locals.feedAccountPending)return null;
  const started=performance.now();
  let timer:ReturnType<typeof setTimeout> | undefined;
  const pending=res.locals.feedAccountPending as ReturnType<typeof readFeedAccountState>;
  const state=await Promise.race([pending,new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),120);})]);
  if(timer)clearTimeout(timer);
  res.append('Server-Timing',`account;dur=${(performance.now()-started).toFixed(1)}`);
  // A slow optional section must not hold up the public feed. The old verified
  // endpoints remain available when the snapshot is missing or too large.
  if(!state || state.userId!==userId)return null;
  return {...state,bookmarks:JSON.stringify(state.bookmarks).length<=64*1024?state.bookmarks:null};
}

/** Public cards need fresh account/device support state, never a shared cache. */
export async function feedVoteState(req:Request,ids:string[]){
 const user=schoolUser(req),token=req.cookies?.sf_anon_token;
 if(!ids.length||(!user&&(typeof token!=='string'||!ENGAGEMENT_UUID.test(token))))return {votedIds:[],voteStateKnown:true};
 try{
  let query=supabaseService.from('votes').select('submission_id').in('submission_id',ids);
  query=user?query.eq('user_id',user.id):query.is('user_id',null).eq('anon_token',token);
  const {data,error}=await query;if(error)throw error;
  return {votedIds:(data||[]).map(row=>String(row.submission_id)),voteStateKnown:true};
 }catch{console.warn('feed_vote_state_unavailable');return {votedIds:[],voteStateKnown:false};}
}
