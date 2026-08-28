"use client";

import { useEffect, useState } from "react";
import { loadRoadmapSubmissions, PublishedSubmission } from "../lib/feedback-api";
import { Header } from "./header";
import Link from "next/link";
import { MessageSquare, ThumbsUp, Paperclip } from "lucide-react";

function readableStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RoadmapBoard() {
  const [submissions, setSubmissions] = useState<PublishedSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoadmapSubmissions()
      .then(setSubmissions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const approved = submissions.filter(s => s.status === "approved");
  const inProgress = submissions.filter(s => s.status === "in_progress");
  const resolved = submissions.filter(s => s.status === "resolved");

  const renderColumn = (title: string, desc: string, items: PublishedSubmission[], color: string) => (
    <div className="roadmap-col">
      <div className="roadmap-col-header" style={{ borderTop: `3px solid ${color}` }}>
        <h3>{title} <span className="roadmap-count">{items.length}</span></h3>
        <p>{desc}</p>
      </div>
      <div className="roadmap-items">
        {items.length === 0 && !loading && (
          <div className="roadmap-empty">No ideas in this phase yet.</div>
        )}
        {loading && items.length === 0 && (
          <div className="roadmap-skeleton skeleton" />
        )}
        {items.map(item => (
          <Link href={`/idea/${item.id}`} key={item.id} className="roadmap-card clickable">
            <span className="tag">{item.categories?.name ?? "Other"}</span>
            <h4>{item.title}</h4>
            <div className="roadmap-card-footer">
              <span className="roadmap-stat"><ThumbsUp size={12} strokeWidth={2.5}/> {item.vote_count}</span>
              {(item.attachments?.length ?? 0) > 0 && (
                <span className="roadmap-stat"><Paperclip size={12} strokeWidth={2.5}/> {item.attachments.length}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Header />
      <main className="roadmap-page">
        <div className="roadmap-hero">
          <p className="eyebrow">ROADMAP</p>
          <h1>What we're working on</h1>
          <p className="lede">Track the progress of highly requested ideas and see what's coming next.</p>
        </div>
        
        <div className="roadmap-board">
          {renderColumn("Planned", "Ideas approved and queued for work.", approved, "#11845b")}
          {renderColumn("In Progress", "Currently being worked on.", inProgress, "#1d6fa4")}
          {renderColumn("Completed", "Recently resolved feedback.", resolved, "#5a3ea1")}
        </div>
      </main>
    </>
  );
}
