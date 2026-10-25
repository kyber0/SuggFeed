import { schoolUser } from '../lib/school-scope';
import {assignmentAction} from '../lib/assignment/service';
import { Router } from 'express';

const router = Router();
router.get('/', async (req, res) => {
  let assignmentNotices=[];const user=schoolUser(req);
  if(user&&['admin','moderator'].includes(user.role||'')){try{assignmentNotices=(await assignmentAction(user.id,'notifications')).items||[];}catch{console.warn('Assignment notices temporarily unavailable');}}
  res.setHeader('Cache-Control', 'private, no-store');
  res.render('notifications', {
    title: 'School updates — SuggFeed',
    description: 'Updates on the campus ideas you follow.',
    signedIn: !!schoolUser(req),assignmentNotices,
  });
});
export default router;
