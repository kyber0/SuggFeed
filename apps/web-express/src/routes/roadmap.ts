import { Router, Request, Response, NextFunction } from "express";
import { loadRoadmapSubmissions } from "../lib/data";

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export type RoadmapStatus = "now" | "next" | "later";
export type EffortLevel = "XS" | "S" | "M" | "L" | "XL";

const EFFORT_OPTIONS: EffortLevel[] = ["XS", "S", "M", "L", "XL"];
const QUARTERS = ["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027", "Future"];
const OWNERS = [
  { name: "Campus Ops", role: "Facilities & Grounds" },
  { name: "Academic Tech", role: "Learning Systems" },
  { name: "Campus Safety", role: "Safety & Security" },
  { name: "Student Council", role: "Student Life & Clubs" },
  { name: "IT Services", role: "Infrastructure & Wi-Fi" },
];

function getDeterministicOwner(category: string, id: string) {
  if (category === "Facilities") return OWNERS[0];
  if (category === "Learning") return OWNERS[1];
  if (category === "Safety") return OWNERS[2];
  if (category === "Student life") return OWNERS[3];

  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  return OWNERS[Math.abs(hash) % OWNERS.length];
}

function getDeterministicEffort(id: string): EffortLevel {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  const idx = Math.abs(hash) % EFFORT_OPTIONS.length;
  return EFFORT_OPTIONS[idx];
}

function getDeterministicQuarter(status: RoadmapStatus): string {
  if (status === "now") return "Q3 2026";
  if (status === "next") return "Q4 2026";
  return "Q1 2027";
}

router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const raw = await loadRoadmapSubmissions();

    const items = raw.map((s: any) => {
      let status: RoadmapStatus = "next";
      if (s.status === "in_progress") status = "now";
      else if (s.status === "approved") status = "next";
      else if (s.status === "resolved") status = "later";

      const categoryName = s.category ?? (s.categories?.name ?? "Campus");
      const owner = getDeterministicOwner(categoryName, s.id);
      const effort = getDeterministicEffort(s.id);
      const quarter = getDeterministicQuarter(status);

      return {
        id: s.id,
        title: s.title,
        description: s.description || "",
        status,
        effort,
        owner,
        quarter,
        tags: [categoryName],
        vote_count: s.vote_count || 0,
        comment_count: s.comment_count || 0,
        created_at: s.created_at,
        history: [
          { action: "Created from community idea", timestamp: s.created_at },
          { action: `Assigned to ${status.toUpperCase()} stage`, timestamp: s.created_at },
        ],
      };
    });

    const columns = {
      now: items.filter((i: any) => i.status === "now"),
      next: items.filter((i: any) => i.status === "next"),
      later: items.filter((i: any) => i.status === "later"),
    };

    const allTags = Array.from(new Set(items.flatMap((i: any) => i.tags)));

    res.render("roadmap", {
      title: "Product Roadmap — SuggFeed",
      description: "Live Campus Tracker — follow community suggestions across Now, Next, and Later delivery phases.",
      items,
      columns,
      owners: OWNERS,
      quarters: QUARTERS,
      tags: allTags,
    });
  })
);

export default router;
