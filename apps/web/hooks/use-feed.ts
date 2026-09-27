"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPublishedSubmissions, type PublishedSubmission } from "../lib/feedback-api";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/toast";

export type SortBy = "popular" | "newest" | "oldest";

const PER_PAGE = 18;

/**
 * Shared feed hook.
 * Previously duplicated identically in sugg-feed.tsx and community-feed.tsx.
 *
 * Features:
 *  - Initial load + sort-change refetch
 *  - Paginated "load more"
 *  - Supabase Realtime subscription for live vote/status updates (#5)
 *  - Server-side search via ilike query param (#7)
 */
export function useFeed() {
  const { toast } = useToast();
  const [feed, setFeed]                 = useState<PublishedSubmission[]>([]);
  const [feedLoading, setFeedLoading]   = useState(true);
  const [totalCount, setTotalCount]     = useState(0);
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [sortBy, setSortBy]             = useState<SortBy>("popular");
  const [filterCat, setFilterCat]       = useState("All");
  const [search, setSearch]             = useState("");

  // Debounce the search string so we don't fire on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // ── Load / reload when sort, category, or search changes ──────────
  useEffect(() => {
    setFeedLoading(true);
    setPage(1);
    loadPublishedSubmissions(
      sortBy,
      0,
      PER_PAGE,
      filterCat !== "All" ? filterCat : undefined,
      debouncedSearch || undefined,
    )
      .then((result) => {
        setFeed(result.submissions);
        setTotalCount(result.count);
        setHasMore(result.count > PER_PAGE);
      })
      .catch(() => toast("Couldn't load ideas right now.", "error"))
      .finally(() => setFeedLoading(false));
  }, [sortBy, filterCat, debouncedSearch, toast]);

  // ── Supabase Realtime — live vote + status changes (#5) ───────────
  useEffect(() => {
    const channel = supabase
      .channel("public:submissions:feed")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "submissions",
          filter: "status=in.(approved,in_progress,resolved)",
        },
        (payload) => {
          const updated = payload.new as Partial<PublishedSubmission> & { id: string };
          setFeed((cur) =>
            cur.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    vote_count: updated.vote_count ?? item.vote_count,
                    status: (updated.status ?? item.status) as PublishedSubmission["status"],
                  }
                : item
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submissions" },
        () => {
          // A new submission was approved — silently refresh the count
          loadPublishedSubmissions(sortBy, 0, Math.max(page * PER_PAGE, PER_PAGE))
            .then((r) => setTotalCount(r.count))
            .catch(() => { /* silent */ });
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [sortBy, page]);

  // ── Load more (pagination) ─────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await loadPublishedSubmissions(
        sortBy,
        page * PER_PAGE,
        PER_PAGE,
        filterCat !== "All" ? filterCat : undefined,
        debouncedSearch || undefined,
      );
      setFeed((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...result.submissions.filter((i) => !seen.has(i.id))];
      });
      setHasMore(result.count > (page + 1) * PER_PAGE);
      setPage((p) => p + 1);
    } catch { toast("Couldn't load more ideas.", "error"); }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, sortBy, page, filterCat, debouncedSearch, toast]);

  return {
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
  };
}
