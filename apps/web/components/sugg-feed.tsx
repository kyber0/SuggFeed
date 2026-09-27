"use client";

import { FormEvent, useEffect, useState } from "react";
import { Lock, BellRing, CheckCircle, ArrowRight, Send, MessageSquare } from "lucide-react";
import { lookupTrackingCode } from "../lib/feedback-api";
import { drafts } from "../lib/offline-queue";
import { AnimatedCounter } from "./animated-counter";
import { StatusStepper } from "./status-stepper";
import { Header } from "./header";
import { useToast } from "./toast";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { getAnonToken } from "../lib/anon-token";
import { useSubmitIdea } from "./submit-idea-context";
import { useFeed } from "../hooks/use-feed";
import { useVoting } from "../hooks/use-voting";
import { IdeaCard, SkeletonCard } from "./idea-card";
import { readableStatus } from "../lib/format";
import { DEFAULT_CATEGORIES, type PublishedSubmission } from "../lib/feedback-api";

type Timeline = { new_status: string; note: string | null; created_at: string }[];

const ALL_CATS = ["All", ...DEFAULT_CATEGORIES];

export function SuggFeed({ turnstileSiteKey: _siteKey }: { turnstileSiteKey?: string }) {
  const { toast } = useToast();
  const { openSubmitPanel } = useSubmitIdea();

  // Mode: Share CTA vs Track
  const [mode, setMode] = useState<"share" | "track">("share");

  // Offline queue indicator
  const [queued, setQueued] = useState(0);

  // Tracking submission state
  const [tracking, setTracking] = useState("");
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [trackStatus, setTrackStatus] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);

  // Feed & voting hooks
  const {
    feed,
    setFeed,
    feedLoading,
    totalCount,
    hasMore,
    loadingMore,
    loadMore,
    sortBy,
    setSortBy,
    filterCat,
    setFilterCat,
    search,
    setSearch,
  } = useFeed();

  const { votedIds, votingId, handleVote } = useVoting(feed, setFeed);
  const [selectedIdea, setSelectedIdea] = useState<PublishedSubmission | null>(null);

  useEffect(() => {
    drafts.count().then(setQueued).catch(() => {});
  }, []);

  async function findSubmission(event: FormEvent) {
    event.preventDefault();
    if (!tracking.trim()) return;
    setTrackBusy(true);
    setTimeline([]);
    setTrackStatus("");
    try {
      const result = await lookupTrackingCode(tracking.trim().toUpperCase());
      setTrackStatus(result.status ?? "");
      setTimeline(result.timeline ?? []);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't look up that code.", "error");
    } finally {
      setTrackBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main>
        {/* ── Hero ── */}
        <section className="hero" id="top">
          <div className="hero-copy">
            <p className="eyebrow">YOUR SCHOOL. YOUR VOICE.</p>
            <h1>Small ideas can make a real difference.</h1>
            <p className="lede">
              Share feedback safely, follow its progress, and see the improvements your community is shaping.
            </p>
            <div className="pills">
              <span>
                <Lock size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 5 }} />
                Anonymous option
              </span>
              <span>
                <BellRing size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 5 }} />
                Updates you can follow
              </span>
              <span>
                <CheckCircle size={13} strokeWidth={2} style={{ verticalAlign: "middle", marginRight: 5 }} />
                Reviewed by your school
              </span>
            </div>
          </div>
          <aside className="impact">
            <p>Community impact</p>
            <strong><AnimatedCounter value={totalCount} /></strong>
            <span>ideas published so far</span>
            <hr />
            <b><AnimatedCounter value={queued} /></b>
            <span>draft{queued === 1 ? "" : "s"} queued on this device</span>
          </aside>
        </section>

        {/* ── Workspace ── */}
        <section className="workspace">
          <div className="tabs">
            <button id="tab-share" className={mode === "share" ? "active" : ""} onClick={() => setMode("share")}>
              Share feedback
            </button>
            <button id="tab-track" className={mode === "track" ? "active" : ""} onClick={() => setMode("track")}>
              Track submission
            </button>
          </div>

          {mode === "share" ? (
            <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
              <div style={{ maxWidth: 400, margin: "0 auto" }}>
                <h2 style={{ fontSize: 24, marginBottom: 12 }}>What would you like to improve?</h2>
                <p style={{ color: "var(--muted)", marginBottom: 32 }}>
                  Be constructive and avoid including personal or sensitive information.
                </p>
                <button
                  className="btn-premium"
                  onClick={openSubmitPanel}
                  style={{ width: "100%", justifyContent: "center", padding: 14, fontSize: 16 }}
                >
                  <Send size={18} strokeWidth={2} /> Share your idea
                </button>
              </div>
            </div>
          ) : (
            <form className="card" onSubmit={findSubmission}>
              <h2>Check on your feedback</h2>
              <p style={{ marginTop: 8 }}>Enter the private tracking code shown after an anonymous submission.</p>

              <div className="field">
                <label htmlFor="tracking-input">Tracking code</label>
                <input
                  id="tracking-input"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value.toUpperCase())}
                  placeholder="e.g. CV-ABCDEF1234…"
                  autoCapitalize="characters"
                />
              </div>

              <button className="btn-primary" type="submit" disabled={trackBusy}>
                {trackBusy ? "Looking up…" : <><ArrowRight size={15} strokeWidth={2} />Check status</>}
              </button>

              {trackStatus && (
                <>
                  <StatusStepper status={trackStatus} />
                  {timeline.length > 0 && (
                    <ol className="timeline" aria-label="Status history">
                      {timeline.map((entry) => (
                        <li key={entry.created_at}>
                          <div>
                            <strong>{readableStatus(entry.new_status)}</strong>
                            <span>{new Date(entry.created_at).toLocaleString()}</span>
                            {entry.note && <p>{entry.note}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </form>
          )}
        </section>

        {/* ── Feed ── */}
        <section className="feed" id="feed">
          <div className="feed-header">
            <div>
              <p className="eyebrow">OPEN IDEAS</p>
              <h2>What the community is talking about</h2>
            </div>
            <button className="btn-premium-secondary" onClick={openSubmitPanel}>
              Share your own idea <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="feed-controls">
            <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
              <input
                className="feed-search"
                type="text"
                placeholder="Search ideas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search ideas"
                style={{ flex: 1, paddingLeft: "42px" }}
              />
              <select
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "popular" | "newest" | "oldest")}
                aria-label="Sort ideas"
                style={{
                  padding: "0 12px",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--line-2)",
                  background: "var(--bg)",
                  fontSize: 14,
                  color: "var(--ink)",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="popular">Most Supported</option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
            <div className="filter-chips" role="group" aria-label="Filter by category">
              {ALL_CATS.map((cat) => (
                <button
                  key={cat}
                  className={`filter-chip${filterCat === cat ? " active" : ""}`}
                  onClick={() => setFilterCat(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="idea-grid">
            {feedLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : feed.length === 0 ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px 0", color: "var(--muted)" }}>
                <MessageSquare size={40} strokeWidth={1.25} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                <p>
                  No ideas match your search.{" "}
                  <button className="filter-chip active" onClick={() => { setSearch(""); setFilterCat("All"); }}>
                    Clear filters
                  </button>
                </p>
              </div>
            ) : (
              feed.map((item) => (
                <IdeaCard
                  key={item.id}
                  item={item}
                  isVoted={votedIds.has(item.id)}
                  isVoting={votingId === item.id}
                  onVote={handleVote}
                  onSelect={setSelectedIdea}
                />
              ))
            )}
          </div>

          {hasMore && feed.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button
                className="btn-ghost"
                onClick={loadMore}
                disabled={loadingMore}
                style={{ padding: "8px 24px" }}
              >
                {loadingMore ? "Loading…" : "Load more ideas"}
              </button>
            </div>
          )}
        </section>

        <footer className="site-footer">
          SuggFeed <span>•</span> A respectful space for constructive feedback
          <span>•</span> <a href="/admin" className="admin-link">Staff Portal</a>
        </footer>
      </main>

      {selectedIdea && (() => {
        const liveIdea = feed.find((f) => f.id === selectedIdea.id) ?? selectedIdea;
        return (
          <IdeaDetailPanel
            idea={liveIdea}
            votedIds={votedIds}
            votingId={votingId}
            onVote={handleVote}
            onClose={() => setSelectedIdea(null)}
            anonToken={getAnonToken()}
          />
        );
      })()}
    </>
  );
}
