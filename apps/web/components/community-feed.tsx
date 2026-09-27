"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Sparkles,
  TrendingUp,
  Clock,
  Filter,
  Search,
  Plus,
  ArrowUp,
  Flame,
  Bookmark,
  Shield,
  Layers,
  Map,
  Home,
  CheckCircle2,
  RefreshCw,
  X,
  Keyboard,
  ExternalLink,
} from "lucide-react";
import { Header } from "./header";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { PostCard, SkeletonPostCard } from "./post-card";
import { getAnonToken } from "../lib/anon-token";
import { useSubmitIdea } from "./submit-idea-context";
import { useVoting } from "../hooks/use-voting";
import { useToast } from "./toast";
import { supabase } from "../lib/supabase";
import {
  loadPublishedSubmissions,
  loadSingleSubmission,
  DEFAULT_CATEGORIES,
  type PublishedSubmission,
} from "../lib/feedback-api";
import {
  getStoredPreference,
  setStoredPreference,
  getSessionPreference,
  setSessionPreference,
} from "../lib/cache-manager";

type SortMode = "latest" | "top" | "topics";

const TOPICS = ["All", ...DEFAULT_CATEGORIES];
const PER_PAGE = 15;

export function CommunityFeed() {
  const { toast } = useToast();
  const { openSubmitPanel } = useSubmitIdea();

  // Feed items & pagination
  const [feed, setFeed] = useState<PublishedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // Use a ref for page so it never causes fetchFeed to be recreated (avoids observer teardown)
  const pageRef = useRef(1);

  // Filters & Search
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [selectedTopic, setSelectedTopic] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Live updates queue (never auto-insert above scroll position)
  const [newPostsQueue, setNewPostsQueue] = useState<PublishedSubmission[]>([]);
  const [showLivePill, setShowLivePill] = useState(false);

  // Bookmarks state (persisted in localStorage)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Detail modal
  const [selectedIdea, setSelectedIdea] = useState<PublishedSubmission | null>(null);
  const [panelInitialTab, setPanelInitialTab] = useState<"details" | "comments">("comments");

  const openIdea = (idea: PublishedSubmission, tab: "details" | "comments" = "details") => {
    setPanelInitialTab(tab);
    setSelectedIdea(idea);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("idea", idea.id);
      url.searchParams.set("tab", tab);
      window.history.pushState({ ideaId: idea.id }, "", url.toString());
    } catch {
      // ignore
    }
  };

  const closeIdea = () => {
    setSelectedIdea(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("idea");
      url.searchParams.delete("tab");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  };

  // Voting hook
  const { votedIds, votingId, handleVote } = useVoting(feed, setFeed);

  // Intersection observer sentinel for infinite scroll
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const feedTopRef = useRef<HTMLDivElement>(null);
  const isFetchingMoreRef = useRef(false); // guards against duplicate observer fires
  const anonToken = useMemo(() => getAnonToken(), []);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("suggfeed_bookmarks");
      if (stored) {
        setBookmarkedIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // ignore
    }
  }, []);

  // Hydrate stored filter preferences on mount
  useEffect(() => {
    const savedSort = getStoredPreference<SortMode>("feed_sort", "latest");
    const savedTopic = getStoredPreference<string>("feed_topic", "All");
    const savedBookmarks = getStoredPreference<boolean>("feed_bookmarks_only", false);
    const savedSearch = getSessionPreference<string>("feed_search", "");
    if (savedSort && savedSort !== "latest") setSortMode(savedSort);
    if (savedTopic && savedTopic !== "All") setSelectedTopic(savedTopic);
    if (savedBookmarks) setShowBookmarksOnly(true);
    if (savedSearch && !search) setSearch(savedSearch);
  }, []);

  // Persist filter preferences when they change
  useEffect(() => { setStoredPreference("feed_sort", sortMode); }, [sortMode]);
  useEffect(() => { setStoredPreference("feed_topic", selectedTopic); }, [selectedTopic]);
  useEffect(() => { setStoredPreference("feed_bookmarks_only", showBookmarksOnly); }, [showBookmarksOnly]);
  useEffect(() => { setSessionPreference("feed_search", search); }, [search]);

  // Scroll position persistence and restoration
  const hasRestoredScrollRef = useRef(false);
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (window.scrollY > 0) {
          setSessionPreference("feed_scroll_y", window.scrollY);
        }
      }, 150);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!loading && feed.length > 0 && !hasRestoredScrollRef.current) {
      hasRestoredScrollRef.current = true;
      const savedY = getSessionPreference<number>("feed_scroll_y", 0);
      if (savedY > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedY, behavior: "instant" as ScrollBehavior });
        });
      }
    }
  }, [loading, feed.length]);

  // Modal URL deep-linking and browser back/forward navigation
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ideaId = params.get("idea");
      const tab = (params.get("tab") as "details" | "comments") || "details";
      if (ideaId && !selectedIdea) {
        const found = feed.find((item) => item.id === ideaId);
        if (found) {
          openIdea(found, tab);
        } else {
          loadSingleSubmission(ideaId).then((sub) => {
            if (sub) openIdea(sub, tab);
          });
        }
      }
    } catch {
      // ignore
    }
  }, [feed]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const ideaId = params.get("idea");
      if (!ideaId) {
        setSelectedIdea(null);
      } else {
        const found = feed.find((item) => item.id === ideaId);
        if (found) setSelectedIdea(found);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [feed]);

  const toggleBookmark = (id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast("Removed from bookmarks", "info");
      } else {
        next.add(id);
        toast("Saved to bookmarks", "success");
      }
      try {
        localStorage.setItem("suggfeed_bookmarks", JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Map sortMode to API sortBy
  const apiSortBy = useMemo(() => {
    if (sortMode === "latest") return "newest";
    return "popular";
  }, [sortMode]);

  // Load / reload feed
  const fetchFeed = useCallback(
    async (resetPage = true) => {
      // Use the ref so this callback doesn't need `page` in its deps
      const targetPage = resetPage ? 1 : pageRef.current + 1;
      if (resetPage) {
        pageRef.current = 1;
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const result = await loadPublishedSubmissions(
          apiSortBy,
          (targetPage - 1) * PER_PAGE,
          PER_PAGE,
          selectedTopic !== "All" ? selectedTopic : undefined,
          debouncedSearch || undefined
        );

        let items = result.submissions;
        // In-memory Top engagement score sort when mode is 'top'
        if (sortMode === "top") {
          items = [...items].sort((a, b) => {
            const scoreA = (a.vote_count || 0) * 2 + (a.comment_count || 0) * 3;
            const scoreB = (b.vote_count || 0) * 2 + (b.comment_count || 0) * 3;
            return scoreB - scoreA;
          });
        }

        if (resetPage) {
          setFeed(items);
          setFocusedIndex(-1);
        } else {
          setFeed((prev) => {
            const seen = new Set(prev.map((i) => i.id));
            return [...prev, ...items.filter((i) => !seen.has(i.id))];
          });
          pageRef.current = targetPage;
        }

        setTotalCount(result.count);
        setHasMore(result.count > targetPage * PER_PAGE);
      } catch {
        toast("Couldn't load community ideas right now.", "error");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    },
    // `page` intentionally removed — tracked via pageRef instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiSortBy, selectedTopic, debouncedSearch, sortMode, toast]
  );

  // Trigger reload on filter or search changes
  useEffect(() => {
    fetchFeed(true);
  }, [apiSortBy, selectedTopic, debouncedSearch, sortMode]);

  // Supabase Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel("public:submissions:feed_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "submissions",
        },
        (payload) => {
          const newRow = payload.new as any;
          if (["approved", "in_progress", "resolved"].includes(newRow.status)) {
            const incoming: PublishedSubmission = {
              id: newRow.id,
              title: newRow.title,
              description: newRow.description,
              status: newRow.status,
              vote_count: newRow.vote_count || 0,
              created_at: newRow.created_at,
              categories: { name: newRow.category_name || "General" },
              attachments: [],
              comment_count: 0,
            };
            // Never auto-insert above scroll position — queue it and show pill
            setNewPostsQueue((prev) => [incoming, ...prev]);
            setShowLivePill(true);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "submissions",
        },
        (payload) => {
          const updated = payload.new as any;
          setFeed((cur) =>
            cur.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    vote_count: updated.vote_count ?? item.vote_count,
                    status: updated.status ?? item.status,
                  }
                : item
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Handle clicking live pill to prepend new posts
  const handlePrependNewPosts = () => {
    if (newPostsQueue.length === 0) return;
    setFeed((prev) => [...newPostsQueue, ...prev]);
    setNewPostsQueue([]);
    setShowLivePill(false);
    feedTopRef.current?.scrollIntoView({ behavior: "smooth" });
    toast(`Added ${newPostsQueue.length} new post${newPostsQueue.length > 1 ? "s" : ""} to feed`, "success");
  };

  // Stable refs so the observer callback never goes stale and never needs to be recreated
  const hasMoreRef = useRef(hasMore);
  const loadingRef = useRef(loading);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Infinite scroll — observer is set up ONCE and never torn down between page loads
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          hasMoreRef.current &&
          !loadingRef.current &&
          !isFetchingMoreRef.current
        ) {
          isFetchingMoreRef.current = true;
          fetchFeed(false);
        }
      },
      {
        root: null,
        // 200px ahead gives a smooth "pre-load" without the aggressive 800px bounce
        rootMargin: "200px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
    // fetchFeed is stable across page loads (no `page` dep) so this only runs once
  }, [fetchFeed]);

  // Desktop Keyboard Shortcuts (J, K, L, C, R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        selectedIdea !== null
      ) {
        return;
      }

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = Math.min(prev + 1, feed.length - 1);
          return next;
        });
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if ((e.key === "l" || e.key === "L") && focusedIndex >= 0 && feed[focusedIndex]) {
        e.preventDefault();
        handleVote(feed[focusedIndex].id);
      } else if ((e.key === "c" || e.key === "C" || e.key === "r" || e.key === "R") && focusedIndex >= 0 && feed[focusedIndex]) {
        e.preventDefault();
        openIdea(feed[focusedIndex], "comments");
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, feed, handleVote, selectedIdea]);

  // Filtered feed for bookmarks
  const displayFeed = useMemo(() => {
    if (showBookmarksOnly) {
      return feed.filter((item) => bookmarkedIds.has(item.id));
    }
    return feed;
  }, [feed, showBookmarksOnly, bookmarkedIds]);

  return (
    <>
      <Header />

      <div className="community-page-wrapper">
        {/* ── Desktop Left Sidebar Navigation (240px persistent) ── */}
        <aside className="community-left-nav" aria-label="Community navigation">
          <div className="left-nav-inner">
            <div className="nav-brand-title">
              <Sparkles size={16} className="brand-sparkle" />
              <span>Community Hub</span>
            </div>

            <nav className="left-nav-menu">
              <Link href="/" className="nav-item">
                <Home size={17} />
                <span>Home</span>
              </Link>
              <Link href="/feed" className="nav-item active">
                <MessageSquare size={17} />
                <span>Ideas Stream</span>
              </Link>
              <Link href="/roadmap" className="nav-item">
                <Map size={17} />
                <span>Roadmap</span>
              </Link>
              <button
                type="button"
                className={`nav-item ${showBookmarksOnly ? "active" : ""}`}
                onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
              >
                <Bookmark size={17} />
                <span>Saved Ideas</span>
                {bookmarkedIds.size > 0 && (
                  <span className="nav-count-badge">{bookmarkedIds.size}</span>
                )}
              </button>
            </nav>

            <div className="left-nav-divider" />

            {/* Topic Filter Shortcuts in Sidebar */}
            <div className="nav-section-header">
              <Layers size={13} />
              <span>TOPICS</span>
            </div>
            <div className="left-topic-list">
              {TOPICS.map((topic) => {
                const isSelected = selectedTopic === topic && !showBookmarksOnly;
                return (
                  <button
                    key={topic}
                    type="button"
                    className={`topic-item-btn ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setShowBookmarksOnly(false);
                      setSelectedTopic(topic);
                    }}
                  >
                    <span>{topic}</span>
                  </button>
                );
              })}
            </div>

            <div className="left-nav-spacer" />

            {/* Primary Submit CTA */}
            <button
              type="button"
              className="btn-submit-sidebar"
              onClick={openSubmitPanel}
              aria-label="Share your idea"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>Share an Idea</span>
            </button>

            {/* Keyboard Shortcuts Hint */}
            <button
              type="button"
              className="btn-shortcuts-hint"
              onClick={() => setShowShortcutsHelp(true)}
              title="View keyboard shortcuts"
            >
              <Keyboard size={13} />
              <span>Shortcuts: J / K / L / C</span>
            </button>
          </div>
        </aside>

        {/* ── Main Feed Center Column (max 640px) ── */}
        <main
          className="community-feed-main"
          role="feed"
          aria-busy={loading}
          aria-live="polite"
        >
          <div ref={feedTopRef} />

          {/* Sticky Header with Sort Tabs & Search */}
          <div className="community-feed-header">
            <div className="feed-title-bar">
              <div>
                <h1 className="feed-heading">Community Ideas</h1>
                <p className="feed-subheading">
                  Student proposals, active discussions &amp; feedback shaping our campus.
                </p>
              </div>

              {/* Mobile Filter Sheet Trigger Button */}
              <button
                type="button"
                className="btn-mobile-filter-toggle"
                onClick={() => setMobileFilterOpen(true)}
                aria-label="Filter topics and sort"
              >
                <Filter size={16} />
                <span>Filter</span>
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="feed-search-box">
              <Search size={16} className="search-icon" aria-hidden="true" />
              <input
                type="text"
                className="feed-search-input"
                placeholder="Search ideas by title, keyword, or #topic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search ideas"
                style={{ paddingLeft: "42px", paddingRight: search ? "36px" : "16px" }}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sort Modes Bar: Latest, Top, Topics */}
            <div className="sort-modes-bar">
              <div className="sort-tabs-group" role="tablist" aria-label="Sort modes">
                <button
                  type="button"
                  role="tab"
                  aria-selected={sortMode === "latest"}
                  className={`sort-tab ${sortMode === "latest" ? "active" : ""}`}
                  onClick={() => setSortMode("latest")}
                >
                  <Clock size={14} />
                  <span>Latest</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={sortMode === "top"}
                  className={`sort-tab ${sortMode === "top" ? "active" : ""}`}
                  onClick={() => setSortMode("top")}
                >
                  <Flame size={14} />
                  <span>Top Support</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={sortMode === "topics"}
                  className={`sort-tab ${sortMode === "topics" ? "active" : ""}`}
                  onClick={() => setSortMode("topics")}
                >
                  <Filter size={14} />
                  <span>{selectedTopic === "All" ? "Topics" : selectedTopic}</span>
                </button>
              </div>

              {/* Refresh Feed Button */}
              <button
                type="button"
                className="btn-refresh-stream"
                onClick={() => fetchFeed(true)}
                disabled={loading}
                title="Refresh feed"
                aria-label="Refresh feed"
              >
                <RefreshCw size={13} className={loading ? "spin" : ""} />
              </button>
            </div>

            {/* Topic Filter Chips (Visible when sortMode === 'topics' or desktop) */}
            {sortMode === "topics" && (
              <div className="topic-chips-carousel" role="group" aria-label="Filter by category">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={`topic-chip ${selectedTopic === topic ? "active" : ""}`}
                    onClick={() => setSelectedTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sticky Live Updates Pill (Never auto-inserts above scroll position!) */}
          {showLivePill && newPostsQueue.length > 0 && (
            <div className="live-update-pill-container">
              <button
                type="button"
                className="live-update-pill"
                onClick={handlePrependNewPosts}
                aria-label="View new posts"
              >
                <ArrowUp size={14} strokeWidth={2.5} />
                <span>
                  {newPostsQueue.length} new post{newPostsQueue.length > 1 ? "s" : ""} published · Click to view
                </span>
              </button>
            </div>
          )}

          {/* ── Feed Stream ── */}
          <div className="post-cards-stream">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonPostCard key={i} />)
            ) : displayFeed.length === 0 ? (
              <div className="feed-empty-state">
                <MessageSquare size={44} strokeWidth={1.2} style={{ opacity: 0.35, marginBottom: 12 }} />
                <h3>No ideas found</h3>
                <p>
                  {showBookmarksOnly
                    ? "You haven't bookmarked any ideas yet. Click the bookmark icon on any post to save it."
                    : "No ideas match your current topic or search query."}
                </p>
                {(search || selectedTopic !== "All" || showBookmarksOnly) && (
                  <button
                    type="button"
                    className="btn-clear-filters"
                    onClick={() => {
                      setSearch("");
                      setSelectedTopic("All");
                      setShowBookmarksOnly(false);
                      setSortMode("latest");
                    }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              displayFeed.map((item, index) => (
                <PostCard
                  key={item.id}
                  item={item}
                  isVoted={votedIds.has(item.id)}
                  isVoting={votingId === item.id}
                  isBookmarked={bookmarkedIds.has(item.id)}
                  onVote={handleVote}
                  onSelect={(item) => openIdea(item, "details")}
                  onCommentClick={(item) => openIdea(item, "comments")}
                  onBookmarkToggle={toggleBookmark}
                  isKeyboardFocused={focusedIndex === index}
                />
              ))
            )}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={bottomSentinelRef} className="infinite-scroll-sentinel">
            {loadingMore && (
              <div className="loading-more-indicator">
                <RefreshCw size={16} className="spin" />
                <span>Loading more ideas…</span>
              </div>
            )}
          </div>

          {/* End of Feed Message */}
          {!hasMore && !loading && displayFeed.length > 0 && (
            <div className="feed-end-notice">
              <CheckCircle2 size={16} />
              <span>You&apos;re all caught up with the latest community ideas!</span>
            </div>
          )}
        </main>

        {/* ── Desktop Right Panel (320px persistent) ── */}
        <aside className="community-right-panel" aria-label="Community highlights">
          <div className="right-panel-inner">
            {/* Campus Pulse Card */}
            <div className="pulse-card">
              <div className="pulse-header">
                <TrendingUp size={16} className="pulse-icon" />
                <h3>Campus Pulse</h3>
                <span className="live-dot-badge">
                  <span className="live-dot" />
                  Live
                </span>
              </div>
              <div className="pulse-metrics-grid">
                <div className="pulse-metric">
                  <span className="metric-number">{totalCount > 0 ? totalCount.toLocaleString() : "1,006"}</span>
                  <span className="metric-label">Ideas Shared</span>
                </div>
                <div className="pulse-metric">
                  <span className="metric-number">118</span>
                  <span className="metric-label">Implemented</span>
                </div>
                <div className="pulse-metric">
                  <span className="metric-number">
                    {feed.filter((f) => f.comment_count && f.comment_count > 0).length}
                  </span>
                  <span className="metric-label">Active Threads</span>
                </div>
                <div className="pulse-metric">
                  <span className="metric-number">12%</span>
                  <span className="metric-label">Resolution Rate</span>
                </div>
              </div>
              <p className="pulse-summary">
                Student ideas directly guide infrastructure, safety, and campus life improvements.
              </p>
            </div>

            {/* Top Ideas Widget */}
            {feed.length > 0 && (
              <div className="top-ideas-card">
                <div className="top-ideas-header">
                  <Flame size={15} className="top-ideas-icon" />
                  <h4>Top Ideas Right Now</h4>
                </div>
                <div className="top-ideas-list">
                  {[...feed]
                    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
                    .slice(0, 3)
                    .map((idea, idx) => (
                      <button
                        key={idea.id}
                        type="button"
                        className="top-idea-row"
                        onClick={() => openIdea(idea, "details")}
                      >
                        <span className="top-idea-rank">#{idx + 1}</span>
                        <span className="top-idea-title">{idea.title}</span>
                        <span className="top-idea-votes">
                          <ArrowUp size={11} />
                          {idea.vote_count ?? 0}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Community Guidelines Card */}
            <div className="guidelines-card">
              <div className="guidelines-header">
                <Shield size={16} className="shield-icon" />
                <h3>Community Rules</h3>
              </div>
              <ul className="guidelines-list">
                <li>
                  <strong>Be constructive:</strong> Focus on realistic improvements.
                </li>
                <li>
                  <strong>Safe &amp; Anonymous:</strong> Share without fear of retaliation.
                </li>
                <li>
                  <strong>Direct Review:</strong> Campus moderators review every proposal.
                </li>
              </ul>
              <Link href="/admin" className="guidelines-admin-link">
                <span>Staff Moderation Portal</span>
                <ExternalLink size={12} />
              </Link>
            </div>

            {/* Trending Tags Widget */}
            <div className="trending-tags-card">
              <h4>Browse Topics</h4>
              <div className="trending-tags-wrap">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className="tag-pill"
                    onClick={() => {
                      setSelectedTopic(cat);
                      setSortMode("topics");
                    }}
                  >
                    #{cat.toLowerCase().replace(/\s+/g, "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="right-panel-footer">
              <span>SuggFeed Campus Platform</span>
              <span>•</span>
              <a href="/roadmap">Roadmap</a>
              <span>•</span>
              <a href="/admin">Staff</a>
            </div>
          </div>
        </aside>

      </div>

      {/* ── Mobile Floating Action Button (FAB) ── */}
      <button
        type="button"
        className="mobile-fab-btn"
        onClick={openSubmitPanel}
        aria-label="Share new idea"
        title="Share your idea"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* ── Mobile Slide-up Filter Sheet ── */}
      {mobileFilterOpen && (
        <div
          className="mobile-filter-backdrop"
          onClick={() => setMobileFilterOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Filter ideas"
        >
          <div className="mobile-filter-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-drag-handle" />
            <div className="sheet-header">
              <h3>Filter &amp; Sort Ideas</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setMobileFilterOpen(false)}
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>

            <div className="sheet-section">
              <label>SORT MODE</label>
              <div className="sheet-pills">
                <button
                  type="button"
                  className={`sheet-pill ${sortMode === "latest" ? "active" : ""}`}
                  onClick={() => setSortMode("latest")}
                >
                  Latest
                </button>
                <button
                  type="button"
                  className={`sheet-pill ${sortMode === "top" ? "active" : ""}`}
                  onClick={() => setSortMode("top")}
                >
                  Top Support
                </button>
              </div>
            </div>

            <div className="sheet-section">
              <label>TOPICS</label>
              <div className="sheet-pills">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={`sheet-pill ${selectedTopic === topic ? "active" : ""}`}
                    onClick={() => setSelectedTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-apply-sheet"
              onClick={() => setMobileFilterOpen(false)}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* ── Keyboard Shortcuts Modal ── */}
      {showShortcutsHelp && (
        <div
          className="shortcuts-modal-overlay"
          onClick={() => setShowShortcutsHelp(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div className="shortcuts-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-header">
              <Keyboard size={18} />
              <h3>Keyboard Navigation</h3>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={() => setShowShortcutsHelp(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="shortcuts-list">
              <div className="shortcut-row">
                <kbd>J</kbd>
                <span>Navigate to next post</span>
              </div>
              <div className="shortcut-row">
                <kbd>K</kbd>
                <span>Navigate to previous post</span>
              </div>
              <div className="shortcut-row">
                <kbd>L</kbd>
                <span>Like / support focused post</span>
              </div>
              <div className="shortcut-row">
                <kbd>C</kbd>
                <span>Open comments for focused post</span>
              </div>
              <div className="shortcut-row">
                <kbd>R</kbd>
                <span>Open reply for focused post</span>
              </div>
              <div className="shortcut-row">
                <kbd>?</kbd>
                <span>Toggle this shortcuts guide</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Panel Modal with Threaded Comments ── */}
      {selectedIdea && (() => {
        const liveIdea = feed.find((f) => f.id === selectedIdea.id) ?? selectedIdea;
        return (
          <IdeaDetailPanel
            idea={liveIdea}
            votedIds={votedIds}
            votingId={votingId}
            onVote={handleVote}
            onClose={closeIdea}
            anonToken={anonToken}
            initialTab={panelInitialTab}
          />
        );
      })()}
    </>
  );
}
