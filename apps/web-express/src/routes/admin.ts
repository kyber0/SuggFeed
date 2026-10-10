import { Router, Request, Response, NextFunction } from "express";
import { loadModerationCounts, MODERATION_STATUSES, PER_PAGE } from "../lib/data";
import { queueFilters, loadStaffQueue, loadStaffMembers, loadSavedViews } from '../lib/staff-workspace';

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
  const user = req.session.user;
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
    const requestedPage = Number(req.query["page"]);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const rawStatus = typeof req.query["status"] === "string" ? req.query["status"] : "pending";
    const status = rawStatus === "all" || MODERATION_STATUSES.some(s => s === rawStatus) ? rawStatus : "pending";
    const search = typeof req.query["search"] === "string" ? req.query["search"].trim().slice(0, 120) : "";

    const filters = queueFilters(req.query);
    const [counts, { data: allSubmissions, count }, staffMembers, savedViews] = await Promise.all([
      loadModerationCounts(),
      loadStaffQueue(filters, req.session.user!.id, page),
      loadStaffMembers(), loadSavedViews(req.session.user!.id),
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
      filters, staffMembers, savedViews,
    });
  })
);

export default router;
