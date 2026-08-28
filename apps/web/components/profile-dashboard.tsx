"use client";

import { useEffect, useState } from "react";
import { getAnonToken } from "../lib/anon-token";
import { loadMyActivity, PublishedSubmission } from "../lib/feedback-api";
import { Header } from "./header";
import { useAuth } from "./auth-context";
import Link from "next/link";
import { ThumbsUp, Paperclip, MessageSquare, List, CheckCircle } from "lucide-react";

function readableStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProfileDashboard() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<PublishedSubmission[]>([]);
  const [voted, setVoted] = useState<PublishedSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let trackingCodes: string[] = [];
    try {
      trackingCodes = JSON.parse(localStorage.getItem("cv_my_tracking_codes") || "[]");
    } catch { /* ignore */ }

    loadMyActivity(getAnonToken(), trackingCodes)
      .then(res => {
        setSubmissions(res.submissions);
        setVoted(res.votedSubmissions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const renderCard = (item: PublishedSubmission) => (
    <Link href={`/idea/${item.id}`} key={item.id} className="roadmap-card clickable" style={{ display: 'block', textDecoration: 'none' }}>
      <div className="card-badges">
        <span className="tag">{item.categories?.name ?? "Other"}</span>
        <span className={`status-badge ${item.status.replace("_", "-")}`}>
          {readableStatus(item.status)}
        </span>
      </div>
      <h4>{item.title}</h4>
      <div className="roadmap-card-footer">
        <span className="roadmap-stat"><ThumbsUp size={12} strokeWidth={2.5}/> {item.vote_count}</span>
        {(item.attachments?.length ?? 0) > 0 && (
          <span className="roadmap-stat"><Paperclip size={12} strokeWidth={2.5}/> {item.attachments.length}</span>
        )}
        <span className="card-date" style={{ marginLeft: "auto" }}>
          {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
    </Link>
  );

  return (
    <>
      <Header />
      <main className="roadmap-page">
        <div className="roadmap-hero" style={{ marginBottom: 32 }}>
          <p className="eyebrow">YOUR ACTIVITY</p>
          <h1>My Submissions & Votes</h1>
          <p className="lede">
            {user 
              ? "All your account-linked feedback and votes." 
              : "Feedback tracked securely in this browser."}
          </p>
        </div>

        <div className="roadmap-board" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 1000 }}>
          
          {/* Submissions */}
          <div className="roadmap-col">
            <div className="roadmap-col-header" style={{ borderTop: `3px solid var(--accent)` }}>
              <h3><List size={16}/> My Submissions <span className="roadmap-count">{submissions.length}</span></h3>
              <p>Ideas you've shared with the community.</p>
            </div>
            <div className="roadmap-items">
              {loading && submissions.length === 0 && <div className="roadmap-skeleton skeleton" />}
              {!loading && submissions.length === 0 && (
                <div className="roadmap-empty">
                  You haven't submitted anything yet.
                </div>
              )}
              {submissions.map(renderCard)}
            </div>
          </div>

          {/* Votes */}
          <div className="roadmap-col">
            <div className="roadmap-col-header" style={{ borderTop: `3px solid #f59e0b` }}>
              <h3><CheckCircle size={16}/> Supported Ideas <span className="roadmap-count">{voted.length}</span></h3>
              <p>Ideas you've voted for.</p>
            </div>
            <div className="roadmap-items">
              {loading && voted.length === 0 && <div className="roadmap-skeleton skeleton" />}
              {!loading && voted.length === 0 && (
                <div className="roadmap-empty">
                  You haven't supported any ideas yet.
                </div>
              )}
              {voted.map(renderCard)}
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
