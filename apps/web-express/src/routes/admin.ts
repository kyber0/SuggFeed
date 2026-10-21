import { schoolUser } from '../lib/school-scope';
import { Router, Request, Response, NextFunction } from "express";
import { loadModerationCounts, MODERATION_STATUSES, PER_PAGE } from "../lib/data";
import { queueFilters, loadStaffQueue, loadStaffMembers, loadSavedViews, loadAnalyticsData, searchStudentProfiles } from '../lib/staff-workspace';

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

router.get(
  "/",
  requireStaff,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.query["view"] === "analytics") return res.redirect("/admin/analytics");
    if (req.query["view"] === "staff") return res.redirect("/admin/staff");

    const requestedPage = Number(req.query["page"]);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const rawStatus = typeof req.query["status"] === "string" ? req.query["status"] : "pending";
    const status = rawStatus === "all" || MODERATION_STATUSES.some(s => s === rawStatus) ? rawStatus : "pending";
    const search = typeof req.query["search"] === "string" ? req.query["search"].trim().slice(0, 120) : "";

    const filters = queueFilters(req.query);
    const overviewRange = ['7d','30d','90d'].includes(String(req.query.overviewRange)) ? String(req.query.overviewRange) : '30d';
    const [counts, { data: allSubmissions, count }, staffMembers, savedViews, overviewAnalytics] = await Promise.all([
      loadModerationCounts(),
      loadStaffQueue(filters, schoolUser(req)!.id, page),
      loadStaffMembers(), loadSavedViews(schoolUser(req)!.id),
      schoolUser(req)!.role === 'admin' ? loadAnalyticsData({range:overviewRange}).catch(() => { console.warn('School overview analytics unavailable'); return null; }) : Promise.resolve(null),
    ]);

    const pageCount = Math.max(1, Math.ceil(count / PER_PAGE));
    if (page > pageCount) {
      return res.redirect(`/admin?${new URLSearchParams({ ...filters, page: String(pageCount) })}`);
    }
    res.render("admin", {
      title: "Staff Portal — SuggFeed",
      description: "Review and manage all submissions.",
      counts,
      submissions: allSubmissions,
      totalCount: count,
      page,
      pageCount,
      perPage: PER_PAGE,
      status,
      search,
      filters, staffMembers, savedViews, overviewAnalytics, overviewRange,
      overviewDefault: schoolUser(req)!.role === 'admin' && !['status','search','assignment','priority','overdue','page','idea'].some(key => req.query[key] !== undefined),
      activeSection: "queue",
    });
  })
);

router.get(
  "/analytics",
  requireStaff,
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
