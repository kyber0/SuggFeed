"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { loadRoadmapSubmissions, PublishedSubmission } from "../lib/feedback-api";
import {
  getStoredPreference,
  setStoredPreference,
  getSessionPreference,
  setSessionPreference,
} from "../lib/cache-manager";
import { Header } from "./header";
import { useToast } from "./toast";
import Link from "next/link";
import {
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  Tag,
  ThumbsUp,
  MessageCircle,
  X,
  Search,
  Filter,
  Kanban,
  Calendar,
  MoreHorizontal,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Check,
  ChevronRight,
  ChevronDown,
  User as UserIcon,
} from "lucide-react";

export type RoadmapStatus = "now" | "next" | "later";
export type EffortLevel = "XS" | "S" | "M" | "L" | "XL";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  effort: EffortLevel;
  owner: {
    name: string;
    avatar?: string;
    role?: string;
  };
  quarter: string;
  tags: string[];
  vote_count: number;
  comment_count?: number;
  created_at: string;
  history?: {
    action: string;
    timestamp: string;
  }[];
}

const COLUMNS: {
  key: RoadmapStatus;
  label: string;
  shortLabel: string;
  colorVar: string;
  colorHex: string;
  Icon: typeof Sparkles;
  desc: string;
  emptyMsg: string;
}[] = [
  {
    key: "now",
    label: "Now",
    shortLabel: "Now",
    colorVar: "var(--status-now)",
    colorHex: "#F59E0B",
    Icon: Zap,
    desc: "In active development and delivery",
    emptyMsg: "Nothing in flight right now",
  },
  {
    key: "next",
    label: "Next",
    shortLabel: "Next",
    colorVar: "var(--status-next)",
    colorHex: "#3B82F6",
    Icon: Sparkles,
    desc: "Approved and prioritized for upcoming work",
    emptyMsg: "No items queued for next cycle",
  },
  {
    key: "later",
    label: "Later",
    shortLabel: "Later",
    colorVar: "var(--status-later)",
    colorHex: "#64748B",
    Icon: CheckCircle2,
    desc: "Under exploration and future consideration",
    emptyMsg: "No backlog items yet",
  },
];

const EFFORT_OPTIONS: EffortLevel[] = ["XS", "S", "M", "L", "XL"];
const QUARTERS = ["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027", "Future"];
const OWNERS = [
  { name: "Campus Ops", role: "Facilities & Grounds" },
  { name: "Academic Tech", role: "Learning Systems" },
  { name: "Campus Safety", role: "Safety & Security" },
  { name: "Student Council", role: "Student Life & Clubs" },
  { name: "IT Services", role: "Infrastructure & Wi-Fi" },
];

function getDeterministicOwner(category: string, id: string) {
  if (category === "Facilities") return OWNERS[0];
  if (category === "Learning") return OWNERS[1];
  if (category === "Safety") return OWNERS[2];
  if (category === "Student life") return OWNERS[3];
  
  // Hash id to pick owner
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  return OWNERS[Math.abs(hash) % OWNERS.length];
}

function getDeterministicEffort(id: string): EffortLevel {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  const idx = Math.abs(hash) % EFFORT_OPTIONS.length;
  return EFFORT_OPTIONS[idx];
}

function getDeterministicQuarter(status: RoadmapStatus): string {
  if (status === "now") return "Q3 2026";
  if (status === "next") return "Q4 2026";
  return "Q1 2027";
}

const STORAGE_KEY = "suggfeed_roadmap_items_v2";
const COL_PAGE_SIZE = 8;
const TIMELINE_PAGE_SIZE = 8;

interface RoadmapColumnProps {
  col: (typeof COLUMNS)[number];
  colItems: RoadmapItem[];
  isMobileActive: boolean;
  isOver: boolean;
  loading: boolean;
  draggingId: string | null;
  hasActiveFilters: boolean;
  isCardMatchingFilters: (item: RoadmapItem) => boolean;
  handleDragStart: (e: React.DragEvent, id: string) => void;
  handleDragEnd: () => void;
  handleTouchStart: (item: RoadmapItem) => void;
  handleTouchEndOrMove: () => void;
  handleDragOverCol: (e: React.DragEvent, colKey: RoadmapStatus) => void;
  handleDragLeaveCol: () => void;
  handleDropCol: (e: React.DragEvent, colKey: RoadmapStatus) => void;
  setSelectedItem: (item: RoadmapItem) => void;
  setActionSheetItem: (item: RoadmapItem) => void;
}

