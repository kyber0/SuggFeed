import { Router, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { staffRole, UUID } from '../lib/staff-workspace';
import { ProgressError } from '../lib/progress';
import { reserveEvidence, finalizeEvidence, cancelEvidence, evidenceDownload, cleanupEvidence } from '../lib/progress-evidence';

const router = Router();
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(error => error instanceof ProgressError ? res.status(error.status).json({ success: false, error: error.message }) : next(error));
};
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next();
});
router.param('id', (_req, res, next, id) => {
  if (!UUID.test(id)) return res.status(400).json({ success: false, error: 'Invalid evidence ID.' });
  next();
});
// This public entry point still authorizes publication state and private audience for every download.
router.get('/:id', run(async (req, res) => {
  const url = await evidenceDownload(req.params.id as string, req.session.user?.id ?? null);
  return res.redirect(302, url);
}));
router.use((req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, error: 'Sign in to the staff portal.' });
  if (!staffRole(req.session.user.role)) return res.status(403).json({ success: false, error: 'Staff access required.' });
  next();
});
router.post('/reserve', run(async (req, res) => res.status(201).json({ success: true, ...await reserveEvidence(req.session.user!.id, req.body) })));
router.post('/:id/finalize', run(async (req, res) => res.json({ success: true, file: await finalizeEvidence(req.session.user!.id, req.params.id as string) })));
router.post('/finalize', run(async (req, res) => {
  if (typeof req.body?.reservationId !== 'string' || !UUID.test(req.body.reservationId)) throw new ProgressError(400, 'Invalid evidence ID.');
  return res.json({ success: true, file: await finalizeEvidence(req.session.user!.id, req.body.reservationId) });
}));
router.delete('/:id', run(async (req, res) => res.json({ success: true, file: await cancelEvidence(req.session.user!.id, req.params.id as string) })));
export const cleanupHandler = run(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  const provided = Buffer.from(req.headers.authorization ?? '');
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  const result = await cleanupEvidence();
  return res.status(result.failed ? 503 : 200).json({ success: result.failed === 0, ...result });
});
export default router;
