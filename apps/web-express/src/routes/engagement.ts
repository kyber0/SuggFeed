import { Router } from 'express';
import { supabaseService } from '../lib/supabase';
import { ENGAGEMENT_UUID, loadFollowing, loadNotifications, parseNotificationCursor } from '../lib/engagement';

const router = Router();
router.use(['/follows', '/notifications'], (req, res, next) => {
  if (!req.session.user?.id) { res.status(401).json({ success: false, error: 'Sign in to follow ideas and view notifications.' }); return; }
  next();
});

router.get('/follows/:id', async (req, res, next) => {
  try {
    if (!ENGAGEMENT_UUID.test(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid idea ID.' }); return; }
    const following = await loadFollowing(req.session.user!.id, req.params.id);
    if (following === null) { res.status(404).json({ success: false, error: 'Idea not found or no longer public.' }); return; }
    res.json({ success: true, following });
  } catch (error) { next(error); }
});

router.post('/follows/:id', async (req, res, next) => {
  try {
    if (!ENGAGEMENT_UUID.test(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid idea ID.' }); return; }
    if (typeof req.body?.following !== 'boolean') { res.status(400).json({ success: false, error: 'Following must be true or false.' }); return; }
    const { error } = await supabaseService.rpc('set_idea_follow', {
      p_user_id: req.session.user!.id, p_submission_id: req.params.id, p_following: req.body.following,
    });
    if (error?.code === 'P0002') { res.status(404).json({ success: false, error: 'Idea not found or no longer public.' }); return; }
    if (error?.code === '42501') { res.status(401).json({ success: false, error: 'Sign in again to follow ideas.' }); return; }
    if (error) throw error;
    res.json({ success: true, following: req.body.following });
  } catch (error) { next(error); }
});

router.get('/notifications', async (req, res, next) => {
  let cursor: ReturnType<typeof parseNotificationCursor>;
  try { cursor = parseNotificationCursor(req.query.cursor); }
  catch { res.status(400).json({ success: false, error: 'Invalid notification cursor.' }); return; }
  try { res.json({ success: true, ...await loadNotifications(req.session.user!.id, cursor) }); }
  catch (error) { next(error); }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    if (!ENGAGEMENT_UUID.test(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid notification ID.' }); return; }
    const { data, error } = await supabaseService.rpc('mark_idea_notification_read', {
      p_user_id: req.session.user!.id, p_notification_id: req.params.id,
    });
    if (error) throw error;
    if (!data) { res.status(404).json({ success: false, error: 'Notification not found.' }); return; }
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
