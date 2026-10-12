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
export async function staffCommunity(actor: { id: string; role?: string }) {
  if (!staffRole(actor.role)) throw new CommunityError(403, 'Staff access required.');
  const [reports, requests, work] = await Promise.all([
    supabaseService.from('reports').select('id,reason,submission_id,comment_id,created_at,submission:submissions(title),comment:comments(body,submission_id)').is('resolved_at', null).order('created_at').limit(50),
    supabaseService.from('idea_clarifications').select('id,submission_id,prompt,reply,created_at,replied_at,submission:submissions(title)').is('closed_at', null).order('created_at').limit(50),
    supabaseService.from('staff_stale_work').select('id,title,is_blocked,last_public_update,blocked_since').order('last_public_update').limit(50),
  ]);
  for (const result of [reports, requests, work]) if (result.error) throw result.error;
  return { reports: reports.data || [], requests: requests.data || [], alerts: (work.data || []).map(s => ({ id: s.id, title: s.title, reason: s.is_blocked && s.blocked_since && Date.parse(s.blocked_since)<Date.now()-14*86400000 ? 'Continuously blocked for more than 14 days' : 'No public update for 30 days' })),
    coverage: 'Reminders consider all public school updates. Oldest 50 reminders, open reports and open requests shown in each section.' };
}
