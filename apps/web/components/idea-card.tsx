"use client";

import { ThumbsUp, Check, Paperclip } from "lucide-react";
import type { PublishedSubmission } from "../lib/feedback-api";
import { relativeDate, readableStatus } from "../lib/format";

interface IdeaCardProps {
  item: PublishedSubmission;
  isVoted: boolean;
  isVoting: boolean;
  onVote: (id: string) => void;
  onSelect: (item: PublishedSubmission) => void;
}

export function SkeletonCard() {
  return <div className="idea-card skeleton-card skeleton" />;
}

export function IdeaCard({ item, isVoted, isVoting, onVote, onSelect }: IdeaCardProps) {
  return (
    <article
      className="idea-card clickable"
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      aria-label={`Open details for: ${item.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="card-badges">
        <span className="tag">{item.categories?.name ?? "Other"}</span>
        <span className={`status-badge ${item.status.replace("_", "-")}`}>
          {readableStatus(item.status)}
        </span>
        <span className="card-date" style={{ marginLeft: "auto" }}>
          {relativeDate(item.created_at)}
        </span>
      </div>
      <h3>{item.title}</h3>
      <p className="idea-card-desc">{item.description}</p>
      <div className="card-footer">
        <button
          className={`vote-btn${isVoted ? " voted" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onVote(item.id);
          }}
          disabled={isVoting}
          aria-label={isVoted ? "Remove support" : "Support this idea"}
        >
          {isVoted ? (
            <Check size={14} strokeWidth={2.5} className="vote-arrow" />
          ) : (
            <ThumbsUp size={14} strokeWidth={2} className="vote-arrow" />
          )}
          {item.vote_count}
        </button>
        {(item.attachments?.length ?? 0) > 0 && (
          <span
            className="card-attachment-badge"
            title={`${item.attachments.length} file${item.attachments.length > 1 ? "s" : ""} attached`}
          >
            <Paperclip size={11} strokeWidth={2.5} />
            {item.attachments.length}
          </span>
        )}
        <span className="card-read-more">View details →</span>
      </div>
    </article>
  );
}
