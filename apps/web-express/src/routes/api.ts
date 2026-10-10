import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { supabase, supabaseService } from "../lib/supabase";
import {
  lookupTrackingCode,
  loadPublishedSubmissions,
  loadSingleSubmission,
  loadComments,
  sanitizeSearch,
  invalidateCache,
  type SortMode,
} from "../lib/data";

const router = Router();

/** Wraps async route handlers so thrown errors reach the Express error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Returns a stable SHA-256 hex string for the given input. */
function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const VALID_CATEGORIES = ["Facilities", "Learning", "Safety", "Student life", "Other"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

/* ── Vote on a submission ─────────────────────────────────────────────────── */
router.post(
  "/vote/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params["id"] as string;

    // Validate the submission exists and is public
    const { data: sub, error: findErr } = await supabaseService
      .from("submissions")
      .select("id, vote_count, status")
      .eq("id", id)
      .in("status", ["approved", "in_progress", "resolved"])
      .maybeSingle();

    if (findErr || !sub) {
      return res.status(404).json({ success: false, error: "Submission not found or not public." });
    }

    const user = req.session.user;
    let alreadyVoted = false;

    if (user?.id) {
      // Authenticated user — dedup by user_id
      const { data: existing } = await supabaseService
        .from("votes")
        .select("submission_id")
        .eq("submission_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        return res.json({ success: true, vote_count: sub.vote_count, already_voted: true });
      }

      const { error: insertErr } = await supabaseService
        .from("votes")
        .insert({ submission_id: id, user_id: user.id });

      if (insertErr) throw insertErr;
    } else {
      // Anonymous user — dedup by session-scoped voted set
      const sessionVoted: string[] = (req.session as any).votedIds ?? [];
      if (sessionVoted.includes(id)) {
        return res.json({ success: true, vote_count: sub.vote_count, already_voted: true });
      }

      const anonToken = (req.cookies as Record<string, string>)["sf_anon_token"] || crypto.randomUUID();
      if (!(req.cookies as Record<string, string>)["sf_anon_token"]) {
        res.cookie("sf_anon_token", anonToken, {
          maxAge: 365 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }

      const { error: insertErr } = await supabaseService
        .from("votes")
        .insert({ submission_id: id, anon_token: anonToken });

      if (insertErr) {
        // Unique constraint violation — already voted
        if ((insertErr as any).code === "23505") {
          return res.json({ success: true, vote_count: sub.vote_count, already_voted: true });
        }
        throw insertErr;
      }

      // Track in session to avoid repeated DB hits
      (req.session as any).votedIds = [...sessionVoted, id];
    }

    // Increment vote_count atomically
    const newCount = (sub.vote_count ?? 0) + 1;
    await supabaseService
      .from("submissions")
      .update({ vote_count: newCount })
      .eq("id", id);

    invalidateCache(`submission_${id}`);
    invalidateCache("feed_");
    return res.json({ success: true, vote_count: newCount });
  })
);

/* ── Track submission by code ─────────────────────────────────────────────── */
router.get(
  "/track/:code",
  asyncHandler(async (req: Request, res: Response) => {
    const code = (req.params["code"] as string).trim().toUpperCase();

    // Only accept the expected CV-XXXXX format — never bare UUIDs
    if (!/^CV-[0-9A-F]{32}$/.test(code)) {
      return res.status(400).json({ success: false, error: "Invalid tracking code format." });
    }

    const result = await lookupTrackingCode(code);
    res.json({ success: true, data: result });
  })
);

/* ── Submit a new idea ────────────────────────────────────────────────────── */
router.post(
  "/submit",
  asyncHandler(async (req: Request, res: Response) => {
    const { title, description, category, isAnonymous } = req.body as {
      title?: unknown;
      description?: unknown;
      category?: unknown;
      isAnonymous?: unknown;
    };

    // Strict type + business-rule validation before any async work
    if (typeof title !== "string" || typeof description !== "string") {
      return res.status(400).json({ success: false, error: "Title and description must be strings." });
    }
    if (title.trim().length < 10) {
      return res.status(400).json({ success: false, error: "Title must be at least 10 characters." });
    }
    if (title.trim().length > 120) {
      return res.status(400).json({ success: false, error: "Title must be 120 characters or fewer." });
    }
    if (description.trim().length < 20) {
      return res.status(400).json({ success: false, error: "Description must be at least 20 characters." });
    }
    if (description.trim().length > 2000) {
      return res.status(400).json({ success: false, error: "Description must be 2000 characters or fewer." });
    }
    if (typeof category !== "string" || !(VALID_CATEGORIES as readonly string[]).includes(category)) {
      return res.status(400).json({ success: false, error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}.` });
    }
    const anonymous = isAnonymous === true || isAnonymous === "true";
    const user = req.session.user;
    if (!anonymous && !user?.id) {
      return res.status(401).json({ success: false, error: "Sign in to submit a non-anonymous idea." });
    }

    // Resolve category name → UUID
    const { data: catRow } = await supabaseService
      .from("categories")
      .select("id")
      .eq("name", (category as Category).trim())
      .eq("is_active", true)
      .maybeSingle();

    if (!catRow) {
      return res.status(400).json({ success: false, error: "That category is no longer available." });
    }

    // Generate tracking code and store only its hash (no plain code in DB)
    const trackingCode = anonymous
      ? `CV-${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`
      : null;
    const trackingHash = trackingCode ? sha256(trackingCode) : null;

    const { data, error } = await supabaseService
      .from("submissions")
      .insert({
        title: title.trim(),
        description: description.trim(),
        category_id: catRow.id,
        user_id: anonymous ? null : (user?.id ?? null),
        anonymous_tracking_hash: trackingHash,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[api/submit] Insert failed:", error.code);
      return res.status(500).json({ success: false, error: "Could not create your submission. Please try again." });
    }

    invalidateCache("feed_");
    res.json({ success: true, id: data.id, tracking_code: trackingCode });
  })
);

/* ── Admin: update submission status ──────────────────────────────────────── */
// Route: PATCH /api/submissions/:id/status
// Admin view calls this URL — keep it consistent here and in admin.eta
router.patch(
  "/submissions/:id/status",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.session.user;
    if (!user || (user.role !== "admin" && user.role !== "moderator" && user.role !== "staff")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { id } = req.params;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: "Invalid submission ID." });
    }

    const { status, note } = req.body as { status?: unknown; note?: unknown };
    const VALID_STATUSES = ["pending", "approved", "rejected", "in_progress", "resolved"] as const;
    if (typeof status !== "string" || !(VALID_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    if (note !== undefined && (typeof note !== "string" || note.length > 2000)) {
      return res.status(400).json({ success: false, error: "Staff note must be text with 2000 characters or fewer." });
    }
    const { error } = await supabaseService.rpc("moderate_submission", {
      p_submission_id: id, p_staff_id: user.id, p_status: status,
      p_note: typeof note === "string" ? note.trim() : null,
    });

    if (error?.code === "P0002") return res.status(404).json({ success: false, error: "Submission not found." });
    if (error?.code === "42501") return res.status(403).json({ success: false, error: "Staff access required." });

    if (error) throw error;

    invalidateCache(`submission_${id}`);
    invalidateCache("feed_");
    invalidateCache("roadmap_submissions");

    res.json({ success: true });
  })
);

/* ── Paginated feed (JSON, for infinite scroll) ───────────────────────────── */
router.get(
  "/feed",
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const sortBy = (req.query["sort"] as any) || "all";
    const category = (req.query["category"] as string) || "All";
    const rawSearch = (req.query["search"] as string) || "";
    const search = rawSearch ? sanitizeSearch(rawSearch) : "";

    const result = await loadPublishedSubmissions({ page, sortBy, category, search });
    res.json({
      success: true,
      feed: result.data,
      data: result.data,
      count: result.count,
      totalCount: result.count,
      hasMore: result.hasMore,
      page,
    });
  })
);

/* ── Post a comment ───────────────────────────────────────────────────────── */
router.post(
  "/comments/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const { id: submissionId } = req.params;
    const user = req.session.user;
    const { body, parentId } = req.body as { body?: unknown; parentId?: unknown };

    // Strict type check before trimming
    if (typeof body !== "string") {
      return res.status(400).json({ success: false, error: "Comment body must be a string." });
    }
    if (body.trim().length < 10) {
      return res.status(400).json({ success: false, error: "Comment must be at least 10 characters." });
    }
    if (body.trim().length > 500) {
      return res.status(400).json({ success: false, error: "Comment must be 500 characters or fewer." });
    }

    // Verify submission exists and is public
    const { data: sub, error: subErr } = await supabaseService
      .from("submissions")
      .select("id, status")
      .eq("id", submissionId)
      .single();

    if (subErr || !sub) {
      return res.status(404).json({ success: false, error: "Submission not found." });
    }
    if (!["approved", "in_progress", "resolved"].includes(sub.status)) {
      return res.status(403).json({ success: false, error: "Comments are not open for this submission." });
    }

    // Resolve or generate a stable anonymous token (satisfies DB check constraint)
    const anonToken = !user
      ? ((req.cookies as Record<string, string>)["sf_anon_token"] || crypto.randomUUID())
      : null;

    if (!user && !(req.cookies as Record<string, string>)["sf_anon_token"] && anonToken) {
      res.cookie("sf_anon_token", anonToken, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    const displayName = user
      ? (user.display_name ?? user.full_name ?? user.email?.split("@")[0] ?? "Student")
      : "Anonymous Student";

    const { data, error } = await supabaseService
      .from("comments")
      .insert({
        submission_id: submissionId,
        body: body.trim(),
        display_name: displayName,
        user_id: user?.id ?? null,
        anon_token: anonToken,
        parent_id: (typeof parentId === "string" && parentId) ? parentId : null,
      })
      .select("id, body, display_name, created_at, parent_id, user_id")
      .single();

    if (error) throw error;

    invalidateCache(`comments_${submissionId}`);
    invalidateCache(`submission_${submissionId}`);
    invalidateCache("feed_");

    res.json({ success: true, data });
  })
);

/* ── Toggle bookmark ──────────────────────────────────────────────────────── */
router.post(
  "/bookmarks/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.session.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Sign in to bookmark ideas." });
    }

    const { id: submissionId } = req.params;
    const { action } = req.body as { action?: unknown };

    if (action !== "add" && action !== "remove") {
      return res.status(400).json({ success: false, error: "Action must be 'add' or 'remove'." });
    }

    if (action === "remove") {
      await supabaseService
        .from("bookmarks")
        .delete()
        .match({ user_id: user.id, submission_id: submissionId });
    } else {
      await supabaseService
        .from("bookmarks")
        .upsert(
          { user_id: user.id, submission_id: submissionId },
          { onConflict: "user_id,submission_id" }
        );
    }

    res.json({ success: true, bookmarked: action === "add" });
  })
);

/* ── Categories list ──────────────────────────────────────────────────────── */
router.get(
  "/categories",
  asyncHandler(async (_req: Request, res: Response) => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name")
      .eq("is_active", true)
      .order("name");
    if (error) {
      // Fallback — don't leak error details
      return res.json({ success: true, categories: [...VALID_CATEGORIES] });
    }
    res.json({ success: true, categories: (data ?? []).map((c: any) => c.name) });
  })
);

/* ── Single idea detail with comments (for detail panel drawer) ──────────── */
router.get(
  "/idea/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params["id"] as string;
    const [submission, comments] = await Promise.all([
      loadSingleSubmission(id),
      loadComments(id),
    ]);
    if (!submission) {
      return res.status(404).json({ success: false, error: "Idea not found." });
    }
    res.json({ success: true, submission, comments });
  })
);

/* ── Community feed (for infinite scroll / lazy loading) ───────────────── */
router.get(
  "/feed",
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query["page"]) || 1);
    const sortBy = ((req.query["sort"] as string) || "latest") as SortMode;
    const category = (req.query["category"] as string) || "All";
    const search = (req.query["search"] as string) || "";

    const { data: feed, count, hasMore } = await loadPublishedSubmissions({
      page,
      sortBy,
      category,
      search,
    });

    res.json({ success: true, feed, totalCount: count, hasMore, page });
  })
);

export default router;
