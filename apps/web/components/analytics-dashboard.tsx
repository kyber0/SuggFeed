"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Download,
  RefreshCw,
  Search,
  ArrowUpDown,
  Activity,
} from "lucide-react";
import {
  subDays,
  format,
  isWithinInterval,
  startOfDay,
  parseISO,
  eachDayOfInterval,
  isSameDay,
} from "date-fns";
import type { PublishedSubmission } from "../lib/feedback-api";

export type Status = "pending" | "approved" | "rejected" | "in_progress" | "resolved";
export type Submission = Omit<PublishedSubmission, "status"> & { status: Status };

export type TimeRange = "7d" | "30d" | "90d" | "1y" | "all";

interface AnalyticsDashboardProps {
  submissions: Submission[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

const CATEGORY_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#6366F1", // Indigo
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#64748B", // Slate
];

const STATUS_CONFIG: Record<
  Status,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.12)" },
  approved: { label: "Approved", color: "#10B981", bg: "rgba(16, 185, 129, 0.12)" },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.12)" },
  resolved: { label: "Resolved", color: "#0D9488", bg: "rgba(13, 148, 136, 0.12)" },
  rejected: { label: "Rejected", color: "#EF4444", bg: "rgba(239, 68, 68, 0.12)" },
};

// Inline SVG Sparkline component
function Sparkline({
  data,
  color = "#3B82F6",
  height = 28,
  width = 80,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1 || 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} style={{ overflow: "visible", display: "inline-block" }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// Custom Tooltip for Area Chart
interface AreaTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}

function AreaTooltip({ active, payload, label }: AreaTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "10px 14px",
        boxShadow: "var(--shadow-md)",
        fontSize: "12px",
        fontVariantNumeric: "tabular-nums",
        minWidth: "160px",
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 8, borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
        {label}
      </div>
      {payload.map((entry, index) => (
        <div
          key={`item-${index}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: entry.color,
                display: "inline-block",
              }}
            />
            {entry.name}:
          </span>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// Custom Tooltip for Category Horizontal Bar Chart
interface CategoryTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string; count: number; votes: number; percentage: number } }>;
}

function CategoryTooltip({ active, payload }: CategoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "10px 14px",
        fontSize: "12px",
        boxShadow: "var(--shadow-md)",
        fontVariantNumeric: "tabular-nums",
        minWidth: "150px",
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
        {item.name}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
        <span style={{ color: "var(--muted)" }}>Submissions:</span>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>
          {item.count} ({item.percentage}%)
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "var(--muted)" }}>Total Votes:</span>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>
          {item.votes.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// KPI Delta Badge Component
function DeltaBadge({ delta, isInverse = false }: { delta: number; isInverse?: boolean }) {
  const isPositive = delta > 0;
  const isNeutral = delta === 0;

  const isGood = isInverse ? !isPositive : isPositive;
  const color = isNeutral ? "#64748B" : isGood ? "#10B981" : "#EF4444";
  const bg = isNeutral
    ? "rgba(100, 116, 139, 0.1)"
    : isGood
    ? "rgba(16, 185, 129, 0.12)"
    : "rgba(239, 68, 68, 0.12)";

  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: "var(--r-full)",
        color: color,
        backgroundColor: bg,
        fontVariantNumeric: "tabular-nums",
      }}
      title={`${delta > 0 ? "+" : ""}${delta.toFixed(1)}% vs previous period`}
    >
      <Icon size={12} strokeWidth={2.5} />
      <span>{delta > 0 ? "+" : ""}{delta.toFixed(1)}%</span>
    </span>
  );
}

export function AnalyticsDashboard({
  submissions = [],
  isLoading = false,
  onRefresh,
}: AnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [trendView, setTrendView] = useState<"daily" | "cumulative">("daily");
  const [tableSearch, setTableSearch] = useState<string>("");
  const [sortField, setSortField] = useState<"count" | "votes" | "approved" | "name">("count");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      const name = s.categories?.name;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [submissions]);

  // Determine current & previous time interval windows
  const { currentInterval, previousInterval, daysCount } = useMemo(() => {
    const now = new Date();
    let days = 30;
    if (timeRange === "7d") days = 7;
    else if (timeRange === "30d") days = 30;
    else if (timeRange === "90d") days = 90;
    else if (timeRange === "1y") days = 365;
    else if (timeRange === "all") days = 730;

    const currentStart = startOfDay(subDays(now, days));
    const currentEnd = now;
    const previousStart = startOfDay(subDays(now, days * 2));
    const previousEnd = currentStart;

    return {
      currentInterval: { start: currentStart, end: currentEnd },
      previousInterval: { start: previousStart, end: previousEnd },
      daysCount: days,
    };
  }, [timeRange]);

  // Filter submissions by time range and category
  const { currentSubmissions, previousSubmissions } = useMemo(() => {
    const filteredByCategory =
      selectedCategory === "all"
        ? submissions
        : submissions.filter((s) => s.categories?.name === selectedCategory);

    const current: Submission[] = [];
    const previous: Submission[] = [];

    filteredByCategory.forEach((s) => {
      if (!s.created_at) return;
      try {
        const date = parseISO(s.created_at);
        if (timeRange === "all") {
          current.push(s);
        } else if (isWithinInterval(date, currentInterval)) {
          current.push(s);
        } else if (isWithinInterval(date, previousInterval)) {
          previous.push(s);
        }
      } catch {
        // ignore parsing err
      }
    });

    return { currentSubmissions: current, previousSubmissions: previous };
  }, [submissions, selectedCategory, timeRange, currentInterval, previousInterval]);

  // Compute 5 Top-Level KPIs with Comparison Deltas
  const kpis = useMemo(() => {
    const curTotal = currentSubmissions.length;
    const prevTotal = previousSubmissions.length;
    const totalDelta = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : curTotal > 0 ? 100 : 0;

    // Approval Rate
    const curApproved = currentSubmissions.filter((s) =>
      ["approved", "in_progress", "resolved"].includes(s.status)
    ).length;
    const prevApproved = previousSubmissions.filter((s) =>
      ["approved", "in_progress", "resolved"].includes(s.status)
    ).length;
    const curApprovalRate = curTotal > 0 ? (curApproved / curTotal) * 100 : 0;
    const prevApprovalRate = prevTotal > 0 ? (prevApproved / prevTotal) * 100 : 0;
    const approvalDelta = curApprovalRate - prevApprovalRate;

    // Total Community Votes
    const curVotes = currentSubmissions.reduce((acc, s) => acc + (s.vote_count || 0), 0);
    const prevVotes = previousSubmissions.reduce((acc, s) => acc + (s.vote_count || 0), 0);
    const votesDelta = prevVotes > 0 ? ((curVotes - prevVotes) / prevVotes) * 100 : curVotes > 0 ? 100 : 0;

    // Resolution Rate
    const curResolved = currentSubmissions.filter((s) => s.status === "resolved").length;
    const prevResolved = previousSubmissions.filter((s) => s.status === "resolved").length;
    const curResolutionRate = curApproved > 0 ? (curResolved / curApproved) * 100 : 0;
    const prevResolutionRate = prevApproved > 0 ? (prevResolved / prevApproved) * 100 : 0;
    const resolutionDelta = curResolutionRate - prevResolutionRate;

    // Avg Votes per Idea
    const curAvgVotes = curTotal > 0 ? curVotes / curTotal : 0;
    const prevAvgVotes = prevTotal > 0 ? prevVotes / prevTotal : 0;
    const avgVotesDelta =
      prevAvgVotes > 0 ? ((curAvgVotes - prevAvgVotes) / prevAvgVotes) * 100 : curAvgVotes > 0 ? 100 : 0;

    // Generate 7-point sparklines
    const sparklineDays = Math.min(daysCount, 7);
    const sparklinePoints: number[] = [];
    const now = new Date();
    for (let i = sparklineDays - 1; i >= 0; i--) {
      const dayStart = startOfDay(subDays(now, i));
      const count = currentSubmissions.filter((s) => {
        try {
          return isSameDay(parseISO(s.created_at), dayStart);
        } catch {
          return false;
        }
      }).length;
      sparklinePoints.push(count);
    }

    return {
      totalSubmissions: { value: curTotal, delta: totalDelta, sparkline: sparklinePoints },
      approvalRate: { value: curApprovalRate, delta: approvalDelta },
      totalVotes: { value: curVotes, delta: votesDelta },
      resolutionRate: { value: curResolutionRate, delta: resolutionDelta },
      avgVotes: { value: curAvgVotes, delta: avgVotesDelta },
    };
  }, [currentSubmissions, previousSubmissions, daysCount]);

  // Compute Primary Timeline Data (Area Chart)
  const timelineData = useMemo(() => {
    if (timeRange === "all" && currentSubmissions.length === 0) return [];

    const now = new Date();
    const days = Math.min(daysCount, 60); // Cap at 60 points for high visual clarity
    const intervalDays = eachDayOfInterval({
      start: subDays(now, days - 1),
      end: now,
    });

    let cumulativeSubmissions = 0;
    let cumulativeApproved = 0;

    return intervalDays.map((date) => {
      const formattedDate = format(date, "MMM d");
      const fullDate = format(date, "MMMM d, yyyy");

      const daySubmissions = currentSubmissions.filter((s) => {
        try {
          return isSameDay(parseISO(s.created_at), date);
        } catch {
          return false;
        }
      });

      const dayApproved = daySubmissions.filter((s) =>
        ["approved", "in_progress", "resolved"].includes(s.status)
      ).length;

      const subCount = daySubmissions.length;
      cumulativeSubmissions += subCount;
      cumulativeApproved += dayApproved;

      return {
        date: formattedDate,
        fullDate,
        Submissions: trendView === "cumulative" ? cumulativeSubmissions : subCount,
        Approved: trendView === "cumulative" ? cumulativeApproved : dayApproved,
        Votes: daySubmissions.reduce((acc, s) => acc + (s.vote_count || 0), 0),
      };
    });
  }, [currentSubmissions, daysCount, timeRange, trendView]);

  // Compute Category Breakdown (Horizontal Bar Chart)
  const categoryData = useMemo(() => {
    const total = currentSubmissions.length || 1;
    const catMap: Record<string, { count: number; votes: number }> = {};

    currentSubmissions.forEach((s) => {
      const cat = s.categories?.name || "Other";
      if (!catMap[cat]) catMap[cat] = { count: 0, votes: 0 };
      catMap[cat].count += 1;
      catMap[cat].votes += s.vote_count || 0;
    });

    return Object.entries(catMap)
      .map(([name, stats], idx) => ({
        name,
        count: stats.count,
        votes: stats.votes,
        percentage: Number(((stats.count / total) * 100).toFixed(1)),
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [currentSubmissions]);

  // Compute Moderation Funnel Data
  const funnelData = useMemo(() => {
    const total = currentSubmissions.length || 1;
    const counts: Record<Status, number> = {
      pending: 0,
      approved: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
    };

    currentSubmissions.forEach((s) => {
      if (counts[s.status] !== undefined) {
        counts[s.status] += 1;
      }
    });

    const sequence: Status[] = ["pending", "approved", "in_progress", "resolved", "rejected"];

    return sequence.map((status) => ({
      status,
      label: STATUS_CONFIG[status].label,
      count: counts[status],
      percentage: Number(((counts[status] / total) * 100).toFixed(1)),
      color: STATUS_CONFIG[status].color,
    }));
  }, [currentSubmissions]);

  // High-Density Breakdown Table Data
  const tableData = useMemo(() => {
    const catStats: Record<
      string,
      {
        name: string;
        count: number;
        votes: number;
        approved: number;
        topIdea: string;
        dailyCounts: number[];
      }
    > = {};

    const now = new Date();
    currentSubmissions.forEach((s) => {
      const cat = s.categories?.name || "Other";
      if (!catStats[cat]) {
        catStats[cat] = {
          name: cat,
          count: 0,
          votes: 0,
          approved: 0,
          topIdea: s.title,
          dailyCounts: [0, 0, 0, 0, 0, 0, 0],
        };
      }
      catStats[cat].count += 1;
      catStats[cat].votes += s.vote_count || 0;
      if (["approved", "in_progress", "resolved"].includes(s.status)) {
        catStats[cat].approved += 1;
      }

      // 7-day sparkline bucket calculation
      try {
        const itemDate = parseISO(s.created_at);
        for (let i = 0; i < 7; i++) {
          if (isSameDay(itemDate, subDays(now, 6 - i))) {
            catStats[cat].dailyCounts[i] += 1;
          }
        }
      } catch {
        // ignore
      }
    });

    let result = Object.values(catStats).map((item) => ({
      ...item,
      avgVotes: item.count > 0 ? (item.votes / item.count).toFixed(1) : "0.0",
      approvalRate: item.count > 0 ? ((item.approved / item.count) * 100).toFixed(0) : "0",
    }));

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      result = result.filter(
        (r) => r.name.toLowerCase().includes(q) || r.topIdea.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let diff = 0;
      if (sortField === "count") diff = a.count - b.count;
      else if (sortField === "votes") diff = a.votes - b.votes;
      else if (sortField === "approved") diff = Number(a.approvalRate) - Number(b.approvalRate);
      else if (sortField === "name") diff = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? diff : -diff;
    });

    return result;
  }, [currentSubmissions, tableSearch, sortField, sortOrder]);

  // CSV Export Handler
  function exportCSV() {
    if (currentSubmissions.length === 0) return;
    const headers = ["ID", "Title", "Category", "Status", "Votes", "Created At"];
    const rows = currentSubmissions.map((s) => [
      s.id,
      `"${s.title.replace(/"/g, '""')}"`,
      s.categories?.name || "Other",
      s.status,
      s.vote_count,
      s.created_at,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `suggfeed_analytics_${timeRange}_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Skeleton Loader for Layout Stability
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                height: 110,
                background: "var(--surface)",
                borderRadius: "var(--r-xl)",
                border: "1px solid var(--line)",
                opacity: 0.6,
                animation: "pulse 1.5s infinite",
              }}
            />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, height: 350 }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", border: "1px solid var(--line)" }} />
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", border: "1px solid var(--line)" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 12 }}>
      {/* ── Global Top Control Bar ────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 20px",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--r-md)",
              background: "rgba(59, 130, 246, 0.1)",
              color: "#3B82F6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
              Executive Analytics & Performance
            </h2>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: "2px 0 0 0" }}>
              Continuous telemetry, moderation throughput & engagement signals
            </p>
          </div>
        </div>

        {/* Global Controls Top-Right */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          {/* Category Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <Filter size={14} style={{ color: "var(--muted)", position: "absolute", left: 10 }} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: "7px 12px 7px 30px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--ink)",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Selector */}
          <div
            style={{
              display: "inline-flex",
              background: "var(--bg)",
              padding: "3px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line)",
            }}
          >
            {(["7d", "30d", "90d", "1y", "all"] as TimeRange[]).map((range) => {
              const active = timeRange === range;
              return (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  style={{
                    padding: "5px 11px",
                    fontSize: "11px",
                    fontWeight: active ? 700 : 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: active ? "var(--ink)" : "var(--muted)",
                    background: active ? "var(--surface)" : "transparent",
                    border: "none",
                    borderRadius: "calc(var(--r-md) - 2px)",
                    boxShadow: active ? "var(--shadow-sm)" : "none",
                    cursor: "pointer",
                    transition: "all var(--t-fast)",
                  }}
                >
                  {range}
                </button>
              );
            })}
          </div>

          {/* Export CSV Button */}
          <button
            onClick={exportCSV}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 13px",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--ink)",
              background: "var(--bg)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
              transition: "background var(--t-fast)",
            }}
            title="Export filtered data as CSV"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                color: "var(--muted)",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                cursor: "pointer",
              }}
              title="Refresh telemetry"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Section 1: Exactly 5 Top-Level KPI Cards (Strict Limit) ─────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        {/* KPI 1: Total Submissions */}
        <div
          style={{
            background: "var(--surface)",
            padding: "18px 20px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Submissions
            </span>
            <DeltaBadge delta={kpis.totalSubmissions.delta} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {kpis.totalSubmissions.value.toLocaleString()}
            </span>
            <Sparkline data={kpis.totalSubmissions.sparkline} color="#3B82F6" />
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: 6 }}>
            vs previous {daysCount} days
          </span>
        </div>

        {/* KPI 2: Approval Rate */}
        <div
          style={{
            background: "var(--surface)",
            padding: "18px 20px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Approval Rate
            </span>
            <DeltaBadge delta={kpis.approvalRate.delta} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {kpis.approvalRate.value.toFixed(1)}%
            </span>
            <div
              style={{
                width: 60,
                height: 8,
                borderRadius: 4,
                background: "var(--bg-2)",
                overflow: "hidden",
                alignSelf: "center",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(kpis.approvalRate.value, 100)}%`,
                  background: "#10B981",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: 6 }}>
            Accepted into pipeline
          </span>
        </div>

        {/* KPI 3: Community Upvotes */}
        <div
          style={{
            background: "var(--surface)",
            padding: "18px 20px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Community Votes
            </span>
            <DeltaBadge delta={kpis.totalVotes.delta} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {kpis.totalVotes.value.toLocaleString()}
            </span>
            <div
              style={{
                padding: "4px 8px",
                borderRadius: "var(--r-md)",
                background: "rgba(99, 102, 241, 0.1)",
                color: "#6366F1",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              Votes Cast
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: 6 }}>
            Total student interest
          </span>
        </div>

        {/* KPI 4: Resolution Velocity */}
        <div
          style={{
            background: "var(--surface)",
            padding: "18px 20px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Resolution Ratio
            </span>
            <DeltaBadge delta={kpis.resolutionRate.delta} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {kpis.resolutionRate.value.toFixed(1)}%
            </span>
            <div
              style={{
                width: 60,
                height: 8,
                borderRadius: 4,
                background: "var(--bg-2)",
                overflow: "hidden",
                alignSelf: "center",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(kpis.resolutionRate.value, 100)}%`,
                  background: "#0D9488",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: 6 }}>
            Approved items resolved
          </span>
        </div>

        {/* KPI 5: Avg Votes Per Idea */}
        <div
          style={{
            background: "var(--surface)",
            padding: "18px 20px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Avg Engagement
            </span>
            <DeltaBadge delta={kpis.avgVotes.delta} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ fontSize: "30px", fontWeight: 800, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {kpis.avgVotes.value.toFixed(1)}
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>votes / idea</span>
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)", marginTop: 6 }}>
            Per submitted proposal
          </span>
        </div>
      </div>

      {/* ── Section 2: Primary Visualizations (Middle Tier) ────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: 20 }}>
        {/* Chart 1: Trend Over Time (Area Chart) */}
        <div
          style={{
            background: "var(--surface)",
            padding: "20px 24px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
                Submission & Approval Trajectory
              </h3>
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: "3px 0 0 0" }}>
                Volume trends over the selected {daysCount}-day window
              </p>
            </div>
            {/* Inline Chart View Toggle */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--bg)",
                padding: "2px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
              }}
            >
              <button
                onClick={() => setTrendView("daily")}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: trendView === "daily" ? 700 : 500,
                  color: trendView === "daily" ? "var(--ink)" : "var(--muted)",
                  background: trendView === "daily" ? "var(--surface)" : "transparent",
                  border: "none",
                  borderRadius: "var(--r-sm)",
                  cursor: "pointer",
                }}
              >
                Daily
              </button>
              <button
                onClick={() => setTrendView("cumulative")}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: trendView === "cumulative" ? 700 : 500,
                  color: trendView === "cumulative" ? "var(--ink)" : "var(--muted)",
                  background: trendView === "cumulative" ? "var(--surface)" : "transparent",
                  border: "none",
                  borderRadius: "var(--r-sm)",
                  cursor: "pointer",
                }}
              >
                Cumulative
              </button>
            </div>
          </div>

          <div style={{ height: 280, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="submissionsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="approvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" opacity={0.6} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  allowDecimals={false}
                />
                <Tooltip content={<AreaTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Submissions"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#submissionsGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="Approved"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#approvedGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11px", color: "var(--muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#3B82F6" }} />
              <span>Total Submissions</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11px", color: "var(--muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981" }} />
              <span>Approved Pipeline</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Category Breakdown (Horizontal Bar Chart) */}
        <div
          style={{
            background: "var(--surface)",
            padding: "20px 24px",
            borderRadius: "var(--r-xl)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
              Category Volume & Share
            </h3>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: "3px 0 0 0" }}>
              Part-to-whole horizontal distribution (starting strictly at 0)
            </p>
          </div>

          <div style={{ height: 280, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" opacity={0.6} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "var(--ink)", fontWeight: 500 }}
                  width={90}
                />
                <Tooltip content={<CategoryTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cat-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: "center", fontSize: "11px", color: "var(--muted)", marginTop: 12 }}>
            Ranked by total submission volume
          </div>
        </div>
      </div>

      {/* ── Section 3: Moderation Funnel Progression ──────────────────────────── */}
      <div
        style={{
          background: "var(--surface)",
          padding: "20px 24px",
          borderRadius: "var(--r-xl)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
            Moderation Funnel & Lifecycle Stages
          </h3>
          <p style={{ fontSize: "12px", color: "var(--muted)", margin: "3px 0 0 0" }}>
            Operational throughput from student intake to resolution
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          {funnelData.map((stage) => (
            <div
              key={stage.status}
              style={{
                padding: "14px 16px",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-lg)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: stage.color,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>
                  {stage.label}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: stage.color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stage.percentage}%
                </span>
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--ink)",
                  marginTop: 8,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {stage.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 4: High-Density Category Breakdown Table ─────────────────── */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "var(--r-xl)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>
              Category & Cluster Telemetry
            </h3>
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: "2px 0 0 0" }}>
              High-density breakdown with inline 7-day sparklines and conversion statistics
            </p>
          </div>

          {/* Table Search */}
          <div style={{ position: "relative", minWidth: 220 }}>
            <Search size={14} style={{ color: "var(--muted)", position: "absolute", left: 10, top: 10 }} />
            <input
              type="text"
              placeholder="Filter categories..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 12px 6px 30px",
                fontSize: "12px",
                color: "var(--ink)",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "13px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--bg)",
                  borderBottom: "1px solid var(--line)",
                  color: "var(--muted)",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                <th
                  onClick={() => {
                    setSortField("name");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    Category Name <ArrowUpDown size={11} />
                  </span>
                </th>
                <th
                  onClick={() => {
                    setSortField("count");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  style={{
                    padding: "10px 16px",
                    textAlign: "right",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    Total Ideas <ArrowUpDown size={11} />
                  </span>
                </th>
                <th style={{ padding: "10px 16px", textAlign: "center" }}>7-Day Trend</th>
                <th
                  onClick={() => {
                    setSortField("votes");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  style={{
                    padding: "10px 16px",
                    textAlign: "right",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    Votes Cast <ArrowUpDown size={11} />
                  </span>
                </th>
                <th style={{ padding: "10px 16px", textAlign: "right" }}>Avg Votes / Idea</th>
                <th
                  onClick={() => {
                    setSortField("approved");
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  }}
                  style={{
                    padding: "10px 16px",
                    textAlign: "right",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    Approval Rate <ArrowUpDown size={11} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
                    No matching categories found in this window.
                  </td>
                </tr>
              ) : (
                tableData.map((row, idx) => (
                  <tr
                    key={row.name}
                    style={{
                      borderBottom: "1px solid var(--line)",
                      background: idx % 2 === 0 ? "transparent" : "var(--bg-2)",
                      transition: "background var(--t-fast)",
                    }}
                  >
                    {/* Left-align text */}
                    <td style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--ink)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                          }}
                        />
                        {row.name}
                      </span>
                    </td>

                    {/* Right-align numbers */}
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: "var(--ink)" }}>
                      {row.count}
                    </td>

                    {/* Center-align sparkline */}
                    <td style={{ padding: "6px 16px", textAlign: "center" }}>
                      <Sparkline data={row.dailyCounts} color={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                    </td>

                    {/* Right-align votes */}
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "var(--ink)" }}>
                      {row.votes.toLocaleString()}
                    </td>

                    {/* Right-align avg */}
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "var(--muted)" }}>
                      {row.avgVotes}
                    </td>

                    {/* Right-align percentage badge */}
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "var(--r-full)",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: Number(row.approvalRate) >= 50 ? "#10B981" : "#F59E0B",
                          background:
                            Number(row.approvalRate) >= 50
                              ? "rgba(16, 185, 129, 0.12)"
                              : "rgba(245, 158, 11, 0.12)",
                        }}
                      >
                        {row.approvalRate}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
