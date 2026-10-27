import {feedVoteState} from '../lib/feed-account';
import {studentIdeaState} from '../lib/student-experience';
import {deliverSafetyEmail} from '../lib/safety-email';
import {assessSubmission,categorize} from '../lib/content-moderation';
import {contentSafetyConfig} from '../lib/content-safety-config';
import {saveComment} from '../lib/comments';
import {CommunityError} from '../lib/community';
import {schoolFeature,schoolCategories,schoolCategory} from '../lib/school-customization';
import { schoolUser,currentSchool } from '../lib/school-scope';
import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { supabase, supabaseService,supabasePlatform } from "../lib/supabase";
import engagementRouter from './engagement';
import savedSearchesRouter from './saved-searches';
import publicHistoryRouter from './public-history';
import { ENGAGEMENT_UUID } from '../lib/engagement';
import {
  lookupTrackingCode,
  loadPublishedSubmissions,
  loadSingleSubmission,
  loadComments,
  invalidateCache,
  type SortMode,
} from "../lib/data";

import { feedFilters } from '../lib/feed-filters';
import { submissionContext, submissionHash, receiptTrackingCode } from '../lib/submission-context';
const router = Router();
router.use((req,res,next)=>{const feature=req.method==='POST'&&req.path.startsWith('/vote/')&&req.body?.action!=='unvote'?'voting':req.method==='POST'&&/^\/comments\/[^/]+$/.test(req.path)?'comments':null;if(feature&&!schoolFeature(feature))return res.status(403).json({success:false,code:'FEATURE_DISABLED',error:'Your school disabled new '+feature+'.'});next();});
router.use(engagementRouter);
router.use(publicHistoryRouter);
router.use('/saved-searches',savedSearchesRouter);

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


/* ── Vote on a submission ─────────────────────────────────────────────────── */
router.post(
  "/vote/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params["id"] as string;

    if (!ENGAGEMENT_UUID.test(id)) return res.status(400).json({ success: false, error: 'Invalid idea ID.' });
    const action=req.body?.action ?? 'up';
    if(!['up','unvote'].includes(action))return res.status(400).json({success:false,error:'Choose up or unvote.'});
    const user = schoolUser(req);
    let anonToken: string | null = null;
    if (!user?.id) {
      const cookieToken = req.cookies?.['sf_anon_token'];
      anonToken = typeof cookieToken === 'string' && ENGAGEMENT_UUID.test(cookieToken) ? cookieToken : crypto.randomUUID();
      if (cookieToken !== anonToken) {
        res.cookie("sf_anon_token", anonToken, {
          maxAge: 365 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }

    }
    const { data, error } = await supabaseService.rpc('set_idea_vote', {
      p_submission_id: id, p_user_id: user?.id || null, p_anon_token: anonToken,
      p_device_hash:null,p_ip_hash:null,p_action:action==='unvote'?'unvote':'vote',
    });
    if (error?.code === 'P0002') return res.status(404).json({ success: false, error: 'Submission not found or not public.' });
    if (error) throw error;
    invalidateCache(`submission_${id}`);
    invalidateCache("feed_");
    invalidateCache("roadmap_");
    return res.json({ success: true, vote_count: data.vote_count, voted:data.voted, already_voted: data.already_voted });
  })
);

/* ── Track submission by code ─────────────────────────────────────────────── */
const trackHandler=asyncHandler(async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');
  const raw=req.method==='POST'?req.body?.code:req.params.code;
  if(typeof raw!=='string')return res.status(400).json({success:false,error:'Enter a private tracking code.'});
  const code=raw.trim().toUpperCase();
  if(!/^CV-[0-9A-F]{32}$/.test(code))return res.status(400).json({success:false,error:'Invalid tracking code format.'});
  const result=await lookupTrackingCode(code);
  if(!result)return res.status(404).json({success:false,error:'Idea not found. Check your private tracking code.'});
  res.json({success:true,data:{...result,state:studentIdeaState(result,currentSchool()?.customization?.labels)}});
});
router.post('/track',trackHandler);
// Preserve older clients; logs redact the capability in this legacy URL.
router.get('/track/:code',trackHandler);

