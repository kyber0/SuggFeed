"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ThumbsUp,
  Check,
  Send,
  EyeOff,
  Calendar,
  Tag,
  Paperclip,
  FileText,
  ZoomIn,
  ArrowLeft,
  X,
  Clock,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Share2,
  CornerDownRight,
  MessageSquare,
} from "lucide-react";
import {
  type AttachmentFile,
  type Comment,
  type PublishedSubmission,
  addComment,
  loadAttachments,
  loadComments,
  voteSubmission,
} from "../../../lib/feedback-api";
import { CommentTree } from "../../../components/comment-tree";
import { TurnstileWidget } from "../../../components/turnstile-widget";
import { getAnonToken } from "../../../lib/anon-token";
import Link from "next/link";
import { useToast } from "../../../components/toast";
import { readableStatus, relativeDateShort as relativeDate } from "../../../lib/format";

const CATEGORY_THEME: Record<string, { bg: string; text: string; border: string }> = {
  Facilities:    { bg: "rgba(11, 56, 87, 0.08)", text: "var(--navy)", border: "rgba(11, 56, 87, 0.2)" },
  Learning:      { bg: "rgba(16, 185, 129, 0.08)", text: "#10b981", border: "rgba(16, 185, 129, 0.2)" },
  Safety:        { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
  "Student life":{ bg: "rgba(245, 158, 11, 0.08)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.2)" },
  Other:         { bg: "rgba(100, 116, 139, 0.08)", text: "#64748b", border: "rgba(100, 116, 139, 0.2)" },
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof CheckCircle2;
    dotColor: string;
    badgeBg: string;
    badgeText: string;
    bannerTitle: string;
    bannerDesc: string;
  }
> = {
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    dotColor: "#0d9488",
    badgeBg: "rgba(13, 148, 136, 0.12)",
    badgeText: "#0d9488",
    bannerTitle: "Resolution Completed",
    bannerDesc: "This suggestion has been addressed and marked as completed by campus administration.",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    dotColor: "var(--navy)",
    badgeBg: "rgba(11, 56, 87, 0.1)",
    badgeText: "var(--navy)",
    bannerTitle: "Under Active Development",
    bannerDesc: "Campus teams are currently working on planning and implementing this proposal.",
  },
  approved: {
    label: "Approved",
    icon: Sparkles,
    dotColor: "#10b981",
    badgeBg: "rgba(16, 185, 129, 0.12)",
    badgeText: "#10b981",
    bannerTitle: "Proposal Approved",
    bannerDesc: "This proposal has been accepted and scheduled for upcoming campus improvements.",
  },
};

interface Props {
  initialIdea: PublishedSubmission;
  turnstileSiteKey?: string;
}

