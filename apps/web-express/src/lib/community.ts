import { createHash } from 'crypto';
import { supabaseService, supabase } from './supabase';
import { ENGAGEMENT_UUID } from './engagement';
import { staffRole } from './staff-workspace';

export class CommunityError extends Error { constructor(public status: number, message: string) { super(message); } }
export function textField(value: unknown, min = 10, max = 2000): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new CommunityError(400, `Enter ${min}–${max} characters.`);
  return value.trim();
}
export function idField(value: unknown): string {
  if (typeof value !== 'string' || !ENGAGEMENT_UUID.test(value)) throw new CommunityError(400, 'Choose a valid idea or request.');
  return value;
}

// Routes own HTTP/session handling; feature readers own field selection,
// visibility rules and database access. Never return private tracking fields.
export async function loadReportDecisions(actorId: string) {
  const { data, error } = await supabaseService.from('reports')
    .select('id,reason,resolution,resolution_reason,created_at,resolved_at')
    .eq('user_id', actorId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

export async function loadPublicMergeHistory(input: unknown) {
  const id = idField(input);
  const publicIdea = await supabaseService.from('submissions').select('id')
    .eq('id', id).in('status', ['approved', 'in_progress', 'resolved']).maybeSingle();
  if (publicIdea.error) throw publicIdea.error;
  if (!publicIdea.data) throw new CommunityError(404, 'Idea unavailable.');
  const { data, error } = await supabaseService.from('idea_merges')
    .select('source_title,reason,created_at').eq('target_id', id).order('created_at').limit(50);
  if (error) throw error;
  return data || [];
}

export async function loadCommunityStaffIdea(actor: { role?: string }, input: unknown) {
  if (!staffRole(actor.role)) throw new CommunityError(403, 'Staff access required.');
  const id = idField(input);
  const { data, error } = await supabaseService.from('submissions')
    .select('id,title,status,updated_at').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new CommunityError(404, 'Idea unavailable.');
  return data;
}
export function trackingHashes(value: unknown): string[] {
  if (typeof value !== 'string' || !/^CV-[A-F0-9]{32}$/i.test(value.trim())) throw new CommunityError(400, 'Enter the full private tracking code.');
  const code = value.trim().toUpperCase();
  return [code, code.slice(3)].map(x => createHash('sha256').update(x).digest('hex'));
}
export async function communityAction(actor: string | null, action: string, data: Record<string, unknown>) {
  const result = await supabaseService.rpc('community_action', { p_actor: actor, p_action: action, p_data: data });
  if (result.error) {
    const code = result.error.code;
    throw new CommunityError(code === '42501' ? 403 : code === 'P0002' ? 404 : code === '40001' ? 409 : code === '22023' || code === '23514' ? 400 : 500,
      code === '40001' ? 'This item changed or already has an open request. Refresh and review it again.' : code === 'P0002' ? 'This item is unavailable.' : code === '42501' ? 'Access denied.' : code === '22023' || code === '23514' ? 'Check your selection and required fields.' : 'The change could not be saved. Please try again.');
  }
  return result.data;
}
export async function privateInbox(actor: string | null, code?: unknown) {
  let query = supabaseService.from('submissions').select('id,title,status,anonymous_tracking_hash');
  if (code) query = query.is('user_id', null).in('anonymous_tracking_hash', trackingHashes(code));
  else if (actor) query = query.eq('user_id', actor);
  else throw new CommunityError(401, 'Sign in or use your private tracking code.');
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  if (code && !data?.length) throw new CommunityError(404, 'No submission found for this code.');
  if (!data?.length) return [];
  const requests = await supabaseService.from('idea_clarifications').select('id,submission_id,prompt,reply,created_at,replied_at,closed_at')
    .in('submission_id', data.map(s => s.id)).order('created_at', { ascending: false }).limit(100);
  if (requests.error) throw requests.error;
  return (requests.data || []).map(r => ({ ...r, title: data.find(s => s.id === r.submission_id)?.title }));
}
export async function replyToClarification(actor: string | null, input: any) {
  const id = idField(input.id), body = textField(input.body);
  let trackingHash: string | null = null;
  if (input.trackingCode) {
    const hashes = trackingHashes(input.trackingCode);
    const request = await supabaseService.from('idea_clarifications').select('submission_id').eq('id', id).maybeSingle();
    if (request.error) throw request.error;
    if (!request.data) throw new CommunityError(404, 'This item is unavailable.');
    const owner = await supabaseService.from('submissions').select('anonymous_tracking_hash').eq('id', request.data.submission_id).is('user_id', null).in('anonymous_tracking_hash', hashes).maybeSingle();
    if (owner.error) throw owner.error;
    if (!owner.data) throw new CommunityError(404, 'This item is unavailable.');
    trackingHash = owner.data.anonymous_tracking_hash;
  }
  if (!actor && !trackingHash) throw new CommunityError(401, 'Sign in or enter your private tracking code.');
  return communityAction(actor, 'reply', { id, body, trackingHash });
}
export async function similarIdeas(input: unknown) {
  const text = typeof input === 'string' ? input.trim().slice(0, 120) : '';
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(x => !['the','and','for','with','add','our','more','that'].includes(x)).slice(0, 5) || [];
  if (!words.length) return [];
  // Bounded public-only keyword matches, not a fabricated similarity score.
  const clauses = words.map(word => `title.ilike.%${word.replace(/[^a-z0-9]/g, '')}%`).filter(x => !x.endsWith('.%%'));
  if (!clauses.length) return [];
  const { data, error } = await supabase.from('submissions').select('id,title,status,vote_count').in('status', ['approved','in_progress','resolved']).or(clauses.join(','))
    .order('vote_count', { ascending: false }).limit(5);
  if (error) throw error;
  return data || [];
}
export async function staffCommunity(actor: { id: string; role?: string }, input:Record<string,unknown>={},attempt=0):Promise<any> {
  if (!staffRole(actor.role)) throw new CommunityError(403, 'Staff access required.');
  const page=(key:string)=>typeof input[key]==='string' && /^\d+$/.test(input[key] as string)?Math.min(100000,Math.max(1,Number(input[key]))):1;
  const pages={reports:page('reportsPage'),clarifications:page('clarificationsPage'),attention:page('attentionPage')};
  const section=['reports','clarifications','attention'].includes(String(input.section))?String(input.section):input.idea?'clarifications':'reports';
  const [reports, requests, work] = await Promise.all([
    supabaseService.from('reports').select('id,reason,submission_id,comment_id,created_at,submission:submissions(title),comment:comments(body,submission_id)',{count:'exact'}).is('resolved_at', null).order('created_at').order('id').range((pages.reports-1)*25,pages.reports*25-1),
    supabaseService.from('idea_clarifications').select('id,submission_id,prompt,reply,created_at,replied_at,submission:submissions(title)',{count:'exact'}).is('closed_at', null).order('created_at').order('id').range((pages.clarifications-1)*25,pages.clarifications*25-1),
    supabaseService.from('staff_stale_work').select('id,title,is_blocked,last_public_update,blocked_since',{count:'exact'}).order('last_public_update').order('id').range((pages.attention-1)*25,pages.attention*25-1),
  ]);
  const results=[reports,requests,work], keys=['reports','clarifications','attention'] as const;
  // Recount an invalid PostgREST range before clamping. Never label page 99 of 1.
  let retryRange=false;
  for(let index=0;index<results.length;index++)if(results[index].error?.code==='PGRST103'){
    const key=keys[index];let query=supabaseService.from(key==='reports'?'reports':key==='clarifications'?'idea_clarifications':'staff_stale_work').select('id',{count:'exact',head:true});
    if(key!=='attention')query=query.is(key==='reports'?'resolved_at':'closed_at',null);
    const counted=await query;if(counted.error)throw counted.error;
    results[index].count=counted.count;results[index].error=null;retryRange ||= !!counted.count;
  }
  const clamped=Object.fromEntries(keys.map((key,index)=>[key+'Page',String(Math.min(pages[key],Math.max(1,Math.ceil((results[index].count || 0)/25))))]));
  if(retryRange || keys.some(key=>String(pages[key])!==clamped[key+'Page'])){
    if(attempt>=2)throw new CommunityError(503,'Follow-ups changed while loading. Refresh to retry.');
    return staffCommunity(actor,{...input,...clamped},attempt+1);
  }
  for (const result of [reports, requests, work]) if (result.error) throw result.error;
  return { reports: reports.data || [], requests: requests.data || [], alerts: (work.data || []).map(s => ({ id: s.id, title: s.title, reason: s.is_blocked && s.blocked_since && Date.parse(s.blocked_since)<Date.now()-14*86400000 ? 'Continuously blocked for more than 14 days' : 'No public update for 30 days' })),
    section,pages,counts:{reports:reports.count || 0,clarifications:requests.count || 0,attention:work.count || 0},
    coverage: 'Counts cover all matching records. Each view shows up to 25 records per page; reminders use public updates, not private edits.' };
}
