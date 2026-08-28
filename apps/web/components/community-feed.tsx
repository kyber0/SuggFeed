"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadPublishedSubmissions, type PublishedSubmission, voteSubmission,
} from "../lib/feedback-api";
import { ThumbsUp, Check, MessageSquare, Paperclip, ArrowRight } from "lucide-react";
import { Header } from "./header";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { useToast } from "./toast";
import { getAnonToken } from "../lib/anon-token";
import { useSubmitIdea } from "./submit-idea-context";

const ALL_CATS = ["All", "Facilities", "Learning", "Safety", "Student life", "Other"];
const PER_PAGE = 18;

function SkeletonCard() {
  return <div className="idea-card skeleton-card skeleton" />;
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function readableStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CommunityFeed() {
  const { toast } = useToast();
  const [feed, setFeed]             = useState<PublishedSubmission[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [votedIds, setVotedIds]     = useState<Set<string>>(new Set());
  const [votingId, setVotingId]     = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [filterCat, setFilterCat]   = useState("All");
  const [sortBy, setSortBy]         = useState<"popular" | "newest" | "oldest">("popular");
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<PublishedSubmission | null>(null);
  const [anonToken, setAnonToken]   = useState("");
  
  const { openSubmitPanel } = useSubmitIdea();

  /* ── Init ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cv_voted");
      if (raw) setVotedIds(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
    setAnonToken(getAnonToken());
  }, []);

  /* ── Load feed on sort change ── */
  useEffect(() => {
    setFeedLoading(true);
    loadPublishedSubmissions(sortBy, 0, PER_PAGE)
      .then(result => {
        setFeed(result.submissions);
        setTotalCount(result.count);
        setHasMore(result.count > PER_PAGE);
        setPage(1);
      })
      .catch(() => toast("Couldn't load ideas right now.", "error"))
      .finally(() => setFeedLoading(false));
  }, [sortBy, toast]);

  /* ── Refresh every 60 s ── */
  const refresh = useCallback(async () => {
    try {
      const result = await loadPublishedSubmissions(sortBy, 0, Math.max(page * PER_PAGE, PER_PAGE));
      setFeed(result.submissions);
      setTotalCount(result.count);
      setHasMore(result.count > Math.max(page * PER_PAGE, PER_PAGE));
    } catch { /* silent */ }
  }, [sortBy, page]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  /* ── Load more ── */
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await loadPublishedSubmissions(sortBy, page * PER_PAGE, PER_PAGE);
      setFeed(prev => {
        const seen = new Set(prev.map(i => i.id));
        return [...prev, ...result.submissions.filter(i => !seen.has(i.id))];
      });
      setHasMore(result.count > (page + 1) * PER_PAGE);
      setPage(p => p + 1);
    } catch { toast("Couldn't load more ideas.", "error"); }
    finally { setLoadingMore(false); }
  };

  /* ── Vote ── */
  async function handleVote(id: string) {
    if (votingId) return;
    const isUnvote = votedIds.has(id);
    const nextVoted = new Set(votedIds);
    if (isUnvote) { nextVoted.delete(id); } else { nextVoted.add(id); }
    setVotedIds(nextVoted);
    localStorage.setItem("cv_voted", JSON.stringify([...nextVoted]));
    setFeed(cur => cur.map(item =>
      item.id === id ? { ...item, vote_count: Math.max(0, item.vote_count + (isUnvote ? -1 : 1)) } : item
    ));
    setVotingId(id);
    try {
      const { voteCount } = await voteSubmission(id, getAnonToken());
      setFeed(cur => cur.map(item => item.id === id ? { ...item, vote_count: voteCount } : item));
    } catch (err) {
      setVotedIds(new Set(votedIds));
      setFeed(cur => cur.map(item =>
        item.id === id ? { ...item, vote_count: Math.max(0, item.vote_count + (isUnvote ? 1 : -1)) } : item
      ));
      localStorage.setItem("cv_voted", JSON.stringify([...votedIds]));
      toast(err instanceof Error ? err.message : "Couldn't record your vote.", "error");
    } finally { setVotingId(null); }
  }

  /* ── Filter ── */
  const filtered = feed.filter(item => {
    const matchCat = filterCat === "All" || item.categories?.name === filterCat;
    const matchSearch = !search
      || item.title.toLowerCase().includes(search.toLowerCase())
      || item.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

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
          <button className="btn-primary-sm feed-submit-cta" onClick={openSubmitPanel}>
            <ArrowRight size={15} strokeWidth={2} />
            Share your idea
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
              onChange={e => setSearch(e.target.value)}
              aria-label="Search ideas"
              style={{ flex: 1 }}
            />
            <select
              className="sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as "popular" | "newest" | "oldest")}
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
            {ALL_CATS.map(cat => (
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
        <div className="idea-grid feed-page-grid">
          {feedLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 0", color: "var(--muted)" }}>
              <MessageSquare size={44} strokeWidth={1.25} style={{ margin: "0 auto 16px", opacity: 0.35 }} />
              <p>No ideas match your search.{" "}
                <button className="filter-chip active" onClick={() => { setSearch(""); setFilterCat("All"); }}>
                  Clear filters
                </button>
              </p>
            </div>
          ) : (
            filtered.map(item => (
              <article
                key={item.id}
                className="idea-card clickable"
                onClick={() => setSelectedIdea(item)}
                role="button"
                tabIndex={0}
                aria-label={`Open details for: ${item.title}`}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedIdea(item); } }}
              >
                <div className="card-badges">
                  <span className="tag">{item.categories?.name ?? "Other"}</span>
                  <span className={`status-badge ${item.status.replace("_", "-")}`}>
                    {readableStatus(item.status)}
                  </span>
                  <span className="card-date" style={{ marginLeft: "auto" }}>{relativeDate(item.created_at)}</span>
                </div>
                <h3>{item.title}</h3>
                <p className="idea-card-desc">{item.description}</p>
                <div className="card-footer">
                  <button
                    className={`vote-btn${votedIds.has(item.id) ? " voted" : ""}`}
                    onClick={e => { e.stopPropagation(); handleVote(item.id); }}
                    disabled={votingId === item.id}
                    aria-label={votedIds.has(item.id) ? "Remove support" : "Support this idea"}
                  >
                    {votedIds.has(item.id)
                      ? <Check size={14} strokeWidth={2.5} className="vote-arrow" />
                      : <ThumbsUp size={14} strokeWidth={2} className="vote-arrow" />}
                    {item.vote_count}
                  </button>
                  {(item.attachments?.length ?? 0) > 0 && (
                    <span className="card-attachment-badge" title={`${item.attachments.length} file${item.attachments.length > 1 ? "s" : ""} attached`}>
                      <Paperclip size={11} strokeWidth={2.5} />
                      {item.attachments.length}
                    </span>
                  )}
                  <span className="card-read-more">View details →</span>
                </div>
              </article>
            ))
          )}
        </div>

        {/* ── Load more ── */}
        {hasMore && filtered.length > 0 && !search && filterCat === "All" && (
          <div style={{ textAlign: "center", margin: "32px 0" }}>
            <button className="btn-ghost" onClick={loadMore} disabled={loadingMore} style={{ padding: "8px 24px" }}>
              {loadingMore ? "Loading…" : "Load more ideas"}
            </button>
          </div>
        )}

        <footer className="site-footer">
          CampusVoice <span>•</span> A respectful space for constructive feedback
          <span>•</span> <a href="/admin" className="admin-link">Staff Portal</a>
        </footer>
      </main>

      {/* ── Detail panel ── */}
      {selectedIdea && (() => {
        const liveIdea = feed.find(f => f.id === selectedIdea.id) ?? selectedIdea;
        return (
          <IdeaDetailPanel
            idea={liveIdea}
            votedIds={votedIds}
            votingId={votingId}
            onVote={handleVote}
            onClose={() => setSelectedIdea(null)}
            anonToken={anonToken}
          />
        );
      })()}
    </>
  );
}
