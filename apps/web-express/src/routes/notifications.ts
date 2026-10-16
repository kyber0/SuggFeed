import { schoolUser } from '../lib/school-scope';
import { Router } from 'express';

const router = Router();
router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.render('notifications', {
    title: 'School updates — SuggFeed',
    description: 'Updates on the campus ideas you follow.',
    signedIn: !!schoolUser(req),
  });
});
export default router;
