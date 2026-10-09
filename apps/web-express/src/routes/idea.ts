import { Router, Request, Response, NextFunction } from "express";
import { loadSingleSubmission, loadComments } from "../lib/data";

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params["id"] as string;
    const [submission, comments] = await Promise.all([
      loadSingleSubmission(id),
      loadComments(id),
    ]);

    if (!submission) {
      return res.status(404).render("404", { title: "Idea Not Found" });
    }

    res.render("idea", {
      title: `${submission.title} — SuggFeed`,
      description: submission.description,
      submission,
      comments,
    });
  })
);

export default router;
