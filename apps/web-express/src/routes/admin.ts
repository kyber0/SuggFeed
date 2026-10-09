import { Router, Request, Response, NextFunction } from "express";
import { loadPendingSubmissions, loadAllSubmissionsForAdmin } from "../lib/data";

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
  if (!user || (user.role !== "admin" && user.role !== "moderator" && user.role !== "staff")) {
    return res.status(403).render("404", { title: "Access Denied" });
  }
  next();
}

router.get(
  "/",
  requireStaff,
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const status = (req.query["status"] as string) || "all";
    const search = (req.query["search"] as string) || "";

    const [pending, { data: allSubmissions, count }] = await Promise.all([
      loadPendingSubmissions(),
      loadAllSubmissionsForAdmin({ page, status, search }),
    ]);

    res.render("admin", {
      title: "Staff Portal — SuggFeed",
      description: "Review and manage all submissions.",
      pending,
      submissions: allSubmissions,
      totalCount: count,
      page,
      status,
      search,
    });
  })
);

export default router;
