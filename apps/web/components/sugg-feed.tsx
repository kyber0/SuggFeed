"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle, ArrowRight, Send, MessageSquare, Search, ChevronDown, SlidersHorizontal } from "lucide-react";
import { lookupTrackingCode } from "../lib/feedback-api";
import { drafts } from "../lib/offline-queue";
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
const SORT_OPTIONS = [
  { value: "popular", label: "Most Supported" },
  { value: "newest",  label: "Newest First"   },
  { value: "oldest",  label: "Oldest First"   },
] as const;

export function SuggFeed({ turnstileSiteKey: _siteKey }: { turnstileSiteKey?: string }) {
  const { toast } = useToast();
  const { openSubmitPanel } = useSubmitIdea();

  const [mode, setMode] = useState<"share" | "track">("share");
  const [queued, setQueued] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);

  const [tracking, setTracking]     = useState("");
  const [timeline, setTimeline]     = useState<Timeline>([]);
  const [trackStatus, setTrackStatus] = useState("");
  const [trackBusy, setTrackBusy]   = useState(false);

  const {
    feed, setFeed, feedLoading, totalCount, hasMore, loadingMore, loadMore,
    sortBy, setSortBy, filterCat, setFilterCat, search, setSearch,
  } = useFeed();

  const { votedIds, votingId, handleVote } = useVoting(feed, setFeed);
  const [selectedIdea, setSelectedIdea] = useState<PublishedSubmission | null>(null);

  useEffect(() => { drafts.count().then(setQueued).catch(() => {}); }, []);
  useEffect(() => {
    if (!sortOpen) return;
    const close = () => setSortOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortOpen]);

  async function findSubmission(event: FormEvent) {
    event.preventDefault();
    if (!tracking.trim()) return;
    setTrackBusy(true); setTimeline([]); setTrackStatus("");
    try {
      const result = await lookupTrackingCode(tracking.trim().toUpperCase());
      setTrackStatus(result.status ?? "");
      setTimeline(result.timeline ?? []);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't look up that code.", "error");
    } finally { setTrackBusy(false); }
  }

  const currentSort = SORT_OPTIONS.find(o => o.value === sortBy) ?? SORT_OPTIONS[0];

  return (
    <>
      <Header />
      <main className="sf-main">

        {/* ── Minimalist Workspace ── */}
        <section className="sf-workspace" id="top">
          <div className="sf-workspace-tabs" role="tablist">
            <button
              id="tab-share"
              role="tab"
              aria-selected={mode === "share"}
              className={`sf-workspace-tab${mode === "share" ? " active" : ""}`}
              onClick={() => setMode("share")}
            >
              Share feedback
            </button>
            <button
              id="tab-track"
              role="tab"
              aria-selected={mode === "track"}
              className={`sf-workspace-tab${mode === "track" ? " active" : ""}`}
              onClick={() => setMode("track")}
            >
              Track submission
            </button>
          </div>

          <div className="sf-workspace-card">
            {mode === "share" ? (
              <div className="sf-share-panel">
                <h2 className="sf-panel-title">What would you like to improve?</h2>
                <p className="sf-panel-desc">
                  Be constructive and avoid including personal or sensitive information.
                </p>
                <button className="sf-btn-share-main" onClick={openSubmitPanel}>
                  <Send size={15} strokeWidth={2.2} />
                  Share your idea
                </button>
              </div>
            ) : (
              <form className="sf-track-panel" onSubmit={findSubmission}>
                <h2 className="sf-panel-title">Check on your feedback</h2>
                <p className="sf-panel-desc">
                  Enter the private tracking code shown after an anonymous submission.
                </p>
                <div className="sf-track-field">
                  <div className="sf-track-input-wrap">
                    <Search size={15} strokeWidth={2} className="sf-track-icon" />
                    <input
                      id="tracking-input"
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value.toUpperCase())}
                      placeholder="e.g. CV-ABCDEF1234…"
                      autoCapitalize="characters"
                      className="sf-track-input"
                      aria-label="Tracking code"
                    />
                  </div>
                </div>
                <button className="sf-btn-track" type="submit" disabled={trackBusy}>
                  {trackBusy ? "Looking up…" : <><ArrowRight size={15} strokeWidth={2} /> Check status</>}
                </button>
                {trackStatus && (
                  <div className="sf-track-result">
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
                  </div>
                )}
              </form>
            )}
          </div>
        </section>

        {/* ── Subtle Divider ── */}
        <div className="sf-divider" />

        {/* ── Feed ── */}
        <section className="sf-feed" id="feed">
          <div className="sf-feed-header">
            <div>
              <p className="sf-section-eyebrow">OPEN IDEAS</p>
              <h2 className="sf-section-title">What the community is talking about</h2>
            </div>
            <button className="sf-btn-share-secondary" onClick={openSubmitPanel}>
              Share your own idea <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="sf-feed-controls">
            <div className="sf-search-wrap">
              <Search size={15} strokeWidth={2} className="sf-search-icon" />
              <input
                className="sf-search-input"
                type="text"
                placeholder="Search ideas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search ideas"
              />
            </div>

            <div className="sf-sort-wrap" onClick={(e) => e.stopPropagation()}>
              <button className="sf-sort-btn" onClick={() => setSortOpen(v => !v)} aria-expanded={sortOpen}>
                <SlidersHorizontal size={14} strokeWidth={2} />
                {currentSort.label}
                <ChevronDown size={13} strokeWidth={2} style={{ marginLeft: "auto", transition: "transform 0.2s", transform: sortOpen ? "rotate(180deg)" : "none" }} />
              </button>
              {sortOpen && (
                <div className="sf-sort-menu">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`sf-sort-opt${sortBy === opt.value ? " active" : ""}`}
                      onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                    >
                      {opt.label}
                      {sortBy === opt.value && <CheckCircle size={13} strokeWidth={2.5} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="filter-chips" role="group" aria-label="Filter by category">
              {ALL_CATS.map((cat) => (
                <button key={cat} className={`filter-chip${filterCat === cat ? " active" : ""}`} onClick={() => setFilterCat(cat)}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="idea-grid">
            {feedLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : feed.length === 0 ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 0" }}>
                <div className="sf-empty-state">
                  <div className="sf-empty-icon"><MessageSquare size={32} strokeWidth={1.25} /></div>
                  <h3 style={{ fontSize: 18, marginBottom: 8, color: "var(--ink)" }}>No ideas found</h3>
                  <p style={{ fontSize: 14, marginBottom: 20 }}>Try adjusting your search or filters.</p>
                  <button className="filter-chip active" onClick={() => { setSearch(""); setFilterCat("All"); }}>Clear filters</button>
                </div>
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
            <div className="sf-load-more">
              <button className="sf-load-more-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : <>Load more ideas <ArrowRight size={14} /></>}
              </button>
            </div>
          )}
        </section>

        <footer className="sf-footer">
          <div className="sf-footer-inner">
            <span className="sf-footer-brand">SuggFeed</span>
            <span className="sf-footer-dot">•</span>
            <span>A respectful space for constructive feedback</span>
            <span className="sf-footer-dot">•</span>
            <a href="/privacy" className="sf-footer-link">Privacy</a>
            <span className="sf-footer-dot">•</span>
            <a href="/terms" className="sf-footer-link">Terms</a>
            <span className="sf-footer-dot">•</span>
            <a href="/admin" className="sf-footer-link">Staff Portal</a>
          </div>
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
