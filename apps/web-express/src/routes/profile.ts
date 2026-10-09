import { Router, Request, Response, NextFunction } from "express";
import { loadUserProfile, loadUserSubmissions, loadUserBookmarks } from "../lib/data";

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.session.user ?? null;

    if (!user) {
      return res.render("profile", {
        title: "Profile — SuggFeed",
        description: "Sign in to view your profile and manage your ideas.",
        profile: null,
        submissions: [],
        bookmarks: [],
      });
    }

    const [profile, submissions, bookmarks] = await Promise.all([
      loadUserProfile(user.id),
      loadUserSubmissions(user.id),
      loadUserBookmarks(user.id),
    ]);

    res.render("profile", {
      title: "My Profile — SuggFeed",
      description: "Manage your ideas and bookmarks.",
      profile,
      submissions,
      bookmarks,
    });
  })
);

export default router;