export function IdeaClient({ initialIdea, turnstileSiteKey }: Props) {
  const { toast } = useToast();
  const [idea, setIdea]                             = useState(initialIdea);
  const [comments, setComments]                     = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading]       = useState(true);
  const [attachments, setAttachments]               = useState<AttachmentFile[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [lightbox, setLightbox]                     = useState<string | null>(null);
  const [body, setBody]                             = useState("");
  const [submitting, setSubmitting]                 = useState(false);
  const [formError, setFormError]                   = useState("");
  const [turnstileToken, setTurnstileToken]         = useState("");
  const [votedIds, setVotedIds]                     = useState<Set<string>>(new Set());
  const [votingId, setVotingId]                     = useState<string | null>(null);
  const [anonToken, setAnonToken]                   = useState("");
  const [copied, setCopied]                         = useState(false);
  const [isFocused, setIsFocused]                   = useState(false);
  const [replyingTo, setReplyingTo]                 = useState<{ id: string; name: string } | null>(null);
  const [mobileTab, setMobileTab]                   = useState<"details" | "comments">("comments");

  const commentListRef = useRef<HTMLDivElement>(null);
  const formRef        = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setAnonToken(getAnonToken());
    try {
      const raw = localStorage.getItem("sf_voted") ?? localStorage.getItem("cv_voted");
      if (raw) setVotedIds(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setCommentsLoading(true);
    loadComments(idea.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [idea.id]);

  useEffect(() => {
    if ((idea.attachments?.length ?? 0) === 0) {
      setAttachments([]);
      setAttachmentsLoading(false);
      return;
    }
    setAttachmentsLoading(true);
    loadAttachments(idea.id)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [idea.id, idea.attachments?.length]);

  const scrollToLatest = useCallback(() => {
    setTimeout(() => {
      if (commentListRef.current) {
        commentListRef.current.scrollTop = commentListRef.current.scrollHeight;
      }
    }, 60);
  }, []);

  const handleReplySelect = useCallback((commentId: string, authorName: string) => {
    if (replyingTo?.id === commentId) {
      setReplyingTo(null);
    } else {
      setReplyingTo({ id: commentId, name: authorName });
      setIsFocused(true);
      setTimeout(() => {
        const textarea = document.getElementById(`comment-body-${idea.id}`) as HTMLTextAreaElement | null;
        textarea?.focus();
      }, 50);
    }
  }, [idea.id, replyingTo?.id]);

  async function handleVote() {
    if (votingId === idea.id) return;
    setVotingId(idea.id);
    const wasVoted = votedIds.has(idea.id);
    const nextCount = wasVoted ? Math.max(0, idea.vote_count - 1) : idea.vote_count + 1;
    setIdea((prev) => ({ ...prev, vote_count: nextCount }));
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(idea.id);
      else next.add(idea.id);
      try {
        localStorage.setItem("sf_voted", JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });

    try {
      await voteSubmission(idea.id, anonToken);
    } catch {
      // Rollback
      setIdea((prev) => ({ ...prev, vote_count: wasVoted ? prev.vote_count + 1 : prev.vote_count - 1 }));
      setVotedIds((prev) => {
        const next = new Set(prev);
        if (wasVoted) next.add(idea.id);
        else next.delete(idea.id);
        return next;
      });
      toast("Couldn't update vote.", "error");
    } finally {
      setVotingId(null);
    }
  }

  async function handleCommentSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (body.trim().length < 10) {
      setFormError("Comment must be at least 10 characters.");
      return;
    }
    if (!turnstileToken && (turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) {
      setFormError("Please complete the spam check.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addComment({
        submissionId: idea.id,
        body: body.trim(),
        anonToken,
        turnstileToken: turnstileToken || "dev-bypass",
        parentId: replyingTo?.id,
      });
      setComments((c) => [...c, result.comment]);
      setBody("");
      setTurnstileToken("");
      setIsFocused(false);
      setReplyingTo(null);
      scrollToLatest();
      toast("Comment posted successfully!", "success");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  const voted = votedIds.has(idea.id);
  const categoryName = idea.categories?.name ?? "Other";
  const catTheme = CATEGORY_THEME[categoryName] ?? CATEGORY_THEME.Other;
  const currentStatus = STATUS_CONFIG[idea.status] ?? {
    label: readableStatus(idea.status),
    icon: Sparkles,
    dotColor: "var(--navy)",
    badgeBg: "rgba(11, 56, 87, 0.1)",
    badgeText: "var(--navy)",
    bannerTitle: "Active Proposal",
    bannerDesc: "This suggestion is open for student community discussion and feedback.",
  };
  const StatusIcon = currentStatus.icon;

  return (
    <div className="idea-page-wrap">
      <Link href="/feed" className="back-link">
        <ArrowLeft size={16} /> Back to all ideas
      </Link>

      <div className="detail-panel-split standalone-split">
        {/* ── Header ── */}
        <div className="detail-panel-header">
          <div className="detail-panel-badges">
            <span
              className="detail-category-badge"
              style={{
                background: catTheme.bg,
                color: catTheme.text,
                borderColor: catTheme.border,
              }}
            >
              <Tag size={12} strokeWidth={2} />
              {categoryName}
            </span>
            <span
              className="detail-status-pill"
              style={{
                background: currentStatus.badgeBg,
                color: currentStatus.badgeText,
              }}
            >
              <span
                className="status-dot"
                style={{ background: currentStatus.dotColor }}
              />
              {currentStatus.label}
            </span>
          </div>

          <div className="detail-header-actions">
            <button
              className="panel-action-btn"
              onClick={() => {
                const url = window.location.href;
                navigator.clipboard.writeText(url);
                toast("Link copied to clipboard!", "success");
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label="Share"
              title="Copy link"
            >
              {copied ? (
                <Check size={16} strokeWidth={2.5} color="#10b981" />
              ) : (
                <Share2 size={16} strokeWidth={2} />
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile Tab Navigation (FB-style comments sheet toggle) ── */}
        <div className="detail-mobile-tabs" role="tablist" aria-label="Proposal sections">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "comments"}
            className={`detail-mobile-tab ${mobileTab === "comments" ? "active" : ""}`}
            onClick={() => setMobileTab("comments")}
          >
            <MessageSquare size={14} />
            <span>Comments ({comments.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "details"}
            className={`detail-mobile-tab ${mobileTab === "details" ? "active" : ""}`}
            onClick={() => setMobileTab("details")}
          >
            <FileText size={14} />
            <span>Proposal Details</span>
          </button>
        </div>

        {/* ── Two-column body ── */}
        <div className="detail-panel-columns" data-mobile-tab={mobileTab}>
          {/* ── LEFT: Details & Impact (50%) ── */}
          <div className="detail-col detail-col-left">
            <div className="detail-author-row">
              <div className="detail-author-profile">
                <div className="detail-author-avatar">
                  <EyeOff size={13} strokeWidth={2} />
                </div>
                <span className="detail-author-name">Anonymous Student</span>
              </div>
              <span className="detail-date-badge">
                <Calendar size={13} strokeWidth={2} />
                {new Date(idea.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>

            <h2 className="detail-panel-title">{idea.title}</h2>

            {/* Status callout banner */}
            <div className={`detail-status-banner ${idea.status}`}>
              <StatusIcon size={20} strokeWidth={2} className="detail-status-banner-icon" />
              <div className="detail-status-banner-content">
                <span className="detail-status-banner-title">{currentStatus.bannerTitle}</span>
                <span className="detail-status-banner-desc">{currentStatus.bannerDesc}</span>
              </div>
            </div>

            {/* Support Hero Card */}
            <div className="detail-support-card">
              <button
                className={`detail-support-btn${voted ? " voted" : ""}`}
                onClick={handleVote}
                disabled={votingId === idea.id}
                aria-label={voted ? "Remove support" : "Support this idea"}
                title={voted ? "Click to remove your support" : "Support this idea"}
              >
                {voted ? (
                  <Check size={16} strokeWidth={2.5} />
                ) : (
                  <ThumbsUp size={16} strokeWidth={2} />
                )}
                <span className="detail-support-count">{idea.vote_count}</span>
                <span>{voted ? "Supported" : "Support this idea"}</span>
              </button>

              <div className="detail-support-info">
                <span className="detail-support-info-strong">
                  {idea.vote_count} {idea.vote_count === 1 ? "student supports" : "students support"}
                </span>
                <span>Prioritizing campus budget & resources</span>
              </div>
            </div>

            {/* Proposal Description */}
            <div className="detail-description-section">
              <div className="detail-section-header">
                <FileText size={13} strokeWidth={2} />
                <span>Proposal Description</span>
              </div>
              <div className="detail-description-box">
                <p className="detail-description-text">{idea.description}</p>
              </div>
            </div>

            {/* Attachments */}
            {(idea.attachments?.length ?? 0) > 0 && (
              <div className="detail-attachments-section">
                <div className="detail-section-header">
                  <Paperclip size={13} strokeWidth={2} />
                  <span>Attachments ({attachmentsLoading ? "…" : attachments.length})</span>
                </div>
                {attachmentsLoading ? (
                  <div className="attachment-skeleton skeleton" />
                ) : (
                  <div className="attachment-grid">
                    {attachments.map((file) =>
                      file.mime_type.startsWith("image/") ? (
                        <button
                          key={file.id}
                          className="attachment-thumb"
                          onClick={() => setLightbox(file.url)}
                          title={file.name}
                          aria-label={`View ${file.name}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={file.url || undefined}
                            alt={file.name}
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.style.display = "none";
                              const placeholder = img.nextElementSibling as HTMLElement | null;
                              if (placeholder) placeholder.style.display = "flex";
                            }}
                          />
                          <span className="attachment-placeholder" aria-hidden="true">🖼</span>
                          <span className="attachment-zoom"><ZoomIn size={14} /></span>
                        </button>
                      ) : (
                        <a
                          key={file.id}
                          href={file.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="attachment-file-card"
                          title={file.name}
                        >
                          <FileText size={20} strokeWidth={1.5} />
                          <span>{file.name}</span>
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mobile jump to comments CTA */}
            <div className="mobile-jump-comments-bar">
              <button
                type="button"
                className="mobile-jump-comments-btn"
                onClick={() => setMobileTab("comments")}
              >
                <MessageSquare size={15} />
                <span>Join Discussion ({comments.length} comments) →</span>
              </button>
            </div>
          </div>

          <div className="detail-col-divider" />

          {/* ── RIGHT: Threaded Comments & Composer (50%) ── */}
          <div className="detail-col detail-col-right">
            {/* Mobile context preview (FB-style: idea preview above scrollable comments) */}
            <div className="mobile-comments-context-header">
              <div className="mobile-context-info">
                <span className="mobile-context-tag">{categoryName}</span>
                <p className="mobile-context-title">{idea.title}</p>
              </div>
              <button
                type="button"
                className="mobile-context-view-btn"
                onClick={() => setMobileTab("details")}
              >
                View Proposal
              </button>
            </div>

            <div className="detail-comments-scrollable" ref={commentListRef}>
              <CommentTree
                submissionId={idea.id}
                comments={comments}
                onCommentAdded={(newComment) => {
                  setComments((cur) => [...cur, newComment]);
                  scrollToLatest();
                }}
                anonToken={anonToken}
                replyingToId={replyingTo?.id ?? null}
                onReply={handleReplySelect}
              />
            </div>

            {/* Compact, clean comment composer */}
            <form
              ref={formRef}
              className={`comment-composer-form ${isFocused || body ? "expanded" : ""}`}
              onSubmit={handleCommentSubmit}
              noValidate
            >
              <div className="comment-input-card">
                {replyingTo && (
                  <div className="replying-banner">
                    <div className="replying-banner-text">
                      <CornerDownRight size={12} />
                      <span>Replying to <strong>@{replyingTo.name}</strong></span>
                    </div>
                    <button
                      type="button"
                      className="replying-cancel-btn"
                      onClick={() => setReplyingTo(null)}
                      aria-label="Cancel reply"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <div className="comment-input-main">
                  <textarea
                    id={`comment-body-${idea.id}`}
                    className="comment-textarea-compact"
                    value={body}
                    onFocus={() => setIsFocused(true)}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setFormError("");
                    }}
                    maxLength={500}
                    rows={isFocused || body ? 2 : 1}
                    placeholder={replyingTo ? `Reply to @${replyingTo.name}…` : "Add a comment…"}
                  />
                  {!isFocused && !body && (
                    <button
                      type="button"
                      className="comment-quick-focus-btn"
                      onClick={() => {
                        setIsFocused(true);
                        document.getElementById(`comment-body-${idea.id}`)?.focus();
                      }}
                      aria-label="Write a comment"
                    >
                      <Send size={13} />
                    </button>
                  )}
                </div>

                {/* Turnstile tray (only show if site key exists and not yet verified and user is typing/focused) */}
                {!turnstileToken && (isFocused || body) && !!(turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && (
                  <div className="comment-turnstile-tray">
                    <div className="turnstile-tray-header">
                      <ShieldCheck size={12} />
                      <span>Security verification</span>
                    </div>
                    <div className="turnstile-tray-widget">
                      <TurnstileWidget
                        siteKey={turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                        onToken={setTurnstileToken}
                      />
                    </div>
                  </div>
                )}

                {/* Expanded bottom action bar */}
                {(isFocused || body) && (
                  <div className="comment-composer-bottom-bar">
                    <div className="comment-composer-status">
                      {turnstileToken ? (
                        <span className="turnstile-verified-tag">
                          <Check size={11} strokeWidth={2.5} /> Verified
                        </span>
                      ) : (
                        <span className="comment-char-tag">
                          {body.length}/500 {body.length > 0 && body.trim().length < 10 && "· Min 10 chars"}
                        </span>
                      )}
                    </div>

                    <div className="comment-composer-buttons">
                      {!body && (
                        <button
                          type="button"
                          className="btn-comment-cancel"
                          onClick={() => setIsFocused(false)}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className="btn-comment-post"
                        type="submit"
                        disabled={
                          submitting ||
                          body.trim().length < 10 ||
                          (!turnstileToken && !!(turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY))
                        }
                        aria-label="Post comment"
                      >
                        {submitting ? (
                          <>
                            <span className="comment-send-spinner" />
                            <span>Posting…</span>
                          </>
                        ) : (
                          <>
                            <Send size={12} strokeWidth={2} />
                            <span>{replyingTo ? "Reply" : "Comment"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="comment-form-error">
                  <AlertCircle size={13} />
                  <span>{formError}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Attachment" className="lightbox-img" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)}>
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
