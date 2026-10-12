import { Router, Request, Response, NextFunction } from "express";
import { loadSingleSubmission, loadComments } from "../lib/data";
import { supabaseService } from '../lib/supabase';
import { ENGAGEMENT_UUID } from '../lib/engagement';

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
    if (!ENGAGEMENT_UUID.test(id)) return res.status(404).render('404',{title:'Idea Not Found'});
    const merged = await supabaseService.from('idea_merges').select('target_id').eq('source_id',id).maybeSingle();
    if (merged.error) throw merged.error;
    if (merged.data) {
      const target = await supabaseService.from('submissions').select('id').eq('id',merged.data.target_id).in('status',['approved','in_progress','resolved']).maybeSingle();
      if (target.error) throw target.error;
      if (target.data) return res.redirect(302,'/idea/'+target.data.id);
    }
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
