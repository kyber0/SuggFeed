import { Router, Request, Response } from "express";

const router = Router();

router.get("/privacy", (_req: Request, res: Response) => {
  res.render("privacy", {
    title: "Privacy Policy — SuggFeed",
    description: "How SuggFeed collects, uses, and protects your information.",
  });
});

router.get("/terms", (_req: Request, res: Response) => {
  res.render("terms", {
    title: "Terms of Service — SuggFeed",
    description: "The rules and guidelines for using SuggFeed.",
  });
});

export default router;
