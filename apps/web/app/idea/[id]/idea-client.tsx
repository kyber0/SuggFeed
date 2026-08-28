"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ThumbsUp, Check, MessageSquare, Send, EyeOff,
  Calendar, Activity, Tag, Paperclip, FileText, ZoomIn, ArrowLeft, X
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
import { TurnstileWidget } from "../../../components/turnstile-widget";
import { getAnonToken } from "../../../lib/anon-token";
import Link from "next/link";
import { useToast } from "../../../components/toast";

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
  initialIdea: PublishedSubmission;
  turnstileSiteKey?: string;
}

export function IdeaClient({ initialIdea, turnstileSiteKey }: Props) {
  const { toast } = useToast();
  const [idea, setIdea] = useState(initialIdea);
  const [comments, setComments]                 = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading]   = useState(true);
  const [attachments, setAttachments]           = useState<AttachmentFile[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [lightbox, setLightbox]                 = useState<string | null>(null);
  const [body, setBody]                         = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [formError, setFormError]               = useState("");
  const [turnstileToken, setTurnstileToken]     = useState("");
  const [votedIds, setVotedIds]                 = useState<Set<string>>(new Set());
  const [votingId, setVotingId]                 = useState<string | null>(null);
  const [anonToken, setAnonToken]               = useState("");

  const commentListRef = useRef<HTMLDivElement>(null);
  const formRef        = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setAnonToken(getAnonToken());
    try {
      const raw = localStorage.getItem("cv_voted");
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
    if ((idea.attachments?.length ?? 0) === 0) { setAttachments([]); setAttachmentsLoading(false); return; }
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

  async function handleCommentSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (body.trim().length < 10) { setFormError("Comment must be at least 10 characters."); return; }
    if (!turnstileToken) { setFormError("Please complete the spam check."); return; }
    setSubmitting(true);
    try {
      const result = await addComment({
        submissionId:   idea.id,
        body:           body.trim(),
        anonToken,
        turnstileToken,
      });
      setComments((c) => [...c, result.comment]);
      setBody("");
      setTurnstileToken(""); 
      scrollToLatest();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote() {
    if (votingId) return;
    const isUnvote = votedIds.has(idea.id);

    const nextVotedIds = new Set(votedIds);
    if (isUnvote) { nextVotedIds.delete(idea.id); } else { nextVotedIds.add(idea.id); }
    setVotedIds(nextVotedIds);
    localStorage.setItem("cv_voted", JSON.stringify([...nextVotedIds]));
    
    setIdea(prev => ({
      ...prev,
      vote_count: Math.max(0, prev.vote_count + (isUnvote ? -1 : 1))
    }));

    setVotingId(idea.id);
    try {
      const { voteCount } = await voteSubmission(idea.id, anonToken);
      setIdea(prev => ({ ...prev, vote_count: voteCount }));
    } catch (error) {
      setVotedIds(new Set(votedIds));
      setIdea(prev => ({
        ...prev,
        vote_count: Math.max(0, prev.vote_count + (isUnvote ? 1 : -1))
      }));
      localStorage.setItem("cv_voted", JSON.stringify([...votedIds]));
      toast(error instanceof Error ? error.message : "Couldn't record your vote.", "error");
    } finally { setVotingId(null); }
  }

  const voted = votedIds.has(idea.id);
  const statusColor = STATUS_COLOR[idea.status] ?? "#627d98";

  return (
    <div className="standalone-container">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Back to all ideas
      </Link>

      <div className="detail-panel-split standalone-split">
        <div className="detail-panel-header">
          <div className="detail-panel-badges">
            <span className="tag">{idea.categories?.name ?? "Other"}</span>
            <span className="status-badge" style={{ background: `${statusColor}18`, color: statusColor }}>
              {readableStatus(idea.status)}
            </span>
          </div>
        </div>

        <div className="detail-panel-columns">
          <div className="detail-col detail-col-left">
            <h2 className="detail-panel-title">{idea.title}</h2>
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

            <div className="detail-vote-row">
              <button
                className={`vote-btn large${voted ? " voted" : ""}`}
                onClick={handleVote}
                disabled={votingId === idea.id}
              >
                {voted
                  ? <Check size={16} strokeWidth={2.5} className="vote-arrow" />
                  : <ThumbsUp size={16} strokeWidth={2} className="vote-arrow" />}
                <span>{idea.vote_count}</span>
                <span className="vote-label">{voted ? "Supported — click to undo" : "Support this idea"}</span>
              </button>
            </div>

            <div className="detail-description">
              <p className="eyebrow" style={{ marginBottom: 10 }}>
                <Tag size={11} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
                DESCRIPTION
              </p>
              <p style={{ color: "var(--ink)", lineHeight: 1.8, whiteSpace: "pre-wrap", fontSize: 14 }}>
                {idea.description}
              </p>
            </div>

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

          <div className="detail-col-divider" />

          <div className="detail-col detail-col-right">
            <p className="eyebrow" style={{ marginBottom: 14 }}>
              <MessageSquare size={11} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 4 }} />
              COMMENTS ({commentsLoading ? "…" : comments.length})
            </p>

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
            </div>

            <form
              ref={formRef}
              className="comment-form"
              onSubmit={handleCommentSubmit}
              noValidate
            >
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onToken={setTurnstileToken}
              />
              <div className="comment-input-row">
                <textarea
                  id={`comment-body-${idea.id}`}
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setFormError(""); }}
                  maxLength={500}
                  rows={1}
                  placeholder="Share your thoughts…"
                />
                <button className="comment-send-btn" type="submit" disabled={submitting || !turnstileToken}>
                  {submitting
                    ? <span className="comment-send-spinner" />
                    : <Send size={16} strokeWidth={2} />}
                </button>
              </div>
              {formError && <p className="comment-error">{formError}</p>}
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
