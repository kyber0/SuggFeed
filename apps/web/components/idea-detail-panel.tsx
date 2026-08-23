"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  X, ThumbsUp, Check, MessageSquare, Send, EyeOff,
  Calendar, Activity, Tag, Paperclip, FileText, ZoomIn,
} from "lucide-react";
import {
  type AttachmentFile,
  type Comment,
  type PublishedSubmission,
  addComment,
  loadAttachments,
  loadComments,
} from "../lib/feedback-api";


function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
}

function readableStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_COLOR: Record<string, string> = {
  approved:    "#11845b",
  in_progress: "#1d6fa4",
  resolved:    "#5a3ea1",
};

interface Props {
  idea: PublishedSubmission;
  votedIds: Set<string>;
  votingId: string | null;
  onVote: (id: string) => void;
  onClose: () => void;
  anonToken: string;
}

export function IdeaDetailPanel({
  idea,
  votedIds,
  votingId,
  onVote,
  onClose,
  anonToken,
}: Props) {
  const [comments, setComments]                 = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading]   = useState(true);
  const [attachments, setAttachments]           = useState<AttachmentFile[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [lightbox, setLightbox]                 = useState<string | null>(null);
  const [body, setBody]                         = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [formError, setFormError]               = useState("");
  const commentListRef = useRef<HTMLDivElement>(null);
  const formRef        = useRef<HTMLFormElement>(null);


  // Lock scroll while panel is open.
  // Using overflow:hidden on <html> (not position:fixed on body) keeps the
  // document's scroll position intact so there is no visual jump on open/close.
  useEffect(() => {
    const html = document.documentElement;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Slide the header up when the panel opens.
    const header = document.querySelector<HTMLElement>(".site-header");
    if (header) {
      header.classList.remove("header-reveal");
      header.classList.add("header-hide");
    }

    return () => {
      html.style.overflow = "";
      document.body.style.overflow = "";

      // Slide the header back down when the panel closes.
      if (header) {
        header.classList.remove("header-hide");
        header.classList.add("header-reveal");
        header.addEventListener(
          "animationend",
          () => header.classList.remove("header-reveal"),
          { once: true }
        );
      }
    };
  }, []);

  // Load comments and attachments when idea changes
  useEffect(() => {
    setCommentsLoading(true);
    loadComments(idea.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [idea.id]);

  useEffect(() => {
    if ((idea.attachments?.length ?? 0) === 0) { setAttachments([]); setAttachmentsLoading(false); return; }
    setAttachmentsLoading(true);
    loadAttachments(idea.id)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [idea.id, idea.attachments?.length]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);



  const scrollToLatest = useCallback(() => {
    setTimeout(() => {
      if (commentListRef.current) {
        commentListRef.current.scrollTop = commentListRef.current.scrollHeight;
      }
    }, 60);
  }, []);

  async function handleCommentSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (body.trim().length < 10) { setFormError("Comment must be at least 10 characters."); return; }
    setSubmitting(true);
    try {
      const result = await addComment({
        submissionId:   idea.id,
        body:           body.trim(),
        displayName:    undefined,
        anonToken,
        turnstileToken: "",
      });
      setComments((c) => [...c, result.comment]);
      setBody("");
      scrollToLatest();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  const voted = votedIds.has(idea.id);
  const statusColor = STATUS_COLOR[idea.status] ?? "#627d98";

  return (
    <>
      {/* Backdrop */}
      <div className="panel-overlay" onClick={onClose} aria-hidden="true" />

      {/* Wide two-column drawer */}
      <aside className="detail-panel detail-panel-split" role="dialog" aria-modal="true" aria-label={idea.title}>

        {/* ── Full-width header ── */}
        <div className="detail-panel-header">
          <div className="mobile-drag-handle" aria-hidden="true" />
          <div className="detail-panel-badges">
            <span className="tag">{idea.categories?.name ?? "Other"}</span>
            <span className="status-badge" style={{ background: `${statusColor}18`, color: statusColor }}>
              {readableStatus(idea.status)}
            </span>
          </div>
          <button className="panel-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Two-column body ── */}
        <div className="detail-panel-columns">

          {/* ── LEFT: Idea details (60%) ── */}
          <div className="detail-col detail-col-left">
            <h2 className="detail-panel-title">{idea.title}</h2>

            {/* Meta row */}
            <div className="detail-meta-row">
              <span className="detail-meta-item">
                <Calendar size={13} strokeWidth={2} />
                {new Date(idea.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </span>
              <span className="detail-meta-item">
                <Activity size={13} strokeWidth={2} />
                {readableStatus(idea.status)}
              </span>
            </div>

            {/* Vote */}
            <div className="detail-vote-row">
              <button
                className={`vote-btn large${voted ? " voted" : ""}`}
                onClick={() => onVote(idea.id)}
                disabled={votingId === idea.id}
                aria-label={voted ? "Remove support" : "Support this idea"}
                title={voted ? "Click to remove your support" : "Support this idea"}
              >
                {voted
                  ? <Check size={16} strokeWidth={2.5} className="vote-arrow" />
                  : <ThumbsUp size={16} strokeWidth={2} className="vote-arrow" />}
                <span>{idea.vote_count}</span>
                <span className="vote-label">{voted ? "Supported — click to undo" : "Support this idea"}</span>
              </button>
            </div>

            {/* Full description */}
            <div className="detail-description">
              <p className="eyebrow" style={{ marginBottom: 10 }}>
                <Tag size={11} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
                DESCRIPTION
              </p>
              <p style={{ color: "var(--ink)", lineHeight: 1.8, whiteSpace: "pre-wrap", fontSize: 14 }}>
                {idea.description}
              </p>
            </div>

            {/* Attachments */}
            {(idea.attachments?.length ?? 0) > 0 && (
              <div className="detail-attachments">
                <p className="eyebrow" style={{ marginBottom: 12 }}>
                  <Paperclip size={11} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  FILES ({attachmentsLoading ? "…" : attachments.length})
                </p>
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
                          <FileText size={22} strokeWidth={1.5} />
                          <span>{file.name}</span>
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vertical divider */}
          <div className="detail-col-divider" />

          {/* ── RIGHT: Comments (40%) ── */}
          <div className="detail-col detail-col-right">
            <p className="eyebrow" style={{ marginBottom: 14 }}>
              <MessageSquare size={11} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
              COMMENTS ({commentsLoading ? "…" : comments.length})
            </p>

            {/* Comment list — grows and scrolls independently */}
            <div className="comment-list" ref={commentListRef}>
              {commentsLoading ? (
                <div className="comment-skeleton-wrap">
                  {[1, 2].map((i) => <div key={i} className="comment-skeleton skeleton" />)}
                </div>
              ) : comments.length === 0 ? (
                <div className="comment-empty">
                  <MessageSquare size={28} strokeWidth={1.25} style={{ opacity: 0.3 }} />
                  <p>No comments yet. Be the first to share your thoughts.</p>
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="comment-item">
                    <div className="comment-avatar">
                      {c.display_name ? c.display_name[0].toUpperCase() : <EyeOff size={12} strokeWidth={2} />}
                    </div>
                    <div className="comment-content">
                      <div className="comment-meta">
                        <span className="comment-name">{c.display_name ?? "Anonymous"}</span>
                        <span className="comment-date">{relativeDate(c.created_at)}</span>
                      </div>
                      <p className="comment-body">{c.body}</p>
                    </div>
                  </div>
                ))
              )}
              <div className="mobile-spacer" aria-hidden="true" />
            </div>

            {/* Comment form — sticky at bottom of right column */}
            <form
              ref={formRef}
              className="comment-form"
              onSubmit={handleCommentSubmit}
              noValidate
            >
              <div className="comment-input-row">
                <textarea
                  id={`comment-body-${idea.id}`}
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setFormError(""); }}
                  maxLength={500}
                  rows={1}
                  placeholder="Share your thoughts…"
                />
                <button className="comment-send-btn" type="submit" disabled={submitting} aria-label="Post comment">
                  {submitting
                    ? <span className="comment-send-spinner" />
                    : <Send size={16} strokeWidth={2} />}
                </button>
              </div>
              {formError && <p className="comment-error">{formError}</p>}
            </form>
          </div>
        </div>
      </aside>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Attachment" className="lightbox-img" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)} aria-label="Close image">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </>
  );
}
