"use client";

import { useState } from "react";
import { MessageSquare, ArrowRight } from "lucide-react";
import { Header } from "./header";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { getAnonToken } from "../lib/anon-token";
import { useSubmitIdea } from "./submit-idea-context";
import { useFeed } from "../hooks/use-feed";
import { useVoting } from "../hooks/use-voting";
import { IdeaCard, SkeletonCard } from "./idea-card";
import { DEFAULT_CATEGORIES, type PublishedSubmission } from "../lib/feedback-api";

const ALL_CATS = ["All", ...DEFAULT_CATEGORIES];

export function CommunityFeed() {
  const [selectedIdea, setSelectedIdea] = useState<PublishedSubmission | null>(null);
  const { openSubmitPanel } = useSubmitIdea();

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

  return (
    <>
      <Header />
      <main className="community-feed-page">

        {/* ── Page hero ── */}
        <div className="feed-page-hero">
          <div className="feed-page-hero-copy">
            <p className="eyebrow">COMMUNITY IDEAS</p>
            <h1>What the community is talking about</h1>
            <p className="lede">
              Browse, support and explore ideas submitted by your peers.{" "}
              <span className="feed-total">{totalCount > 0 ? `${totalCount} ideas published` : ""}</span>
            </p>
          </div>
          <button className="btn-premium-secondary feed-submit-cta" onClick={openSubmitPanel}>
            Share your idea <ArrowRight size={15} strokeWidth={2} />
          </button>
        </div>

        {/* ── Controls ── */}
        <div className="feed-controls feed-page-controls">
          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
            <input
              className="feed-search"
              type="search"
              placeholder="Search ideas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search ideas"
              style={{ flex: 1 }}
            />
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "popular" | "newest" | "oldest")}
              aria-label="Sort ideas"
              style={{
                padding: "0 12px", borderRadius: "var(--r-md)", border: "1px solid var(--line-2)",
                background: "var(--bg)", fontSize: 14, color: "var(--ink)", cursor: "pointer", outline: "none",
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

        {/* ── Grid ── */}
        <div className="idea-grid">
          {feedLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : feed.length === 0 ? (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px 0", color: "var(--muted)" }}>
              <MessageSquare size={40} strokeWidth={1.25} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <p>No ideas match your search.{" "}
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

        {/* ── Load more ── */}
        {hasMore && feed.length > 0 && (
          <div style={{ textAlign: "center", margin: "32px 0" }}>
            <button className="btn-ghost" onClick={loadMore} disabled={loadingMore} style={{ padding: "8px 24px" }}>
              {loadingMore ? "Loading…" : "Load more ideas"}
            </button>
          </div>
        )}

        <footer className="site-footer">
          SuggFeed <span>•</span> A respectful space for constructive feedback
          <span>•</span> <a href="/admin" className="admin-link">Staff Portal</a>
        </footer>
      </main>

      {/* ── Detail panel ── */}
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
