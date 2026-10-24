import { supabaseService } from './supabase';

export const NOTIFICATION_PAGE_SIZE = 20;
export const ENGAGEMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_STATUSES = ['approved', 'in_progress', 'resolved'];
const notificationColumns = 'id,submission_id,update_id,kind,title,office_label,created_at,read_at,submission:submissions!inner(status),update:idea_updates!inner(visibility,deleted_at)';

export function parseNotificationCursor(value: unknown): { created_at: string; id: string } | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid notification cursor.');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.created_at !== 'string' || typeof parsed.id !== 'string' || !ENGAGEMENT_UUID.test(parsed.id) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(parsed.created_at) || !Number.isFinite(Date.parse(parsed.created_at))) {
      throw new Error('Invalid notification cursor.');
    }
    return { created_at: parsed.created_at, id: parsed.id };
  } catch { throw new Error('Invalid notification cursor.'); }
}

function encodeNotificationCursor(row: { created_at: string; id: string }) {
  return Buffer.from(JSON.stringify({ created_at: row.created_at, id: row.id }), 'utf8').toString('base64url');
}

function visibleNotifications(userId: string, countOnly = false) {
  return supabaseService.from('idea_notifications').select(notificationColumns, countOnly ? { count: 'exact', head: true } : undefined)
    .eq('user_id', userId).eq('submission.safety_state','clear').in('submission.status', PUBLIC_STATUSES)
    .eq('update.visibility', 'public').is('update.deleted_at', null);
}

export async function loadNotifications(userId: string, cursor: ReturnType<typeof parseNotificationCursor>) {
  let query = visibleNotifications(userId);
  if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
  const [page, unread] = await Promise.all([
    query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(NOTIFICATION_PAGE_SIZE + 1),
    visibleNotifications(userId, true).is('read_at', null),
  ]);
  if (page.error) throw page.error;
  if (unread.error) throw unread.error;
  const rows = page.data || [];
  const notifications = rows.slice(0, NOTIFICATION_PAGE_SIZE).map(row => ({
    id: row.id, submission_id: row.submission_id, update_id: row.update_id, kind: row.kind,
    title: row.title, office_label: row.office_label, created_at: row.created_at, read_at: row.read_at || null,
  }));
  return { notifications, unreadCount: unread.count || 0,
    nextCursor: rows.length > NOTIFICATION_PAGE_SIZE ? encodeNotificationCursor(notifications[notifications.length - 1]) : null };
}

export async function loadFollowing(userId: string, submissionId: string) {
  const { data: idea, error: ideaError } = await supabaseService.from('submissions').select('id')
    .eq('id', submissionId).eq('safety_state','clear').in('status', PUBLIC_STATUSES).maybeSingle();
  if (ideaError) throw ideaError;
  if (!idea) return null;
  const { data, error } = await supabaseService.from('idea_follows').select('submission_id')
    .eq('user_id', userId).eq('submission_id', submissionId).maybeSingle();
  if (error) throw error;
  return !!data;
}
