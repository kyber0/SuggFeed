import { ProgressError } from './progress-error';
export { ProgressError } from './progress-error';
import { supabase, supabaseService } from './supabase';
import { UUID, validDate } from './staff-workspace';
import { EvidenceFile, listPublicEvidence, listStaffEvidence } from './progress-evidence';

export const PROGRESS_KINDS = ['started', 'update', 'milestone', 'blocked', 'completed', 'correction','resumed','reopened','withdrawn'] as const;
export const BLOCK_REASONS = ['budget', 'parts', 'approval', 'scheduling', 'other'] as const;
export type ProgressKind = typeof PROGRESS_KINDS[number];
export interface ProgressInput {
  requestId: string; updatedAt: string; kind: ProgressKind; body: string;
  visibility: 'public' | 'staff'; percent: number | null; blockedReason: string | null;
  nextStep: string | null; occurredOn: string; notify: boolean;
}
export interface PublicProgress {
  id: string; kind: ProgressKind; body: string; percent: number | null;
  blocked_reason: string | null; next_step: string | null; occurred_on: string;
  office_label: string; created_at: string;
  files: EvidenceFile[];
}
export function manilaToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function validateProgress(input: unknown, now = new Date()): ProgressInput {
  const b = input as Record<string, unknown>;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ProgressError(400, 'Provide a progress update.');
  if (typeof b.requestId !== 'string' || !UUID.test(b.requestId) ||
      typeof b.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(b.updatedAt) || !Number.isFinite(Date.parse(b.updatedAt))) {
    throw new ProgressError(400, 'Refresh the submission before posting this update.');
  }
  if (!PROGRESS_KINDS.includes(b.kind as ProgressKind) || !['public', 'staff'].includes(b.visibility as string)) {
    throw new ProgressError(400, 'Choose an update type and audience.');
  }
  if (b.notify !== undefined && typeof b.notify !== 'boolean') throw new ProgressError(400, 'Choose whether followers should be notified.');
  if (typeof b.body !== 'string' || !b.body.trim() || b.body.trim().length > 600) {
    throw new ProgressError(400, 'Write an update of 1–600 characters.');
  }
  const percent = b.percent === undefined || b.percent === null || b.percent === '' ? null : b.percent;
  if (percent !== null && (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 0 || percent > 100 || percent % 5 !== 0)) {
    throw new ProgressError(400, 'Progress must be a whole number from 0 to 100 in steps of five.');
  }
  if (b.kind === 'completed' && percent !== null && percent !== 100) throw new ProgressError(400, 'Completed updates must show 100% progress.');
  if (b.kind !== 'completed' && percent === 100) throw new ProgressError(400, 'Use Completed to mark an idea 100% complete.');
  const blockedReason = b.blockedReason === undefined || b.blockedReason === null || b.blockedReason === '' ? null : b.blockedReason;
  if ((b.kind === 'blocked' && !BLOCK_REASONS.includes(blockedReason as any)) ||
      (b.kind !== 'blocked' && blockedReason !== null)) throw new ProgressError(400, 'Choose a reason for a blocked update only.');
  if (b.nextStep !== undefined && b.nextStep !== null && typeof b.nextStep !== 'string') throw new ProgressError(400, 'The next step must be text.');
  const nextStep = typeof b.nextStep === 'string' ? b.nextStep.trim() || null : null;
  if (nextStep && nextStep.length > 200) throw new ProgressError(400, 'Keep the next step within 200 characters.');
  const occurredOn = b.occurredOn === undefined ? manilaToday(now) : b.occurredOn;
  const today = manilaToday(now);
  const earliest = new Date(Date.parse(today + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
  if (!validDate(occurredOn) || occurredOn < earliest || occurredOn > today) {
    throw new ProgressError(400, 'Choose today or a date within the last 14 days, using Philippine time.');
  }
  return {
    requestId: b.requestId, updatedAt: b.updatedAt, kind: b.kind as ProgressKind,
    body: b.body.trim(), visibility: b.visibility as 'public' | 'staff', percent: percent as number | null,
    blockedReason: blockedReason as string | null, nextStep, occurredOn,
    notify: b.visibility === 'public' && (typeof b.notify === 'boolean' ? b.notify : ['started', 'milestone', 'blocked', 'completed','resumed','reopened'].includes(b.kind as string)),
  };
}
function publicProgress(row: Record<string, any>, files: EvidenceFile[]): PublicProgress {
  return {
    id: row.id, kind: row.kind, body: row.body, percent: row.percent ?? null,
    blocked_reason: row.blocked_reason ?? null, next_step: row.next_step ?? null,
    occurred_on: row.occurred_on, office_label: row.office_label, created_at: row.created_at,
    files: files.filter(file => file.update_id === row.id),
  };
}
/** The narrowly granted RPC filters the parent publication state and event audience in the database. */
export async function listPublicProgress(id: string): Promise<PublicProgress[]> {
  if (!UUID.test(id)) return [];
  const { data, error } = await supabase.rpc('read_public_idea_updates', { p_submission_id: id });
  if (error) throw error;
  if (!data?.length) return [];
  const files = await listPublicEvidence(id);
  return data.map((row: Record<string, any>) => publicProgress(row, files));
}
/** Only call from an authenticated staff route; the service client bypasses RLS. */
export async function listStaffProgress(id: string, staffId: string) {
  const { data, error } = await supabaseService.from('idea_updates')
    .select('id,kind,body,visibility,percent,blocked_reason,next_step,occurred_on,office_label,created_at,posted_by,request_id')
    .eq('submission_id', id).is('deleted_at', null).order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
  if (error) throw error;
  if (!data?.length) return [];
  const files = await listStaffEvidence(id, staffId);
  return data.map(row => ({ ...row, files: files.filter(file => file.update_id === row.id) }));
}
export async function loadStaffProgressSubmission(id: string) {
  const { data, error } = await supabaseService.from('staff_submission_queue')
    .select('id,status,updated_at,staff_note,assignee_id,priority,target_date,progress_percent,started_at,is_blocked,resolved_at').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ProgressError(404, 'Submission not found.');
  return data;
}
export async function postProgress(id: string, staffId: string, body: unknown) {
  const input = validateProgress(body);
  const { data, error } = await supabaseService.rpc('post_idea_update', {
    p_submission_id: id, p_staff_id: staffId, p_request_id: input.requestId,
    p_expected_updated_at: input.updatedAt, p_kind: input.kind, p_body: input.body,
    p_visibility: input.visibility, p_percent: input.percent, p_blocked_reason: input.blockedReason,
    p_next_step: input.nextStep, p_occurred_on: input.occurredOn,
    p_office_label: (process.env.SCHOOL_OFFICE_LABEL || 'School administration').trim().slice(0, 80) || 'School administration',
    p_notify: input.notify,
  });
  if (error) {
    const workflowCodes:Record<string,[number,string]>={P0101:[409,'Use an available guided action.'],P0102:[409,'An administrator must verify missing work dates first.'],P0103:[503,'Work changes are temporarily paused.'],P0104:[400,'Completion requires ready evidence attached to this update.']};
    if(workflowCodes[error.code])throw new ProgressError(...workflowCodes[error.code],error.code);
    if (error.code === 'PT409' || error.code === '40001') throw new ProgressError(409, 'This submission changed. Refresh it before posting; keep your draft.');
    if (error.code === '23505') throw new ProgressError(409, 'This request was already used for a different update. Refresh and try again.');
    if (error.code === 'P0002') throw new ProgressError(404, 'Submission not found.');
    if (error.code === '42501') throw new ProgressError(403, 'Staff access required.');
    if (error.code === '22023') throw new ProgressError(400, 'Check the update date and progress. Reopen completed ideas before changing their progress; use Correction to decrease progress.');
    throw error;
  }
  return { update: data?.update, submission: await loadStaffProgressSubmission(id), replayed: data?.replayed === true };
}
