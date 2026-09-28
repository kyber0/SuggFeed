"use client";

import { useState, useMemo, MouseEvent, useEffect } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Flag,
  Copy,
  Check,
  Eye,
  EyeOff,
  Maximize2,
  Paperclip,
  ShieldAlert,
  Flame,
  Link as LinkIcon,
} from "lucide-react";
import type { PublishedSubmission } from "../lib/feedback-api";
import { relativeDateShort as relativeDate } from "../lib/format";
import { useToast } from "./toast";
import { useAuth } from "./auth-context";

interface PostCardProps {
  item: PublishedSubmission;
  isVoted: boolean;
  isVoting: boolean;
  isBookmarked?: boolean;
  onVote: (id: string) => void;
  onSelect: (item: PublishedSubmission) => void;
  onCommentClick?: (item: PublishedSubmission) => void;
  onBookmarkToggle?: (id: string) => void;
  isKeyboardFocused?: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Facilities:   { bg: "rgba(59, 130, 246, 0.12)", text: "#3B82F6", border: "rgba(59, 130, 246, 0.25)" },
  Learning:     { bg: "rgba(16, 185, 129, 0.12)", text: "#10B981", border: "rgba(16, 185, 129, 0.25)" },
  Safety:       { bg: "rgba(239, 68, 68, 0.12)",  text: "#EF4444", border: "rgba(239, 68, 68, 0.25)" },
  "Student life":{ bg: "rgba(245, 158, 11, 0.12)", text: "#F59E0B", border: "rgba(245, 158, 11, 0.25)" },
  Other:        { bg: "rgba(100, 116, 139, 0.12)",text: "#94A3B8", border: "rgba(100, 116, 139, 0.25)" },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  approved:    { color: "#10B981", label: "Approved" },
  in_progress: { color: "#3B82F6", label: "In Progress" },
  resolved:    { color: "#0D9488", label: "Resolved" },
};

export function SkeletonPostCard() {
  return (
    <article className="post-card skeleton-card">
      <div className="post-header">
        <div className="skeleton-avatar skeleton" />
        <div className="skeleton-meta">
          <div className="skeleton-line short skeleton" />
          <div className="skeleton-line medium skeleton" />
        </div>
      </div>
      <div className="skeleton-line full skeleton" style={{ margin: "12px 0 8px" }} />
      <div className="skeleton-line full skeleton" />
      <div className="skeleton-line medium skeleton" style={{ marginTop: 6 }} />
      <div className="post-footer" style={{ marginTop: 16 }}>
        <div className="skeleton-pill skeleton" />
        <div className="skeleton-pill skeleton" />
        <div className="skeleton-pill skeleton" />
      </div>
    </article>
  );
}