function RoadmapBoardColumn({
  col,
  colItems,
  isMobileActive,
  isOver,
  loading,
  draggingId,
  hasActiveFilters,
  isCardMatchingFilters,
  handleDragStart,
  handleDragEnd,
  handleTouchStart,
  handleTouchEndOrMove,
  handleDragOverCol,
  handleDragLeaveCol,
  handleDropCol,
  setSelectedItem,
  setActionSheetItem,
}: RoadmapColumnProps) {
  const [visibleCount, setVisibleCount] = useState(COL_PAGE_SIZE);
  const colContentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset pagination when active filters change
  useEffect(() => {
    setVisibleCount(COL_PAGE_SIZE);
  }, [hasActiveFilters]);

  // When filtering, prioritize matching cards to the top of the visible list
  const sortedItems = useMemo(() => {
    if (!hasActiveFilters) return colItems;
    return [...colItems].sort((a, b) => {
      const aMatch = isCardMatchingFilters(a);
      const bMatch = isCardMatchingFilters(b);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }, [colItems, hasActiveFilters, isCardMatchingFilters]);

  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount]
  );
  const hasMore = visibleCount < sortedItems.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + COL_PAGE_SIZE, sortedItems.length));
  }, [sortedItems.length]);

  // Lazy loading observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      {
        rootMargin: "200px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const pct = Math.min(
    100,
    Math.round((visibleItems.length / Math.max(1, sortedItems.length)) * 100)
  );

  return (
    <div
      className={`rm-column${isMobileActive ? " rm-column--mobile-active" : ""}`}
    >
      {/* Column Header */}
      <div className="rm-col-head">
        <div className="rm-col-head-left">
          <span
            className="rm-col-dot"
            style={{ background: col.colorHex }}
            aria-hidden="true"
          />
          <h2 className="rm-col-name">{col.label}</h2>
          <span className="rm-col-badge">{colItems.length}</span>
        </div>
      </div>

      {/* Column Body: Scrollable list with lazy loading */}
      <div
        ref={colContentRef}
        role="list"
        aria-label={`${col.label} column`}
        className={`rm-col-content${isOver ? " rm-col-content--dragover" : ""}`}
        onDragOver={(e) => handleDragOverCol(e, col.key)}
        onDragLeave={handleDragLeaveCol}
        onDrop={(e) => handleDropCol(e, col.key)}
      >
        {loading ? (
          <>
            <div className="rm-skeleton-card" />
            <div className="rm-skeleton-card" />
            <div className="rm-skeleton-card" />
          </>
        ) : colItems.length === 0 ? (
          <div className="rm-col-empty">
            <p>{col.emptyMsg}</p>
          </div>
        ) : (
          <>
            {visibleItems.map((item) => {
              const matches = isCardMatchingFilters(item);
              const isDragging = draggingId === item.id;

              return (
                <div
                  key={item.id}
                  role="listitem"
                  tabIndex={0}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={() => handleTouchStart(item)}
                  onTouchEnd={handleTouchEndOrMove}
                  onTouchMove={handleTouchEndOrMove}
                  onClick={() => setSelectedItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedItem(item);
                    }
                  }}
                  className={`rm-card${!matches ? " rm-card--dimmed" : ""}${
                    isDragging ? " rm-card--dragging" : ""
                  }`}
                  style={{ "--card-status-color": col.colorHex } as React.CSSProperties}
                >
                  {/* Top Row: [Status Dot] Title [Effort: M] */}
                  <div className="rm-card-top-row">
                    <div className="rm-card-status-title">
                      <span
                        className="rm-card-status-dot"
                        style={{ background: col.colorHex }}
                        title={`Status: ${col.label}`}
                      />
                      <h3 className="rm-card-title">{item.title}</h3>
                    </div>
                    <span className="rm-card-effort">Effort: {item.effort}</span>
                  </div>

                  {/* Middle: 1-2 lines truncated description */}
                  {item.description && (
                    <p className="rm-card-desc">{item.description}</p>
                  )}

                  {/* Bottom Row: [Owner Avatar] Quarter 🏷 tags */}
                  <div className="rm-card-bottom-row">
                    <div className="rm-card-owner" title={`Assigned: ${item.owner.name}`}>
                      <span className="rm-card-avatar">
                        {item.owner.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="rm-card-quarter">{item.quarter}</span>
                    </div>

                    <div className="rm-card-tags">
                      {item.tags.map((t) => (
                        <span key={t} className="rm-card-tag">
                          <Tag size={9} />
                          {t}
                        </span>
                      ))}

                      {/* Quick move trigger */}
                      <button
                        type="button"
                        className="rm-card-menu-btn"
                        title="Move or manage item"
                        aria-label="Manage roadmap item"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionSheetItem(item);
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Lazy Loading Footer */}
            {sortedItems.length > COL_PAGE_SIZE && (
              <div className="rm-col-lazy-footer">
                <div className="rm-col-lazy-info">
                  <span>
                    Showing {visibleItems.length} of {sortedItems.length}
                  </span>
                  <div className="rm-col-lazy-track">
                    <div
                      className="rm-col-lazy-fill"
                      style={{
                        width: `${pct}%`,
                        background: col.colorHex,
                      }}
                    />
                  </div>
                  <span>{pct}%</span>
                </div>

                {hasMore ? (
                  <button
                    type="button"
                    className="rm-col-lazy-btn"
                    onClick={loadMore}
                  >
                    <ChevronDown size={13} />
                    Load {Math.min(COL_PAGE_SIZE, sortedItems.length - visibleCount)} more
                  </button>
                ) : (
                  <div className="rm-col-lazy-complete">
                    <Check size={12} style={{ color: col.colorHex }} />
                    All {sortedItems.length} cards loaded
                  </div>
                )}

                {/* Invisible Sentinel */}
                {hasMore && <div ref={sentinelRef} className="rm-col-sentinel" aria-hidden="true" />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface TimelineQuarterProps {
  quarter: string;
  qItems: RoadmapItem[];
  isCardMatchingFilters: (item: RoadmapItem) => boolean;
  setSelectedItem: (item: RoadmapItem) => void;
  hasActiveFilters: boolean;
}

function RoadmapTimelineQuarterGroup({
  quarter,
  qItems,
  isCardMatchingFilters,
  setSelectedItem,
  hasActiveFilters,
}: TimelineQuarterProps) {
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(TIMELINE_PAGE_SIZE);
  }, [hasActiveFilters]);

  const sortedItems = useMemo(() => {
    if (!hasActiveFilters) return qItems;
    return [...qItems].sort((a, b) => {
      const aMatch = isCardMatchingFilters(a);
      const bMatch = isCardMatchingFilters(b);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }, [qItems, hasActiveFilters, isCardMatchingFilters]);

  const visibleItems = useMemo(
    () => sortedItems.slice(0, visibleCount),
    [sortedItems, visibleCount]
  );
  const hasMore = visibleCount < sortedItems.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + TIMELINE_PAGE_SIZE, sortedItems.length));
  }, [sortedItems.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const pct = Math.min(
    100,
    Math.round((visibleItems.length / Math.max(1, sortedItems.length)) * 100)
  );

  return (
    <section className="rm-timeline-group">
      <div className="rm-timeline-quarter-head">
        <h2 className="rm-timeline-quarter-title">{quarter}</h2>
        <span className="rm-timeline-quarter-count">{qItems.length} items</span>
      </div>

      <div className="rm-timeline-cards">
        {visibleItems.map((item) => {
          const col = COLUMNS.find((c) => c.key === item.status) || COLUMNS[0];
          const matches = isCardMatchingFilters(item);

          return (
            <div
              key={item.id}
              tabIndex={0}
              onClick={() => setSelectedItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedItem(item);
                }
              }}
              className={`rm-card${!matches ? " rm-card--dimmed" : ""}`}
            >
              <div className="rm-card-top-row">
                <div className="rm-card-status-title">
                  <span
                    className="rm-card-status-dot"
                    style={{ background: col.colorHex }}
                    title={`Status: ${col.label}`}
                  />
                  <h3 className="rm-card-title">{item.title}</h3>
                </div>
                <span className="rm-card-effort">Effort: {item.effort}</span>
              </div>

              {item.description && <p className="rm-card-desc">{item.description}</p>}

              <div className="rm-card-bottom-row">
                <div className="rm-card-owner">
                  <span className="rm-card-avatar">
                    {item.owner.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="rm-card-quarter">{col.label}</span>
                </div>

                <div className="rm-card-tags">
                  {item.tags.map((t) => (
                    <span key={t} className="rm-card-tag">
                      <Tag size={9} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {sortedItems.length > TIMELINE_PAGE_SIZE && (
          <div className="rm-timeline-lazy-footer">
            <div className="rm-timeline-lazy-info">
              <span>
                Showing {visibleItems.length} of {sortedItems.length}
              </span>
              <div className="rm-col-lazy-track" style={{ flex: 1 }}>
                <div
                  className="rm-col-lazy-fill"
                  style={{
                    width: `${pct}%`,
                    background: "var(--navy)",
                  }}
                />
              </div>
              <span>{pct}%</span>
            </div>

            {hasMore ? (
              <button
                type="button"
                className="rm-timeline-lazy-btn"
                onClick={loadMore}
              >
                <ChevronDown size={13} />
                Load {Math.min(TIMELINE_PAGE_SIZE, sortedItems.length - visibleCount)} more
              </button>
            ) : (
              <div className="rm-col-lazy-complete">
                <Check size={12} style={{ color: "var(--navy)" }} />
                All {sortedItems.length} cards loaded
              </div>
            )}

            {hasMore && <div ref={sentinelRef} className="rm-col-sentinel" aria-hidden="true" />}
          </div>
        )}
      </div>
    </section>
  );
}

export function RoadmapBoard() {
  const { toast } = useToast();
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode: 'board' (Kanban) or 'timeline' (Quarter timeline)
  const [viewMode, setViewMode] = useState<"board" | "timeline">("board");

  // Mobile active tab
  const [mobileTab, setMobileTab] = useState<RoadmapStatus>("now");

  // Filters
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");

  // Hydrate stored preferences on mount
  useEffect(() => {
    const savedViewMode = getStoredPreference<"board" | "timeline">("rm_view_mode", "board");
    const savedTab = getStoredPreference<RoadmapStatus>("rm_mobile_tab", "now");
    const savedOwner = getStoredPreference<string>("rm_owner_filter", "all");
    const savedTag = getStoredPreference<string>("rm_tag_filter", "all");
    const savedQuarter = getStoredPreference<string>("rm_quarter_filter", "all");
    if (savedViewMode !== "board") setViewMode(savedViewMode);
    if (savedTab !== "now") setMobileTab(savedTab);
    if (savedOwner !== "all") setOwnerFilter(savedOwner);
    if (savedTag !== "all") setTagFilter(savedTag);
    if (savedQuarter !== "all") setQuarterFilter(savedQuarter);
  }, []);

  // Persist preferences across sessions
  useEffect(() => { setStoredPreference("rm_view_mode", viewMode); }, [viewMode]);
  useEffect(() => { setStoredPreference("rm_mobile_tab", mobileTab); }, [mobileTab]);
  useEffect(() => { setStoredPreference("rm_owner_filter", ownerFilter); }, [ownerFilter]);
  useEffect(() => { setStoredPreference("rm_tag_filter", tagFilter); }, [tagFilter]);
  useEffect(() => { setStoredPreference("rm_quarter_filter", quarterFilter); }, [quarterFilter]);

  // Drag and Drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<RoadmapStatus | null>(null);

  // Detail Drawer
  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);

  const openDrawer = (item: RoadmapItem) => {
    setSelectedItem(item);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("item", item.id);
      window.history.pushState({ itemId: item.id }, "", url.toString());
    } catch {
      // ignore
    }
  };

  const closeDrawer = () => {
    setSelectedItem(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("item");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  };

  // Drawer URL synchronization and browser back/forward support
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const itemId = params.get("item");
      if (itemId && !selectedItem && items.length > 0) {
        const found = items.find((i) => i.id === itemId);
        if (found) setSelectedItem(found);
      }
    } catch {
      // ignore
    }
  }, [items]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const itemId = params.get("item");
      if (!itemId) {
        setSelectedItem(null);
      } else {
        const found = items.find((i) => i.id === itemId);
        if (found) setSelectedItem(found);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [items]);

  // Search session persistence
  useEffect(() => {
    const savedSearch = getSessionPreference<string>("rm_search", "");
    if (savedSearch && !search) setSearch(savedSearch);
  }, []);
  useEffect(() => { setSessionPreference("rm_search", search); }, [search]);

  // Mobile Action Sheet
  const [actionSheetItem, setActionSheetItem] = useState<RoadmapItem | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load submissions from API & merge with local overrides
  useEffect(() => {
    async function init() {
      try {
        const raw = await loadRoadmapSubmissions();

        // Convert PublishedSubmissions to RoadmapItems
        const mapped: RoadmapItem[] = raw.map((s) => {
          let status: RoadmapStatus = "next";
          if (s.status === "in_progress") status = "now";
          else if (s.status === "approved") status = "next";
          else if (s.status === "resolved") status = "later";

          const categoryName = s.categories?.name ?? "Campus";
          const owner = getDeterministicOwner(categoryName, s.id);
          const effort = getDeterministicEffort(s.id);
          const quarter = getDeterministicQuarter(status);

          return {
            id: s.id,
            title: s.title,
            description: s.description || "",
            status,
            effort,
            owner,
            quarter,
            tags: [categoryName],
            vote_count: s.vote_count || 0,
            comment_count: s.comment_count || 0,
            created_at: s.created_at,
            history: [
              { action: "Created from community idea", timestamp: s.created_at },
              { action: `Assigned to ${status.toUpperCase()} stage`, timestamp: s.created_at },
            ],
          };
        });

        // Check if user has saved overrides in localStorage
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed: RoadmapItem[] = JSON.parse(saved);
            // Merge custom additions + preserved statuses
            const localMap = new Map(parsed.map((item) => [item.id, item]));
            const merged = mapped.map((item) => {
              const local = localMap.get(item.id);
              return local ? { ...item, ...local } : item;
            });
            // Include locally created items not in API
            const existingIds = new Set(mapped.map((m) => m.id));
            const localOnly = parsed.filter((item) => !existingIds.has(item.id));
            setItems([...localOnly, ...merged]);
          } else {
            setItems(mapped);
          }
        } catch {
          setItems(mapped);
        }
      } catch (err) {
        console.error("Failed to load roadmap submissions:", err);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  // Save to localStorage whenever items change
  const saveItems = useCallback((updated: RoadmapItem[]) => {
    setItems(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Move Item (Drag-and-Drop or Menu or Drawer)
  const moveItem = useCallback(
    (id: string, targetStatus: RoadmapStatus) => {
      const item = items.find((i) => i.id === id);
      if (!item || item.status === targetStatus) return;

      const colTarget = COLUMNS.find((c) => c.key === targetStatus);
      const prevStatus = item.status;

      // Optimistic update
      const updated = items.map((i) => {
        if (i.id === id) {
          const newHist = [
            ...(i.history || []),
            {
              action: `Moved from ${prevStatus.toUpperCase()} to ${targetStatus.toUpperCase()}`,
              timestamp: new Date().toISOString(),
            },
          ];
          return { ...i, status: targetStatus, history: newHist };
        }
        return i;
      });

      saveItems(updated);

      if (selectedItem?.id === id) {
        setSelectedItem((prev) => (prev ? { ...prev, status: targetStatus } : null));
      }

      toast(`Moved "${item.title.slice(0, 24)}..." to ${colTarget?.label ?? targetStatus}`, "success");
    },
    [items, selectedItem, saveItems, toast]
  );

  // Touch Handlers for Mobile Long-Press Action Sheet
  const handleTouchStart = (item: RoadmapItem) => {
    touchTimerRef.current = setTimeout(() => {
      setActionSheetItem(item);
    }, 380);
  };

  const handleTouchEndOrMove = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleDragOverCol = (e: React.DragEvent, colKey: RoadmapStatus) => {
    e.preventDefault();
    if (dragOverCol !== colKey) setDragOverCol(colKey);
  };

  const handleDragLeaveCol = () => {
    setDragOverCol(null);
  };

  const handleDropCol = (e: React.DragEvent, colKey: RoadmapStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    if (id) {
      moveItem(id, colKey);
    }
    setDraggingId(null);
    setDragOverCol(null);
  };

  // Filter Matching function: Filtering, not hiding structure
  // Cards that do not match are DIMMED rather than removed!
  const isCardMatchingFilters = useCallback(
    (item: RoadmapItem) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesQuery =
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }
      if (ownerFilter !== "all" && item.owner.name !== ownerFilter) {
        return false;
      }
      if (tagFilter !== "all" && !item.tags.includes(tagFilter)) {
        return false;
      }
      if (quarterFilter !== "all" && item.quarter !== quarterFilter) {
        return false;
      }
      return true;
    },
    [search, ownerFilter, tagFilter, quarterFilter]
  );

  const hasActiveFilters = search.trim() !== "" || ownerFilter !== "all" || tagFilter !== "all" || quarterFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setOwnerFilter("all");
    setTagFilter("all");
    setQuarterFilter("all");
    setStoredPreference("rm_owner_filter", "all");
    setStoredPreference("rm_tag_filter", "all");
    setStoredPreference("rm_quarter_filter", "all");
  };

  // Available tags in current items
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => item.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [items]);

  // Grouped by Status
  const itemsByStatus = useMemo(
    () => ({
      now: items.filter((i) => i.status === "now"),
      next: items.filter((i) => i.status === "next"),
      later: items.filter((i) => i.status === "later"),
    }),
    [items]
  );

  // Grouped by Quarter (for timeline view)
  const itemsByQuarter = useMemo(() => {
    const map = new Map<string, RoadmapItem[]>();
    QUARTERS.forEach((q) => map.set(q, []));
    items.forEach((item) => {
      const q = item.quarter || "Future";
      if (!map.has(q)) map.set(q, []);
      map.get(q)!.push(item);
    });
    return map;
  }, [items]);

  return (
    <>
      <Header />
      <main className="rm-page">
        {/* ── Toolbar & Filter Strip ── */}
        <div className="rm-toolbar">
          <div className="rm-toolbar-top">
            <div className="rm-toolbar-title-wrap">
              <h1 className="rm-toolbar-title">
                <Kanban size={20} strokeWidth={2.4} style={{ color: "var(--navy)" }} />
                Product Roadmap
              </h1>
              <span className="rm-toolbar-badge">Live Campus Tracker</span>
            </div>

            <div className="rm-toolbar-actions">
              {/* View Switcher: Board vs Timeline */}
              <div className="rm-view-switch" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`rm-view-btn${viewMode === "board" ? " rm-view-btn--active" : ""}`}
                  onClick={() => setViewMode("board")}
                  aria-pressed={viewMode === "board"}
                >
                  <Kanban size={13} strokeWidth={2.2} />
                  <span>Board</span>
                </button>
                <button
                  type="button"
                  className={`rm-view-btn${viewMode === "timeline" ? " rm-view-btn--active" : ""}`}
                  onClick={() => setViewMode("timeline")}
                  aria-pressed={viewMode === "timeline"}
                >
                  <Calendar size={13} strokeWidth={2.2} />
                  <span>Timeline</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="rm-filter-bar">
            <div className="rm-search-box">
              <Search className="rm-search-icon" size={14} />
              <input
                type="text"
                className="rm-search-input"
                placeholder="Filter by keyword or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="rm-filter-select"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              aria-label="Filter by Owner"
            >
              <option value="all">All Owners</option>
              {OWNERS.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>

            <select
              className="rm-filter-select"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="Filter by Tag"
            >
              <option value="all">All Tags</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              className="rm-filter-select"
              value={quarterFilter}
              onChange={(e) => setQuarterFilter(e.target.value)}
              aria-label="Filter by Quarter"
            >
              <option value="all">All Quarters</option>
              {QUARTERS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button type="button" className="rm-filter-reset" onClick={clearFilters}>
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Mobile Sticky Tab Bar (< 768px) ── */}
        <div className="rm-mobile-nav" role="tablist" aria-label="Roadmap stages">
          {COLUMNS.map((col) => {
            const count = itemsByStatus[col.key].length;
            const isActive = mobileTab === col.key;
            return (
              <button
                key={col.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`rm-mobile-tab-btn${isActive ? " rm-mobile-tab-btn--active" : ""}`}
                style={{ "--tab-color": col.colorHex } as React.CSSProperties}
                onClick={() => setMobileTab(col.key)}
              >
                <col.Icon size={14} strokeWidth={isActive ? 2.5 : 2} style={{ color: col.colorHex }} />
                <span>{col.label}</span>
                <span className="rm-mobile-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Board Shell (Desktop locked scroll, Tablet snap-scroll, Mobile single-col) ── */}
        <div className="rm-board-shell">
          {viewMode === "board" ? (
            <div className="rm-board">
              {COLUMNS.map((col) => {
                const colItems = itemsByStatus[col.key];
                const isMobileActive = mobileTab === col.key;
                const isOver = dragOverCol === col.key;

                return (
                  <RoadmapBoardColumn
                    key={col.key}
                    col={col}
                    colItems={colItems}
                    isMobileActive={isMobileActive}
                    isOver={isOver}
                    loading={loading}
                    draggingId={draggingId}
                    hasActiveFilters={hasActiveFilters}
                    isCardMatchingFilters={isCardMatchingFilters}
                    handleDragStart={handleDragStart}
                    handleDragEnd={handleDragEnd}
                    handleTouchStart={handleTouchStart}
                    handleTouchEndOrMove={handleTouchEndOrMove}
                    handleDragOverCol={handleDragOverCol}
                    handleDragLeaveCol={handleDragLeaveCol}
                    handleDropCol={handleDropCol}
                    setSelectedItem={openDrawer}
                    setActionSheetItem={setActionSheetItem}
                  />
                );
              })}
            </div>
          ) : (
            /* ── Timeline / Quarter View (Build Phase 3) ── */
            <div className="rm-timeline-view">
              {QUARTERS.map((q) => {
                const qItems = itemsByQuarter.get(q) || [];
                if (qItems.length === 0) return null;

                return (
                  <RoadmapTimelineQuarterGroup
                    key={q}
                    quarter={q}
                    qItems={qItems}
                    isCardMatchingFilters={isCardMatchingFilters}
                    setSelectedItem={openDrawer}
                    hasActiveFilters={hasActiveFilters}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* ── Detail Panel Drawer (Desktop/Tablet Side Drawer; Mobile Bottom Sheet) ── */}
        {selectedItem && (
          <div
            className="rm-drawer-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDrawer();
            }}
          >
            <div className="rm-drawer" role="dialog" aria-modal="true" aria-label="Roadmap Item Details">
              {/* Drawer Header */}
              <div className="rm-drawer-head">
                <div className="rm-drawer-head-status">
                  <span
                    className="rm-card-status-dot"
                    style={{
                      background: COLUMNS.find((c) => c.key === selectedItem.status)?.colorHex,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                    {COLUMNS.find((c) => c.key === selectedItem.status)?.label}
                  </span>
                </div>

                <button
                  type="button"
                  className="rm-drawer-close"
                  onClick={closeDrawer}
                  aria-label="Close drawer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="rm-drawer-body">
                {/* Title */}
                <div>
                  <label className="rm-drawer-field-label" style={{ display: "block", marginBottom: 6 }}>
                    Title
                  </label>
                  <input
                    type="text"
                    className="rm-drawer-title-input"
                    value={selectedItem.title}
                    onChange={(e) => {
                      const newTitleVal = e.target.value;
                      const updated = items.map((i) =>
                        i.id === selectedItem.id ? { ...i, title: newTitleVal } : i
                      );
                      saveItems(updated);
                      setSelectedItem((prev) => (prev ? { ...prev, title: newTitleVal } : null));
                    }}
                  />
                </div>

                {/* Status Segmented Control */}
                <div>
                  <label className="rm-drawer-field-label" style={{ display: "block", marginBottom: 8 }}>
                    Phase / Status (drives column placement)
                  </label>
                  <div className="rm-drawer-status-seg">
                    {COLUMNS.map((col) => {
                      const isActive = selectedItem.status === col.key;
                      return (
                        <button
                          key={col.key}
                          type="button"
                          className={`rm-drawer-status-btn${
                            isActive ? " rm-drawer-status-btn--active" : ""
                          }`}
                          style={{ "--col-color": col.colorHex } as React.CSSProperties}
                          onClick={() => moveItem(selectedItem.id, col.key)}
                        >
                          <col.Icon size={14} style={{ color: col.colorHex }} />
                          <span>{col.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Attributes Grid (Effort, Target Quarter, Owner, Tags) */}
                <div className="rm-drawer-grid">
                  <div className="rm-drawer-field">
                    <span className="rm-drawer-field-label">Effort</span>
                    <select
                      className="rm-drawer-select"
                      value={selectedItem.effort}
                      onChange={(e) => {
                        const val = e.target.value as EffortLevel;
                        const updated = items.map((i) =>
                          i.id === selectedItem.id ? { ...i, effort: val } : i
                        );
                        saveItems(updated);
                        setSelectedItem((prev) => (prev ? { ...prev, effort: val } : null));
                      }}
                    >
                      {EFFORT_OPTIONS.map((eff) => (
                        <option key={eff} value={eff}>
                          {eff} ({eff === "XS" ? "1-2 days" : eff === "S" ? "1 week" : eff === "M" ? "2-3 weeks" : eff === "L" ? "1-2 months" : "Multi-month"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rm-drawer-field">
                    <span className="rm-drawer-field-label">Target Delivery</span>
                    <select
                      className="rm-drawer-select"
                      value={selectedItem.quarter}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = items.map((i) =>
                          i.id === selectedItem.id ? { ...i, quarter: val } : i
                        );
                        saveItems(updated);
                        setSelectedItem((prev) => (prev ? { ...prev, quarter: val } : null));
                      }}
                    >
                      {QUARTERS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rm-drawer-field" style={{ gridColumn: "span 2" }}>
                    <span className="rm-drawer-field-label">Lead Owner</span>
                    <select
                      className="rm-drawer-select"
                      value={selectedItem.owner.name}
                      onChange={(e) => {
                        const ownerObj = OWNERS.find((o) => o.name === e.target.value) || OWNERS[0];
                        const updated = items.map((i) =>
                          i.id === selectedItem.id ? { ...i, owner: ownerObj } : i
                        );
                        saveItems(updated);
                        setSelectedItem((prev) => (prev ? { ...prev, owner: ownerObj } : null));
                      }}
                    >
                      {OWNERS.map((o) => (
                        <option key={o.name} value={o.name}>
                          {o.name} ({o.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="rm-drawer-desc-label">Description & Scope</div>
                  <div className="rm-drawer-desc">
                    {selectedItem.description || "No detailed description provided."}
                  </div>
                </div>

                {/* Activity & History */}
                <div>
                  <div className="rm-drawer-desc-label" style={{ marginBottom: 12 }}>
                    Activity History
                  </div>
                  <div className="rm-history-list">
                    {(selectedItem.history || []).map((h, i) => (
                      <div key={i} className="rm-history-item">
                        <span className="rm-history-dot" />
                        <div>
                          <div className="rm-history-text">{h.action}</div>
                          <div className="rm-history-time">
                            {new Date(h.timestamp).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="rm-drawer-footer">
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ink)",
                    }}
                  >
                    <ThumbsUp size={14} style={{ color: "var(--navy)" }} />
                    {selectedItem.vote_count} votes
                  </span>
                  {selectedItem.comment_count !== undefined && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--muted)",
                      }}
                    >
                      <MessageCircle size={14} />
                      {selectedItem.comment_count} comments
                    </span>
                  )}
                </div>

                {/* Link to community submission page */}
                <Link
                  href={`/idea/${selectedItem.id}`}
                  className="rm-drawer-link-btn"
                  onClick={() => setSelectedItem(null)}
                >
                  <span>Community Discussion</span>
                  <ExternalLink size={13} />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Mobile Action Sheet (Long-Press / Quick Move) ── */}
        {actionSheetItem && (
          <div
            className="rm-action-sheet-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setActionSheetItem(null);
            }}
          >
            <div className="rm-action-sheet" role="dialog" aria-label="Quick Move Options">
              <div className="rm-action-sheet-head">
                <h3 className="rm-action-sheet-title">{actionSheetItem.title}</h3>
                <p className="rm-action-sheet-sub">Reassign stage or view detailed progress</p>
              </div>

              <div className="rm-action-sheet-options">
                {COLUMNS.map((col) => {
                  const isCurrent = actionSheetItem.status === col.key;
                  return (
                    <button
                      key={col.key}
                      type="button"
                      className="rm-action-sheet-btn"
                      onClick={() => {
                        moveItem(actionSheetItem.id, col.key);
                        setActionSheetItem(null);
                      }}
                    >
                      <col.Icon size={16} style={{ color: col.colorHex }} />
                      <span style={{ flex: 1 }}>
                        Move to <strong>{col.label}</strong> ({col.desc})
                      </span>
                      {isCurrent && <Check size={16} style={{ color: "var(--navy)" }} />}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="rm-action-sheet-btn"
                  onClick={() => {
                    setSelectedItem(actionSheetItem);
                    setActionSheetItem(null);
                  }}
                >
                  <ArrowRight size={16} />
                  <span>Open Full Details Drawer</span>
                </button>

                <button
                  type="button"
                  className="rm-action-sheet-btn rm-action-sheet-btn--cancel"
                  onClick={() => setActionSheetItem(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
