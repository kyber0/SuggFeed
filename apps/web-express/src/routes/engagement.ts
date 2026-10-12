import { Router } from 'express';
import { supabaseService } from '../lib/supabase';
import { ENGAGEMENT_UUID, loadFollowing, loadNotifications, parseNotificationCursor } from '../lib/engagement';
import { digestEnabled } from '../lib/digests';

const router = Router();
router.use(['/follows', '/notifications'], (req, res, next) => {
  // These responses are account-private, even when this router is mounted by a
  // host other than the main server. Do not cache identities or unread counts.
  res.setHeader('Cache-Control', 'private, no-store');
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

router.get('/notifications/preferences',async(req,res,next)=>{
  try {const {data,error}=await supabaseService.from('notification_preferences').select('update_mode,weekly_digest').eq('user_id',req.session.user!.id).maybeSingle();if(error) throw error;res.json({success:true,preferences:data || {update_mode:'all',weekly_digest:false},digestAvailable:digestEnabled()});}catch(e){next(e);}
});
router.post('/notifications/preferences',async(req,res,next)=>{
  if(!['all','milestones'].includes(req.body.update_mode) || typeof req.body.weekly_digest!=='boolean') return res.status(400).json({success:false,error:'Choose valid notification preferences.'});
  try {
    if(req.body.weekly_digest) {
      const previous=await supabaseService.from('notification_preferences').select('weekly_digest').eq('user_id',req.session.user!.id).maybeSingle();if(previous.error) throw previous.error;
      if(!previous.data?.weekly_digest && !digestEnabled()) return res.status(409).json({success:false,error:'Weekly email delivery is not enabled by your school yet.'});
      const identity=await supabaseService.auth.admin.getUserById(req.session.user!.id);if(identity.error) throw identity.error;
      if(!identity.data.user?.email_confirmed_at) return res.status(400).json({success:false,error:'Verify your account email before enabling weekly delivery.'});
    }
    const {error}=await supabaseService.from('notification_preferences').upsert({user_id:req.session.user!.id,update_mode:req.body.update_mode,weekly_digest:req.body.weekly_digest,updated_at:new Date().toISOString()});if(error) throw error;return res.json({success:true});
  }catch(e){next(e);}
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
