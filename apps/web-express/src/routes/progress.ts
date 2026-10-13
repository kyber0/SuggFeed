import { Router, Request, Response, NextFunction } from 'express';
import { staffRole, UUID } from '../lib/staff-workspace';
import { listStaffProgress, loadStaffProgressSubmission, postProgress, ProgressError } from '../lib/progress';
import { invalidateCache } from '../lib/data';
import {workflowContext} from '../lib/workflow';

const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(error => error instanceof ProgressError ? res.status(error.status).json({ success: false, error: error.message,code:error.code }) : next(error));
};
// Use under the app's verified-identity, same-origin/CSRF, and API rate-limit middleware.
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!req.session.user) return res.status(401).json({ success: false, error: 'Sign in to the staff portal.' });
  if (!staffRole(req.session.user.role)) return res.status(403).json({ success: false, error: 'Staff access required.' });
  next();
});
router.param('id', (_req, res, next, id) => {
  if (!UUID.test(id)) return res.status(400).json({ success: false, error: 'Invalid submission ID.' });
  next();
});
router.get(['/:id/updates', '/submissions/:id/updates'], run(async (req, res) => {
  const id = req.params.id as string;
  const [submission, updates] = await Promise.all([loadStaffProgressSubmission(id), listStaffProgress(id, req.session.user!.id)]);
  return res.json({ success: true, submission, updates, limit: 100,workflow:await workflowContext(id,req.session.user!.id) });
}));
router.post(['/:id/updates', '/submissions/:id/updates'], run(async (req, res) => {
  const id = req.params.id as string;
  const result = await postProgress(id, req.session.user!.id, req.body);
  invalidateCache(`submission_${id}`); invalidateCache('feed_'); invalidateCache('roadmap_');
  return res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
}));
export default router;
