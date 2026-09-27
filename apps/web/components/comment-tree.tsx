"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
  Pin,
  Lock,
  Flag,
  MoreHorizontal,
  Eye,
  EyeOff,
} from "lucide-react";
import { type Comment, reportComment } from "../lib/feedback-api";
import { relativeDateShort as relativeDate } from "../lib/format";
import { useToast } from "./toast";

export interface CommentNode extends Comment {
  children: CommentNode[];
  level: number;
}

interface CommentTreeProps {
  submissionId: string;
  comments: Comment[];
  onCommentAdded: (newComment: Comment) => void;
  anonToken: string;
  isStaff?: boolean;
  onJumpToNextTopLevel?: () => void;
  replyingToId?: string | null;
  onReply?: (commentId: string, authorName: string) => void;
}

type ThreadFilter = "top" | "newest" | "author" | "unread";

export function CommentTree({
  comments,
  isStaff = false,
  replyingToId,
  onReply,
}: CommentTreeProps) {
  const { toast } = useToast();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("newest");
  const [hiddenComments, setHiddenComments] = useState<Set<string>>(new Set());
  const [reportedComments, setReportedComments] = useState<Set<string>>(new Set());
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(1280);

  // Track viewport width for responsive nesting depth
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Max depth based on viewport: Desktop: 5, Tablet: 3, Mobile: 2
  const maxDepth = useMemo(() => {
    if (viewportWidth >= 1280) return 5;
    if (viewportWidth >= 768) return 3;
    return 2;
  }, [viewportWidth]);

  // Build tree from flat comment list
  const commentTree = useMemo(() => {
    const map = new Map<string, CommentNode>();
    const roots: CommentNode[] = [];

    // Initialize nodes
    comments.forEach((c) => {
      map.set(c.id, { ...c, children: [], level: 0 });
    });

    // Populate children
    comments.forEach((c) => {
      const node = map.get(c.id);
      if (!node) return;
      if (c.parent_id && map.has(c.parent_id)) {
        const parent = map.get(c.parent_id)!;
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        node.level = 0;
        roots.push(node);
      }
    });

    // Sort roots & children based on filter
    const sortNodes = (nodes: CommentNode[]): CommentNode[] => {
      return nodes
        .sort((a, b) => {
          // Pinned comments always on top
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;

          if (threadFilter === "newest") {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
          if (threadFilter === "top") {
            return b.children.length - a.children.length;
          }
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .map((node) => ({
          ...node,
          children: sortNodes(node.children),
        }));
    };

    return sortNodes(roots);
  }, [comments, threadFilter]);

  // Collapse / Expand toggle
  const toggleCollapse = (commentId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  // Report a comment
  const handleReport = async (commentId: string) => {
    try {
      await reportComment(commentId);
      setReportedComments((prev) => new Set(prev).add(commentId));
      setActiveMenuId(null);
      toast("Comment reported to moderators. Thank you for keeping SuggFeed safe.", "success");
    } catch {
      toast("Couldn't submit report right now.", "error");
    }
  };

  // Count total replies in a branch
  const countBranchReplies = (node: CommentNode): number => {
    return node.children.reduce((acc, child) => acc + 1 + countBranchReplies(child), 0);
  };

  // Recursive renderer for comment nodes
  const renderCommentNode = (node: CommentNode) => {
    const isCollapsed = collapsedIds.has(node.id);
    const isSelectedForReply = replyingToId === node.id;
    const isHidden = hiddenComments.has(node.id) || node.is_hidden;
    const isReported = reportedComments.has(node.id);
    const isSensitive = node.body.toLowerCase().includes("spoiler") || ((node.report_count ?? 0) > 2);
    const isRevealed = revealedSpoilers.has(node.id);
    const totalReplies = countBranchReplies(node);
    const indentPx = Math.min(node.level, maxDepth) * (viewportWidth >= 1280 ? 24 : viewportWidth >= 768 ? 16 : 12);

    return (
      <li
        key={node.id}
        role="treeitem"
        aria-level={node.level + 1}
        aria-expanded={!isCollapsed}
        className="comment-tree-node"
        style={{
          marginTop: node.level === 0 ? "16px" : "10px",
        }}
      >
        {/* Interactive Threadline */}
        {node.children.length > 0 && !isCollapsed && (
          <button
            type="button"
            className="comment-threadline"
            onClick={() => toggleCollapse(node.id)}
            title="Click to collapse thread branch"
            aria-label="Collapse comment branch"
          />
        )}

        {/* Collapsed Summary Row */}
        {isCollapsed ? (
          <div
            className="comment-collapsed-row"
            onClick={() => toggleCollapse(node.id)}
            role="button"
            tabIndex={0}
            aria-label="Expand thread branch"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleCollapse(node.id);
              }
            }}
          >
            <ChevronRight size={14} className="collapsed-icon" />
            <span className="collapsed-author">{node.display_name ?? "Anonymous Student"}</span>
            <span className="collapsed-meta">
              · {totalReplies + 1} {totalReplies + 1 === 1 ? "comment" : "replies"} · {relativeDate(node.created_at)}
            </span>
          </div>
        ) : (
          <div className={`comment-card ${node.is_pinned ? "comment-pinned" : ""} ${isSelectedForReply ? "comment-card-replying" : ""}`}>
            {/* Header: Avatar, Name, Badges, Time, Overflow Menu */}
            <div className="comment-header">
              <div className="comment-avatar-bubble">
                {node.display_name ? node.display_name[0].toUpperCase() : <EyeOff size={13} />}
              </div>

              <div className="comment-user-info">
                <span className="comment-author-name">
                  {node.display_name ?? "Anonymous Student"}
                </span>

                {node.is_pinned && (
                  <span className="comment-badge pinned" title="Pinned by moderator">
                    <Pin size={10} /> Pinned
                  </span>
                )}

                {node.user_id && (
                  <span className="comment-badge op">Member</span>
                )}

                <span className="comment-timestamp" title={new Date(node.created_at).toLocaleString()}>
                  · {relativeDate(node.created_at)}
                </span>
              </div>

              {/* Overflow Menu */}
              <div className="comment-actions-menu">
                <button
                  type="button"
                  className="btn-icon-subtle"
                  onClick={() => setActiveMenuId(activeMenuId === node.id ? null : node.id)}
                  aria-label="Comment options"
                >
                  <MoreHorizontal size={14} />
                </button>

                {activeMenuId === node.id && (
                  <div className="comment-dropdown-popover">
                    <button
                      type="button"
                      onClick={() => handleReport(node.id)}
                      disabled={isReported}
                      className="dropdown-item"
                    >
                      <Flag size={13} />
                      <span>{isReported ? "Reported" : "Report Comment"}</span>
                    </button>

                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setHiddenComments((prev) => {
                            const next = new Set(prev);
                            if (next.has(node.id)) next.delete(node.id);
                            else next.add(node.id);
                            return next;
                          });
                          setActiveMenuId(null);
                        }}
                        className="dropdown-item danger"
                      >
                        <Lock size={13} />
                        <span>{isHidden ? "Unhide" : "Hide as Mod"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Comment Body / Tombstone / Spoiler Blur */}
            {isHidden ? (
              <div className="comment-tombstone">
                <Lock size={12} />
                <span>Comment removed by moderator</span>
              </div>
            ) : isSensitive && !isRevealed ? (
              <div className="comment-spoiler-box">
                <p className="spoiler-notice">Potential sensitive or spoiler content</p>
                <button
                  type="button"
                  className="btn-reveal-spoiler"
                  onClick={() => setRevealedSpoilers((p) => new Set(p).add(node.id))}
                >
                  <Eye size={13} /> Reveal comment
                </button>
              </div>
            ) : (
              <p className="comment-body-text">{node.body}</p>
            )}

            {/* Footer: Reply Action, Collapse Trigger */}
            <div className="comment-card-footer">
              <button
                type="button"
                className={`comment-reply-btn ${isSelectedForReply ? "active" : ""}`}
                onClick={() => {
                  if (onReply) {
                    onReply(node.id, node.display_name ?? "Anonymous Student");
                  }
                }}
                aria-label={`Reply to ${node.display_name ?? "Anonymous"}`}
              >
                <CornerDownRight size={13} />
                <span>{isSelectedForReply ? "Replying…" : "Reply"}</span>
              </button>

              {node.children.length > 0 && (
                <button
                  type="button"
                  className="comment-collapse-link"
                  onClick={() => toggleCollapse(node.id)}
                  title="Collapse thread"
                >
                  <ChevronDown size={13} />
                  <span>Collapse branch ({totalReplies})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Child comments branch */}
        {node.children.length > 0 && !isCollapsed && (
          <ol role="group" className="comment-children-list">
            {node.children.map((child) => renderCommentNode(child))}
          </ol>
        )}
      </li>
    );
  };

  return (
    <div className="comment-tree-container">
      {/* Thread Header Controls */}
      <div className="thread-controls-bar">
        <div className="thread-stats">
          <MessageSquare size={14} />
          <strong>{comments.length}</strong> {comments.length === 1 ? "Discussion" : "Discussions"}
        </div>

        <div className="thread-filter-tabs">
          {(["newest", "top", "author"] as ThreadFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`thread-filter-tab ${threadFilter === f ? "active" : ""}`}
              onClick={() => setThreadFilter(f)}
            >
              {f === "newest" ? "Newest" : f === "top" ? "Top Replies" : "Author"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Comment Tree */}
      {comments.length === 0 ? (
        <div className="empty-thread-state">
          <div className="empty-thread-icon-wrap">
            <MessageSquare size={24} strokeWidth={1.75} />
          </div>
          <h4 className="empty-thread-title">No comments yet</h4>
          <p className="empty-thread-desc">
            Be the first to share your perspective or ask a question about this idea.
          </p>
        </div>
      ) : (
        <ol role="tree" className="comment-tree-root">
          {commentTree.map((rootNode) => renderCommentNode(rootNode))}
        </ol>
      )}
    </div>
  );
}
