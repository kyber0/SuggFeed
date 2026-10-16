import { Router } from 'express';
import { safeSecurityReturnTo } from '../lib/auth-assurance';

const router = Router();
router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!req.session.user) return res.redirect(303, '/schools');
  return res.render('account-security', {
    title: 'Account security — SuggFeed',
    securityUserId: req.session.user.id,
    securityReturnTo: safeSecurityReturnTo(req.query.returnTo),
  });
});
export default router;
