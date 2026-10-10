import { Router, Request, Response, NextFunction } from 'express';
import { supabaseService } from '../lib/supabase';
import { invalidateCache, MODERATION_STATUSES } from '../lib/data';
import { PRIORITIES, UUID, staffRole, validDate, queueFilters } from '../lib/staff-workspace';

const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!req.session.user) return res.status(401).json({ success: false, error: 'Sign in to the staff portal.' });
  if (!staffRole(req.session.user.role)) return res.status(403).json({ success: false, error: 'Staff access required.' });
  next();
});
router.param('id', (_req, res, next, id) => {
  if (!UUID.test(id)) return res.status(400).json({ success: false, error: 'Invalid ID.' });
  next();
});
router.patch('/submissions/:id/review', run(async (req, res) => {
  const { status, note, assignee, priority, targetDate, updatedAt } = req.body;
  if (typeof status !== 'string' || !MODERATION_STATUSES.some(s => s === status) ||
      typeof note !== 'string' || note.length > 2000 ||
      (assignee !== null && (typeof assignee !== 'string' || !UUID.test(assignee))) ||
      !PRIORITIES.some(p => p === priority) || (targetDate !== null && !validDate(targetDate)) ||
      typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) {
    return res.status(400).json({ success: false, error: 'Check the status, response, assignee, priority, and date.' });
  }
  const { error } = await supabaseService.rpc('save_staff_review', {
    p_submission_id: req.params.id, p_staff_id: req.session.user!.id,
    p_expected_updated_at: updatedAt, p_status: status, p_note: note.trim(),
    p_assignee_id: assignee, p_priority: priority, p_target_date: targetDate,
  });
  if (error) {
    const code = error.code;
    if (code === '40001') return res.status(409).json({ success: false, error: 'This submission changed. Refresh the queue before saving; copy your draft first.' });
    if (code === 'P0002') return res.status(404).json({ success: false, error: 'Submission not found.' });
    if (code === '42501') return res.status(403).json({ success: false, error: 'Staff access required.' });
    if (code === '22023') return res.status(400).json({ success: false, error: 'Choose an active staff assignee and valid review values.' });
    throw error;
  }
  invalidateCache(`submission_${req.params.id}`); invalidateCache('feed_'); invalidateCache('roadmap_submissions');
  return res.json({ success: true });
}));
router.get('/submissions/:id/activity', run(async (req, res) => {
  const id = req.params.id;
  const results = await Promise.all([
    supabaseService.from('status_history').select('id,old_status,new_status,note,created_at').eq('submission_id', id).order('created_at', { ascending: false }).limit(100),
    supabaseService.from('staff_workflow_history').select('id,previous,current,created_at,actor:profiles!actor_id(display_name)').eq('submission_id', id).order('created_at', { ascending: false }).limit(100),
    supabaseService.from('staff_internal_notes').select('id,body,created_at,actor:profiles!actor_id(display_name)').eq('submission_id', id).order('created_at', { ascending: false }).limit(100),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return res.json({ success: true, transitions: results[0].data, history: results[1].data, notes: results[2].data, limit: 100 });
}));
router.post('/submissions/:id/notes', run(async (req, res) => {
  if (typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.length > 2000) {
    return res.status(400).json({ success: false, error: 'Write a note of 1–2,000 characters.' });
  }
  const { error } = await supabaseService.from('staff_internal_notes').insert({ submission_id: req.params.id, actor_id: req.session.user!.id, body: req.body.body.trim() });
  if (error?.code === '23503') return res.status(404).json({ success: false, error: 'Submission not found.' });
  if (error) throw error;
  return res.status(201).json({ success: true });
}));
router.post('/views', run(async (req, res) => {
  if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 60 ||
      !req.body.filters || typeof req.body.filters !== 'object' || Array.isArray(req.body.filters)) {
    return res.status(400).json({ success: false, error: 'Give the view a name of 1–60 characters.' });
  }
  const { error } = await supabaseService.rpc('save_staff_view', { p_staff_id: req.session.user!.id, p_name: req.body.name.trim(), p_filters: queueFilters(req.body.filters) });
  if (error?.code === '23505' || error?.code === '22023') return res.status(400).json({ success: false, error: 'Use a unique name. You can save up to ten views.' });
  if (error) throw error;
  return res.status(201).json({ success: true });
}));
router.delete('/views/:id', run(async (req, res) => {
  const { error } = await supabaseService.from('staff_saved_views').delete().eq('id', req.params.id).eq('owner_id', req.session.user!.id);
  if (error) throw error;
  return res.json({ success: true });
}));
export default router;