export function PostCard({
  item,
  isVoted,
  isVoting,
  isBookmarked = false,
  onVote,
  onSelect,
  onCommentClick,
  onBookmarkToggle,
  isKeyboardFocused = false,
}: PostCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  // Display name: auth profile > localStorage > anon fallback
  const [resolvedDisplayName, setResolvedDisplayName] = useState<string | null>(null);
  const [resolvedAnon, setResolvedAnon] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem("sf_display_name") ?? localStorage.getItem("cv_display_name") ?? "";
    const isAnon = (localStorage.getItem("sf_anon_pref") ?? localStorage.getItem("cv_anon_pref")) === "true";
    setResolvedAnon(isAnon);

    if (!isAnon && storedName) {
      setResolvedDisplayName(storedName);
    } else if (!isAnon && user) {
      const name = user.user_metadata?.full_name ?? user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? null;
      setResolvedDisplayName(name);
    } else {
      setResolvedDisplayName(null);
    }
  }, [user]);

  const authorName = resolvedAnon
    ? "Anonymous"
    : (resolvedDisplayName || "Community Member");

  const authorHandle = resolvedAnon
    ? "@anon"
    : resolvedDisplayName
      ? `@${resolvedDisplayName.toLowerCase().replace(/\s+/g, "")}`
      : "@member";

  // Show "Show more" if body is longer than ~200 chars (likely to be clipped by CSS)
  const isLongBody = item.description.length > 200;

  // Generate deterministic avatar gradient from item.id
  const avatarBg = useMemo(() => {
    const colors = [
      "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
      "linear-gradient(135deg, #10B981 0%, #047857 100%)",
      "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
      "linear-gradient(135deg, #EC4899 0%, #BE185D 100%)",
      "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
      "linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)",
    ];
    let hash = 0;
    for (let i = 0; i < item.id.length; i++) {
      hash = item.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [item.id]);

  const avatarInitial = resolvedAnon
    ? "?"
    : (resolvedDisplayName?.[0]?.toUpperCase() ?? authorName[0]?.toUpperCase() ?? "C");

  const catName = item.categories?.name ?? "Other";
  const catStyle = CATEGORY_COLORS[catName] || CATEGORY_COLORS.Other;
  const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.approved;
  const commentCount = item.comment_count ?? item.comments?.[0]?.count ?? 0;

  // Format body text with clickable hashtags
  const formattedBody = useMemo(() => {
    const parts = item.description.split(/(#[a-zA-Z0-9_-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith("#")) {
        return (
          <span key={index} className="post-hashtag">
            {part}
          </span>
        );
      }
      return part;
    });
  }, [item.description]);

  const handleCopyLink = (e: MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/idea/${item.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast("Link copied to clipboard!", "success");
    setTimeout(() => setCopied(false), 2000);
    setMenuOpen(false);
    setShareMenuOpen(false);
  };

  const handleShare = (e: MouseEvent) => {
    e.stopPropagation();
    // Use Web Share API if available (mobile), else show share menu
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: item.description.slice(0, 100),
        url: `${window.location.origin}/idea/${item.id}`,
      }).catch(() => {/* user dismissed */});
    } else {
      setShareMenuOpen((prev) => !prev);
    }
  };

  const handleReport = (e: MouseEvent) => {
    e.stopPropagation();
    toast("Post reported to community moderators. Thank you.", "info");
    setMenuOpen(false);
  };

  return (
    <article
      className={`post-card ${isKeyboardFocused ? "post-card--focused" : ""}`}
      tabIndex={0}
      role="article"
      aria-label={`Post: ${item.title}`}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onSelect(item);
        }
      }}
    >
      {/* ── Post Header ── */}
      <div className="post-header">
        <div className="post-avatar" style={{ background: avatarBg }}>
          {avatarInitial}
        </div>

        <div className="post-author-meta">
          <div className="post-author-row">
            <span className="post-author-name">{authorName}</span>
            <span className="post-author-handle">{authorHandle}</span>
            <span className="post-dot">·</span>
            <time className="post-timestamp" title={new Date(item.created_at).toLocaleString()}>
              {relativeDate(item.created_at)}
            </time>
            {(item.vote_count ?? 0) >= 50 && (
              <span className="post-trending-badge">
                <Flame size={10} />
                Trending
              </span>
            )}
          </div>

          <div className="post-badges-row">
            <span
              className="post-badge-category"
              style={{
                backgroundColor: catStyle.bg,
                color: catStyle.text,
                borderColor: catStyle.border,
              }}
            >
              {catName}
            </span>

            <span
              className="post-badge-status"
              style={{
                backgroundColor: `${statusInfo.color}15`,
                color: statusInfo.color,
                borderColor: `${statusInfo.color}35`,
              }}
            >
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* More Actions Menu */}
        <div className="post-overflow-menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Post actions"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={16} />
          </button>

          {menuOpen && (
            <div className="post-dropdown-menu" onMouseLeave={() => setMenuOpen(false)}>
              <button type="button" onClick={handleCopyLink} className="dropdown-action">
                {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                <span>{copied ? "Copied" : "Copy link to idea"}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSensitive(!isSensitive);
                  setMenuOpen(false);
                }}
                className="dropdown-action"
              >
                {isSensitive ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{isSensitive ? "Unhide preview" : "Mark as spoiler / blur"}</span>
              </button>
              <button type="button" onClick={handleReport} className="dropdown-action danger">
                <Flag size={14} />
                <span>Report post</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Post Content ── */}
      <div className="post-content">
        <h3 className="post-title">{item.title}</h3>

        {isSensitive && !revealed ? (
          <div
            className="post-spoiler-overlay"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
          >
            <ShieldAlert size={20} className="spoiler-icon" />
            <span>Marked as sensitive / spoiler</span>
            <button type="button" className="btn-reveal-pill">
              Click to reveal
            </button>
          </div>
        ) : (
          <>
            <p className={`post-body${bodyExpanded ? " post-body--expanded" : ""}`}>
              {formattedBody}
            </p>
            {isLongBody && (
              <button
                type="button"
                className="btn-show-more"
                onClick={(e) => {
                  e.stopPropagation();
                  setBodyExpanded((prev) => !prev);
                }}
              >
                {bodyExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Optional Media / Attachment preview ── */}
      {(item.attachments?.length ?? 0) > 0 && (
        <div className="post-media-container" onClick={(e) => e.stopPropagation()}>
          <div className="post-attachment-pill" onClick={() => onSelect(item)}>
            <Paperclip size={13} />
            <span>
              {item.attachments.length} attachment{item.attachments.length > 1 ? "s" : ""}
            </span>
            <span className="attachment-cta">View files →</span>
          </div>
        </div>
      )}

      {/* ── Action Footer: Like, Comment, Share, Bookmark, Expand ── */}
      <div className="post-footer" onClick={(e) => e.stopPropagation()}>
        {/* Heart / Like */}
        <button
          type="button"
          className={`action-btn action-like ${isVoted ? "active" : ""}`}
          onClick={() => onVote(item.id)}
          disabled={isVoting}
          aria-label={isVoted ? "Undo like" : "Like post"}
          title={isVoted ? "Undo like" : "Like this idea"}
        >
          <Heart size={16} strokeWidth={isVoted ? 0 : 2} fill={isVoted ? "var(--like)" : "none"} />
          <span className="action-count">{item.vote_count}</span>
        </button>

        {/* Comment */}
        <button
          type="button"
          className="action-btn action-comment"
          onClick={() => {
            if (onCommentClick) onCommentClick(item);
            else onSelect(item);
          }}
          aria-label={`View ${commentCount} comments`}
          title="Open comments"
        >
          <MessageCircle size={16} strokeWidth={2} />
          <span className="action-count">{commentCount}</span>
        </button>

        {/* Share */}
        <div className="post-share-wrap" style={{ position: "relative" }}>
          <button
            type="button"
            className={`action-btn action-share ${shareMenuOpen ? "active" : ""}`}
            onClick={handleShare}
            aria-label="Share idea"
            title="Share this idea"
          >
            <Share2 size={16} strokeWidth={2} />
            <span className="action-count action-label">Share</span>
          </button>

          {shareMenuOpen && (
            <div
              className="post-dropdown-menu post-share-menu"
              onMouseLeave={() => setShareMenuOpen(false)}
              style={{ bottom: "calc(100% + 6px)", top: "auto", right: 0, left: "auto", minWidth: 180 }}
            >
              <button type="button" onClick={handleCopyLink} className="dropdown-action">
                {copied ? <Check size={14} color="#10B981" /> : <LinkIcon size={14} />}
                <span>{copied ? "Copied!" : "Copy link"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Bookmark */}
        <button
          type="button"
          className={`action-btn action-bookmark ${isBookmarked ? "active" : ""}`}
          onClick={() => onBookmarkToggle?.(item.id)}
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark post"}
          title={isBookmarked ? "Remove bookmark" : "Bookmark this idea"}
        >
          <Bookmark
            size={16}
            strokeWidth={isBookmarked ? 0 : 2}
            fill={isBookmarked ? "var(--bookmark)" : "none"}
          />
          <span className="action-count action-label">{isBookmarked ? "Saved" : "Save"}</span>
        </button>

        {/* Expand / View Details */}
        <button
          type="button"
          className="action-btn action-expand"
          onClick={() => onSelect(item)}
          aria-label="Expand details"
          title="Expand idea details"
        >
          <Maximize2 size={15} strokeWidth={2} />
        </button>
      </div>
    </article>
  );
}
