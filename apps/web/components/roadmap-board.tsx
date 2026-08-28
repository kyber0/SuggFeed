"use client";

import { useEffect, useState } from "react";
import { loadRoadmapSubmissions, PublishedSubmission } from "../lib/feedback-api";
import { Header } from "./header";
import Link from "next/link";
import { ThumbsUp, Paperclip } from "lucide-react";

type Tab = "approved" | "in_progress" | "resolved";

const TABS: { key: Tab; label: string; color: string; desc: string }[] = [
  { key: "approved",    label: "Planned",     color: "#11845b", desc: "Ideas approved and queued for work." },
  { key: "in_progress", label: "In Progress", color: "#1d6fa4", desc: "Currently being worked on." },
  { key: "resolved",   label: "Completed",   color: "#5a3ea1", desc: "Recently resolved feedback." },
];

export function RoadmapBoard() {
  const [submissions, setSubmissions] = useState<PublishedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("approved");

  useEffect(() => {
    loadRoadmapSubmissions()
      .then(setSubmissions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const approved    = submissions.filter(s => s.status === "approved");
  const inProgress  = submissions.filter(s => s.status === "in_progress");
  const resolved    = submissions.filter(s => s.status === "resolved");

  const byTab: Record<Tab, PublishedSubmission[]> = {
    approved,
    in_progress: inProgress,
    resolved,
  };

  const renderColumn = (
    title: string,
    desc: string,
    items: PublishedSubmission[],
    color: string,
  ) => (
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

        {/* ── Mobile tab bar ── */}
        <div className="roadmap-tabs" role="tablist" aria-label="Roadmap phases">
          {TABS.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`roadmap-tab${activeTab === tab.key ? " roadmap-tab--active" : ""}`}
              style={{ "--tab-color": tab.color } as React.CSSProperties}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="roadmap-tab-count">
                {byTab[tab.key].length}
              </span>
            </button>
          ))}
        </div>

        {/* ── Desktop: all columns side-by-side ── */}
        <div className="roadmap-board">
          {TABS.map(tab => renderColumn(tab.label, tab.desc, byTab[tab.key], tab.color))}
        </div>

        {/* ── Mobile: only the active tab column ── */}
        <div className="roadmap-board-mobile">
          {(() => {
            const tab = TABS.find(t => t.key === activeTab)!;
            return renderColumn(tab.label, tab.desc, byTab[tab.key], tab.color);
          })()}
        </div>
      </main>
    </>
  );
}
