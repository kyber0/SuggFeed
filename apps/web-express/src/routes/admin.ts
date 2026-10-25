import { supabaseService } from '../lib/supabase';
import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from "express";
import { loadModerationCounts, PER_PAGE } from "../lib/data";
import { queueFilters, loadStaffQueue, loadStaffMembers, loadSavedViews, loadAnalyticsData, searchStudentProfiles, UUID } from '../lib/staff-workspace';

const router = Router();

/** Wraps async route handlers so thrown errors reach the Express error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Auth guard — staff/admin/moderator only
// Database role enum: 'student' | 'moderator' | 'admin'
// Express sessions previously checked for "staff" which is not a real DB role.
function requireStaff(req: Request, res: Response, next: () => void) {
  const user = schoolUser(req);
  if (!user) return res.status(200).render("staff-login", { title: "Staff Portal Sign In — SuggFeed" });
  if (user.role !== "admin" && user.role !== "moderator" && user.role !== "staff") {
    return res.status(403).render("403", { title: "Staff Access Required — SuggFeed" });
  }
  next();
}

// Keep legacy links usable without mixing delivery work into the decision queue.
router.get('/', requireStaff, asyncHandler(async (req, res) => {
  if (req.query.view === 'analytics') return res.redirect('/admin/analytics');
  if (req.query.view === 'staff') return res.redirect('/admin/staff');
  if (['status','search','assignment','priority','overdue','page','idea'].some(key => req.query[key] !== undefined)) {
    const query = new URLSearchParams();
    for (const key of ['status','search','assignment','priority','overdue','page','idea']) if (typeof req.query[key] === 'string') query.set(key, String(req.query[key]));
    return res.redirect('/admin/reviews?' + query.toString());
  }
  if (schoolUser(req)!.role !== 'admin') return res.redirect('/admin/reviews');
  const overviewRange = ['7d','30d','90d'].includes(String(req.query.overviewRange)) ? String(req.query.overviewRange) : '30d';
  const [counts, overviewAnalytics] = await Promise.all([loadModerationCounts(), loadAnalyticsData({range:overviewRange}).catch(() => { console.warn('School overview analytics unavailable'); return null; })]);
  res.setHeader('Cache-Control','private, no-store');
  res.render('admin-overview', {title:'School overview — SuggFeed', activeSection:'overview', counts, overviewAnalytics, overviewRange});
}));
router.get('/reviews', requireStaff, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control','private, no-store');
  const filters = queueFilters(req.query);
  const idea = typeof req.query.idea === 'string' && UUID.test(req.query.idea) ? req.query.idea : null;
  // Resolve old direct links using fresh, school-scoped data, never a browser-supplied status.
  if (idea) {
    const result = await supabaseService.from('submissions').select('status').eq('id',idea).maybeSingle();
    if (result.error) throw result.error;
    if (result.data && ['approved','in_progress','resolved'].includes(result.data.status)) return res.redirect('/admin/board?idea='+encodeURIComponent(idea));
  }
  if (filters.overdue==='true'||['approved','in_progress','resolved'].includes(filters.status)) {
    const query = new URLSearchParams();
    if(filters.search) query.set('search',filters.search);
    if(filters.assignment!=='all') query.set('assignment',filters.assignment);
    if(filters.priority!=='all') query.set('priority',filters.priority);
    if(filters.overdue==='true') query.set('overdue','true');
    return res.redirect('/admin/board?'+query.toString()+(['approved','in_progress','resolved'].includes(filters.status)?'#board-lane-'+filters.status:''));
  }
  const requestedPage = Number(req.query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [counts, {data:submissions,count}, staffMembers, savedViews] = await Promise.all([
    loadModerationCounts(), loadStaffQueue(filters,schoolUser(req)!.id,page,true), loadStaffMembers(), loadSavedViews(schoolUser(req)!.id)
  ]);
  const pageCount = Math.max(1,Math.ceil(count/PER_PAGE));
  if(page>pageCount) return res.redirect('/admin/reviews?'+new URLSearchParams({...filters,page:String(pageCount)}));
  res.render('admin', {title:'Review ideas — SuggFeed', description:'Review new ideas and record a decision.', counts:{...counts,all:counts.all-counts.pending}, submissions, totalCount:count, page, pageCount, perPage:PER_PAGE, status:filters.status, search:filters.search, filters, staffMembers, savedViews, activeSection:'queue'});
}));

router.get(
  "/analytics",
  requireStaff,
  (req,res,next)=>schoolUser(req)?.role==='admin'?next():res.redirect('/admin/assignments'),
  asyncHandler(async (req: Request, res: Response) => {
    const [counts, analytics] = await Promise.all([
      loadModerationCounts(),
      loadAnalyticsData(req.query),
    ]);

    res.render("admin-analytics", {
      title: "Analytics & Metrics — Staff Portal — SuggFeed",
      description: "Campus feedback metrics, volume trends, and resolution performance.",
      counts,
      analytics,
      activeSection: "analytics",
    });
  })
);

router.get(
  "/staff",
  requireStaff,
  (req, res, next) => schoolUser(req)?.role === "admin" ? next() : res.status(403).render("403", { title: "School administrator access required" }),
  asyncHandler(async (req: Request, res: Response) => {
    const [counts, staffMembers, students] = await Promise.all([
      loadModerationCounts(),
      loadStaffMembers(),
      searchStudentProfiles("", 20),
    ]);

    res.render("admin-staff", {
      title: "Manage Staff & Access — Staff Portal — SuggFeed",
      description: "Manage staff directory, change user roles, and invite campus administrators.",
      counts,
      staffMembers,
      students,
      activeSection: "staff",
    });
  })
);

export default router;
