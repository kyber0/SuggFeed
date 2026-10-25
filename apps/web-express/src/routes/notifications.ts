import { schoolUser } from '../lib/school-scope';
import {commentAction} from '../lib/comments';
import {assignmentAction} from '../lib/assignment/service';
import { Router } from 'express';

const router = Router();
router.get('/', async (req, res) => {
  const inboxView=req.query.view==='decisions'?'decisions':'updates';
  let assignmentNotices=[];let commentNotices=[];let commentNoticesUnavailable=false;const user=schoolUser(req);
  if(user&&['admin','moderator'].includes(user.role||'')){try{assignmentNotices=(await assignmentAction(user.id,'notifications')).items||[];}catch{console.warn('Assignment notices temporarily unavailable');}}
  if(user&&inboxView==='decisions'){try{commentNotices=(await commentAction('notices',{})).items||[];}catch{commentNoticesUnavailable=true;console.warn('Comment notices temporarily unavailable');}}
  res.setHeader('Cache-Control', 'private, no-store');
  res.render('notifications', {
    title: 'School updates — SuggFeed',
    description: 'Updates on the campus ideas you follow.',
    signedIn: !!schoolUser(req),profileSection:'inbox',inboxView,assignmentNotices,commentNotices,commentNoticesUnavailable,
  });
});
export default router;