// Issue the private device cookie before writes, so losing a POST response does not lose its receipt.
router.get('/submission-context',(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  const context=submissionContext(req,res,true)!;
  return res.json({success:true,actor:context.actor,signedIn:context.signedIn});
});
router.post('/submission-receipt',asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  const context=submissionContext(req,res);
  if(!context || req.body.actor!==context.actor)return res.status(409).json({success:false,error:'The account or browser changed. Return to the original browser and account to check this submission.'});
  if(typeof req.body.requestId!=='string' || !ENGAGEMENT_UUID.test(req.body.requestId))return res.status(400).json({success:false,error:'Invalid submission receipt.'});
  const {data,error}=await supabaseService.rpc('read_submission_receipt',{p_owner_hash:context.actor,p_request_id:req.body.requestId.toLowerCase()});
  if(error?.code==='P0004')return res.status(410).json({success:false,error:'This receipt expired or the submission was removed. It cannot be sent again with this receipt.'});
  if(error)throw error;
  return res.json({success:true,found:!!data,...(data?{id:data.id,tracking_code:data.is_anonymous?receiptTrackingCode(context.device,context.actor,req.body.requestId):null,replayed:true}:{})});
}));

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
    if(category!==undefined&&(typeof category!=='string'||category.length>80))return res.status(400).json({success:false,error:'Choose a current school category.'});
    const anonymous = isAnonymous === true || isAnonymous === "true";
    const user = schoolUser(req);
    if (!anonymous && !user?.id) {
      return res.status(401).json({ success: false, error: "Sign in to submit a non-anonymous idea." });
    }

    const context=submissionContext(req,res);
    if(!context || req.body.actor!==context.actor)return res.status(409).json({success:false,error:'Your account or browser changed. Confirm the current account before submitting.',code:'ACCOUNT_CHANGED'});
    if(typeof req.body.requestId!=='string' || !ENGAGEMENT_UUID.test(req.body.requestId))return res.status(400).json({success:false,error:'A submission receipt is required. Reload before submitting.'});
    const requestId=req.body.requestId.toLowerCase();

    const customized=req.body.schemaVersion===2;
    const trackingCode=anonymous?receiptTrackingCode(context.device,context.actor,requestId):null;
    const canonical=customized?{title:title.trim(),description:description.trim(),category,isAnonymous:anonymous,schemaVersion:2,formVersion:req.body.formVersion||null,answers:req.body.answers||{},fileIds:req.body.fileIds||[]}:{title:title.trim(),description:description.trim(),category,isAnonymous:anonymous};
    const payloadHash=submissionHash(JSON.stringify(canonical));
    const cat=typeof category==='string'&&category?schoolCategory(category):schoolCategories().find(c=>c.id===categorize(title+' '+description,schoolCategories()));
    if(req.body.formVersion!==undefined&&req.body.formVersion!==null&&(typeof req.body.formVersion!=='string'||!ENGAGEMENT_UUID.test(req.body.formVersion)))return res.status(400).json({success:false,error:'Reload the current school form.'});
    const verdict=assessSubmission(title,description,req.body.answers);
    if(verdict.state==='rejected')return res.status(422).json({success:false,error:'Please revise your submission to keep it respectful.'});
    const {data,error}=await supabaseService.rpc('safe_submission_create',{p_verdict:verdict,p_policy:{...contentSafetyConfig.submissions,ipKey:sha256((process.env.SESSION_SECRET||'')+':'+req.ip)},p_args:{
      p_owner_hash:context.actor,p_request_id:requestId,p_payload_hash:payloadHash,
      p_title:title.trim(),p_description:description.trim(),p_category_id:cat?.id || null,
      p_anonymous:anonymous,p_tracking_hash:trackingCode?sha256(trackingCode):null,
      p_form_version:customized?req.body.formVersion||null:null,p_answers:customized?req.body.answers||{}:{},p_files:customized?req.body.fileIds||[]:[],
    }});
    if(error?.code==='PT429'){res.setHeader('Retry-After','30');return res.status(429).json({success:false,error:'Please wait before submitting again. You may have reached the hourly limit.'});}
    if(error?.code==='P0202'||error?.code==='22023'&&!cat?.active){const fresh=await supabasePlatform.rpc('school_published_configuration',{p_school:currentSchool()!.id});if(fresh.error)throw fresh.error;return res.status(409).json({success:false,code:'FORM_CHANGED',error:'The school changed this form. Your text is preserved; review the current questions before submitting.',schema:{form:fresh.data.form,formVersion:fresh.data.formVersion,features:fresh.data.features,categories:fresh.data.categories}});}
    if(error?.code==='P0201')return res.status(403).json({success:false,code:'FEATURE_DISABLED',error:'Your school disabled this type of submission. Sign in to submit with your account.'});
    if(error?.code==='22023'||error?.code==='42501')return res.status(400).json({success:false,error:'Check the current school questions, category and required images. Images must belong to this account and browser and must not have expired.'});
    if(error?.code==='23505')return res.status(409).json({success:false,error:'This receipt belongs to different content. Check the previous submission before starting another.'});
    if(error?.code==='P0004')return res.status(410).json({success:false,error:'This receipt expired or its submission was removed.'});
    if(error){console.error('submission_write_unavailable');return res.status(503).json({success:false,error:'Your submission could not be confirmed. Check your receipt before retrying.'});}
    if(verdict.urgent)await deliverSafetyEmail().catch(()=>console.error('safety_email_unavailable'));
    invalidateCache('feed_');
    invalidateCache('published_count_');
    res.setHeader('Cache-Control','private, no-store');
    res.status(data.replayed?200:201).json({success:true,id:data.id,tracking_code:trackingCode,replayed:data.replayed});
  })
);

