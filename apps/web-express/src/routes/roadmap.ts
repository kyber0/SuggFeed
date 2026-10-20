import {schoolFeature,schoolPresentation} from '../lib/school-customization';
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
router.use((req,res,next)=>schoolFeature('roadmap')?next():req.path==='/'?res.render('school-message',{title:'Roadmap is disabled',message:'This school has disabled the student roadmap. You can still browse community ideas.',nextHref:'/feed',nextLabel:'Browse ideas'}):res.status(403).json({success:false,code:'FEATURE_DISABLED',error:'This school disabled the student roadmap.'}));
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
    const filters = roadmapFilters({...req.query,view:req.query.view??schoolPresentation().design?.pages.roadmap?.view});
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
