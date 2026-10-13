import { Router } from 'express';
import { listPublicProgress } from '../lib/progress';
import {
  roadmapFilters,
  loadRoadmapPage,
  loadRoadmapCategories,
  loadPublicRoadmapIdea,
  loadRecentlyCompleted,
  formatManilaDate,
} from '../lib/roadmap';

const router = Router();
router.get('/idea/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({ success: false, error: 'Invalid idea ID.' });
    const [item,updates]=await Promise.all([loadPublicRoadmapIdea(id),listPublicProgress(id)]);
    if (!item) return res.status(404).json({ success: false, error: 'This idea is no longer on the public roadmap.' });
    return res.json({ success: true, item, updates });
  } catch (error) { next(error); }
});
router.get('/', async (req, res, next) => {
  try {
    const dataStarted=performance.now();
    const filters = roadmapFilters(req.query);
    const [result, categories, recentlyCompleted] = await Promise.all([
      loadRoadmapPage(filters),
      loadRoadmapCategories(),
      filters.view === 'board' && filters.stage === 'all' && !filters.search && filters.category === 'all' ? loadRecentlyCompleted() : Promise.resolve([]),
    ]);
    if (filters.page > result.pageCount) return res.redirect('/roadmap?' + new URLSearchParams({ ...filters, page: String(result.pageCount) }).toString());
    res.append('Server-Timing',`data;dur=${(performance.now()-dataStarted).toFixed(1)}`);
    res.render('roadmap', {
      title: 'Campus roadmap — SuggFeed',
      description: 'See which community ideas are planned, in progress, and completed.',
      ...result,
      filters,
      categories,
      recentlyCompleted,
      formatManilaDate,
    });
  } catch (error) { next(error); }
});
export default router;