/* ── Admin: update submission status ──────────────────────────────────────── */
// Route: PATCH /api/submissions/:id/status
// Admin view calls this URL — keep it consistent here and in admin.eta
router.patch(
  "/submissions/:id/status",
  asyncHandler(async (req: Request, res: Response) => {
    const user = schoolUser(req);
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

    if(error?.code==='P0101')return res.status(409).json({success:false,code:'WORKFLOW_ACTION_REQUIRED',error:'Use the guided staff workspace to change status.'});
    if(error?.code==='P0103')return res.status(503).json({success:false,code:'LIFECYCLE_PAUSED',error:'Work changes are temporarily paused.'});
    if (error?.code === "P0002") return res.status(404).json({ success: false, error: "Submission not found." });
    if (error?.code === "42501") return res.status(403).json({ success: false, error: "Staff access required." });

    if (error) throw error;

    invalidateCache(`submission_${id}`);
    invalidateCache("feed_");
    invalidateCache("published_count_");
    invalidateCache("roadmap_");

    res.json({ success: true });
  })
);

/* ── Paginated feed (JSON, for infinite scroll) ───────────────────────────── */
router.get(
  "/feed",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, sort: sortBy, category, search, scope } = feedFilters(req.query);
    const following = scope === 'following';
    if (following && !schoolUser(req)) return res.status(401).json({success:false,error:'Sign in to see followed ideas.'});
    res.setHeader('Cache-Control','private, no-store');
    const result = await loadPublishedSubmissions({ page, sortBy, category, search, followingUserId: following ? schoolUser(req)!.id : undefined, includeTotal:req.query.total!=='skip' });
    const voteState=await feedVoteState(req,result.data.map(item=>item.id));
    const cardsHtml=req.query.cards==='1'?await new Promise<string>((resolve,reject)=>res.render('partials/feed-page',{feed:result.data,...voteState},(error,html)=>error?reject(error):resolve(html))):undefined;
    res.json({
      success: true,cardsHtml,
      ...voteState,
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
    const user = schoolUser(req);
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

    let data;
    try { data=await saveComment({submissionId,body,parentId,anonToken,displayName:user?(user.display_name??user.full_name??user.email?.split('@')[0]??'Student'):'Anonymous Student'}); }
    catch(error){if(error instanceof CommunityError)return res.status(error.status).json({success:false,error:error.message});throw error;}

    invalidateCache(`comments_${submissionId}`);
    invalidateCache(`submission_${submissionId}`);
    invalidateCache("feed_");
    invalidateCache("roadmap_");

    res.json({ success: true, data });
  })
);

/* ── Toggle bookmark ──────────────────────────────────────────────────────── */
router.post(
  "/bookmarks/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = schoolUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Sign in to bookmark ideas." });
    }

    const { id: submissionId } = req.params;
    const { action } = req.body as { action?: unknown };

    if (action !== "add" && action !== "remove") {
      return res.status(400).json({ success: false, error: "Action must be 'add' or 'remove'." });
    }

    if (action === "remove") {
      const result = await supabaseService
        .from("bookmarks")
        .delete()
        .match({ user_id: user.id, submission_id: submissionId });
      if(result.error)throw new Error("Bookmark could not be removed.");
    } else {
      const result = await supabaseService
        .from("bookmarks")
        .upsert(
          { user_id: user.id, submission_id: submissionId },
          { onConflict: "user_id,submission_id" }
        );
      if(result.error)throw new Error("Bookmark could not be saved.");
    }

    invalidateCache("account_bookmarks_"+user.id);
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
      return res.json({ success: true, categories: schoolCategories().map(c=>c.name) });
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

export default router;
