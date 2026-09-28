"use client";

import { FormEvent, useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "./toast";
import { useAuth } from "./auth-context";
import { loadAttachments, type AttachmentFile } from "../lib/feedback-api";
import {
  getStoredPreference,
  setStoredPreference,
  getSessionPreference,
  setSessionPreference,
  getCacheItem,
  setCacheItem,
  invalidateCache,
} from "../lib/cache-manager";
import {
  CheckCircle2,
  GitPullRequestArrow,
  CircleCheck,
  XCircle,
  LogOut,
  Paperclip,
  X,
  ChevronRight,
  ExternalLink,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Inbox,
  Layers,
  MessageSquare,
  ThumbsUp,
  Check,
  Eye,
  EyeOff,
  History,
  Sparkles,
  Lock,
  Mail,
  Flag,
  Tag,
  Clock,
  RotateCcw,
  ChevronsUp,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { AnalyticsDashboard } from "./analytics-dashboard";
import type { PublishedSubmission } from "../lib/feedback-api";
import Link from "next/link";

export type Status = "pending" | "approved" | "rejected" | "in_progress" | "resolved";
export type Submission = Omit<PublishedSubmission, "status"> & { status: Status };
export type HistoryEntry = {
  id: string;
  submission_id?: string;
  new_status: Status;
  old_status: Status | null;
  note: string | null;
  created_at: string;
  profiles: { display_name: string | null } | null;
  submissions?: { title: string } | null;
};

export type FlaggedComment = {
  id: string;
  submission_id: string;
  body: string;
  display_name: string | null;
  created_at: string;
  report_count: number;
  is_hidden: boolean;
  submissions?: { title: string } | null;
};

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  approved: "Approved",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

const ALL_STATUSES: Status[] = ["pending", "approved", "in_progress", "resolved", "rejected"];

const CANNED_RESPONSES = [
  "Approved — queued for campus operations review.",
  "Under active evaluation by student affairs.",
  "Duplicate submission — merging with existing initiative.",
  "Resolved in recent campus facility upgrades.",
  "Does not meet student submission guidelines.",
];

export function AdminDashboard({
  defaultViewMode = "queue",
}: {
  defaultViewMode?: "queue" | "analytics";
}) {
  const { toast } = useToast();
  const { session: authSession, role: contextRole, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  // true while we're resolving the role for an existing session
  const [roleLoading, setRoleLoading] = useState(true);

  // Active view tab: 'queue' | 'flagged' | 'audit' | 'analytics'
  const [activeTab, setActiveTab] = useState<"queue" | "flagged" | "audit" | "analytics">(
    defaultViewMode === "analytics" ? "analytics" : "queue"
  );

  // Submissions data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);

  // Flagged comments data
  const [flaggedComments, setFlaggedComments] = useState<FlaggedComment[]>([]);
  const [flaggedLoading, setFlaggedLoading] = useState(false);

  // Global Audit log data
  const [auditLog, setAuditLog] = useState<HistoryEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Filtering & Sorting
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "votes" | "oldest" | "title">("newest");

  // Lazy loading / pagination
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [allPagesSelected, setAllPagesSelected] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState("");

  // Detail Modal / Drawer
  const [viewIdea, setViewIdea] = useState<Submission | null>(null);

  const openIdeaModal = (idea: Submission) => {
    setViewIdea(idea);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("idea", idea.id);
      window.history.pushState({ ideaId: idea.id }, "", url.toString());
    } catch {
      // ignore
    }
  };

  const closeIdeaModal = () => {
    setViewIdea(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("idea");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  };

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adminAttachments, setAdminAttachments] = useState<AttachmentFile[]>([]);
  const [adminLightbox, setAdminLightbox] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Account recovery
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Hydrate staff portal preferences & draft notes on mount
  useEffect(() => {
    const savedTab = getStoredPreference<"queue" | "flagged" | "audit" | "analytics">(
      "admin_tab",
      defaultViewMode === "analytics" ? "analytics" : "queue"
    );
    const savedStatus = getStoredPreference<Status | "all">("admin_status", "all");
    const savedCategory = getStoredPreference<string>("admin_category", "all");
    const savedSort = getStoredPreference<"newest" | "votes" | "oldest" | "title">("admin_sort", "newest");
    const savedNotes = getStoredPreference<Record<string, string>>("admin_notes", {});
    const savedSearch = getSessionPreference<string>("admin_search", "");

    if (defaultViewMode !== "analytics" && savedTab !== "queue") setActiveTab(savedTab);
    if (savedStatus !== "all") setFilterStatus(savedStatus);
    if (savedCategory !== "all") setFilterCategory(savedCategory);
    if (savedSort !== "newest") setSortBy(savedSort);
    if (Object.keys(savedNotes).length > 0) setNotes(savedNotes);
    if (savedSearch && !search) setSearch(savedSearch);
  }, [defaultViewMode]);

  // Persist staff portal preferences & draft notes
  useEffect(() => { setStoredPreference("admin_tab", activeTab); }, [activeTab]);
  useEffect(() => { setStoredPreference("admin_status", filterStatus); }, [filterStatus]);
  useEffect(() => { setStoredPreference("admin_category", filterCategory); }, [filterCategory]);
  useEffect(() => { setStoredPreference("admin_sort", sortBy); }, [sortBy]);
  useEffect(() => { setSessionPreference("admin_search", search); }, [search]);
  useEffect(() => {
    if (Object.keys(notes).length > 0) {
      setStoredPreference("admin_notes", notes);
    }
  }, [notes]);

  // Modal URL synchronization & browser back/forward support
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ideaId = params.get("idea");
      if (ideaId && !viewIdea && submissions.length > 0) {
        const found = submissions.find((s) => s.id === ideaId);
        if (found) setViewIdea(found);
      }
    } catch {
      // ignore
    }
  }, [submissions]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const ideaId = params.get("idea");
      if (!ideaId) {
        setViewIdea(null);
      } else {
        const found = submissions.find((s) => s.id === ideaId);
        if (found) setViewIdea(found);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [submissions]);

  // Load Submissions directly from Supabase for admin management
  async function loadSubmissions(_forceRefresh?: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select("id,title,description,status,created_at,user_id,category_id,categories(name),vote_count,attachments(id),author:profiles!submissions_user_id_fkey(display_name)")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) {
        console.error("Admin query error:", error);
        toast(`Unable to load submissions: ${error.message}`, "error");
        return;
      }
      const subs = (data ?? []) as unknown as Submission[];
      setSubmissions(subs);
    } catch (err) {
      console.error("Admin load exception:", err);
    } finally {
      setBusy(false);
    }
  }

  // Load Flagged Comments
  async function loadFlaggedComments() {
    setFlaggedLoading(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("id,submission_id,body,display_name,created_at,report_count,is_hidden,submissions(title)")
        .or("report_count.gt.0,is_hidden.eq.true")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!error && data) {
        setFlaggedComments(data as unknown as FlaggedComment[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFlaggedLoading(false);
    }
  }

  // Load Global Audit Log
  async function loadAuditLog() {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from("status_history")
        .select("id,submission_id,new_status,old_status,note,created_at,profiles(display_name),submissions(title)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data) {
        setAuditLog(data as unknown as HistoryEntry[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  }

  // Auth Initialization & Synchronization:
  // Automatically logs in any user who already has an admin or moderator session (including OAuth & email).
  useEffect(() => {
    setMounted(true);
    let active = true;

    async function syncAuth() {
      // If auth-context is still initializing, wait
      if (authLoading) return;

      const currentSession = authSession ?? (await supabase.auth.getSession()).data.session;
      if (!currentSession) {
        if (active) {
          setAccessToken(null);
          setUserRole(null);
          setRoleLoading(false);
        }
        return;
      }

      if (active) setAccessToken(currentSession.access_token);

      // Resolve role: prefer contextRole if already staff/moderator/admin, else fetch from database
      let resolvedRole = contextRole;
      if (!resolvedRole || resolvedRole === "student") {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", currentSession.user.id)
            .maybeSingle();

          const dbRole = profile?.role ?? currentSession.user.app_metadata?.role ?? currentSession.user.user_metadata?.role ?? "student";
          resolvedRole = dbRole;
        } catch (err) {
          console.error("Failed to query staff role", err);
        }
      }

      if (active) {
        setUserRole(resolvedRole ?? "student");
        setRoleLoading(false);

        // If the user is staff or admin, automatically load portal data
        if (resolvedRole === "moderator" || resolvedRole === "admin") {
          loadSubmissions();
        }
      }
    }

    syncAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        if (session?.access_token) setAccessToken(session.access_token);
        setRecoveryMode(true);
      } else if (session) {
        if (active) setAccessToken(session.access_token);
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .maybeSingle();
          const r = profile?.role ?? session.user.app_metadata?.role ?? session.user.user_metadata?.role ?? "student";
          if (active) {
            setUserRole(r);
            setRoleLoading(false);
            if (r === "moderator" || r === "admin") {
              loadSubmissions();
            }
          }
        } catch {
          if (active) setRoleLoading(false);
        }
      } else {
        if (active) {
          setAccessToken(null);
          setUserRole(null);
          setRoleLoading(false);
        }
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [authSession, contextRole, authLoading]);

  // Fetch contextual tab data
  useEffect(() => {
    if (!accessToken) return;
    if (activeTab === "flagged") loadFlaggedComments();
    if (activeTab === "audit") loadAuditLog();
  }, [activeTab, accessToken]);

  // Load Attachments for currently inspected idea
  useEffect(() => {
    if (viewIdea && (viewIdea.attachments?.length ?? 0) > 0) {
      setAdminAttachments([]);
      loadAttachments(viewIdea.id).then(setAdminAttachments).catch(console.error);
    } else {
      setAdminAttachments([]);
    }
  }, [viewIdea]);

  // Load Status History for currently inspected idea
  useEffect(() => {
    if (!viewIdea) {
      setStatusHistory([]);
      return;
    }
    const ideaId = viewIdea.id;
    setHistoryLoading(true);
    async function fetchHistory() {
      try {
        const { data } = await supabase
          .from("status_history")
          .select("id,new_status,old_status,note,created_at,profiles(display_name)")
          .eq("submission_id", ideaId)
          .order("created_at", { ascending: false });
        setStatusHistory((data ?? []) as unknown as HistoryEntry[]);
      } finally {
        setHistoryLoading(false);
      }
    }
    fetchHistory();
  }, [viewIdea]);

  // Sign In
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error || !data.session) {
      toast(error?.message ?? "Unable to authenticate staff account.", "error");
      return;
    }
    setAccessToken(data.session.access_token);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const r = profile?.role ?? data.session.user.app_metadata?.role ?? data.session.user.user_metadata?.role ?? "student";
      setUserRole(r);
      if (r === "moderator" || r === "admin") {
        await loadSubmissions();
        toast("Welcome back! Staff portal ready.", "success");
      } else {
        toast("Access restricted: This account does not have staff privileges.", "error");
      }
    } catch {
      await loadSubmissions();
      toast("Welcome back! Staff portal ready.", "success");
    }
  }

  // Password Recovery
  async function sendResetLink() {
    if (!email) {
      toast("Enter your registered school email address first.", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/admin",
    });
    setBusy(false);
    if (error) toast(error.message, "error");
    else toast("Password reset instructions sent to your email.", "success");
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 6) {
      toast("Password must be at least 6 characters.", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
    } else {
      toast("Password updated successfully.", "success");
      setRecoveryMode(false);
      await loadSubmissions();
    }
  }

  // Change Single Submission Status
  async function changeStatus(id: string, status: Status) {
    if (!accessToken) return;
    setBusy(true);
    const noteText = notes[id] ?? "";
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/review-submission`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ submissionId: id, status, note: noteText }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update submission");

      setSubmissions((cur) =>
        cur.map((item) => (item.id === id ? { ...item, status } : item))
      );
      setNotes((n) => {
        const next = { ...n };
        delete next[id];
        return next;
      });

      if (viewIdea?.id === id) {
        setViewIdea((prev) => (prev ? { ...prev, status } : null));
        supabase
          .from("status_history")
          .select("id,new_status,old_status,note,created_at,profiles(display_name)")
          .eq("submission_id", id)
          .order("created_at", { ascending: false })
          .then(({ data }) => setStatusHistory((data ?? []) as unknown as HistoryEntry[]));
      }
      toast(`Status updated to "${STATUS_LABELS[status]}".`, "success");
      invalidateCache("admin_submissions");
      invalidateCache("feed_");
      invalidateCache("roadmap_");
      invalidateCache(`submission_${id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update status.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Bulk Status Change
  async function bulkChangeStatus(status: Status) {
    if (!accessToken || selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/review-submission`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ submissionId: id, status, note: bulkNote || "" }),
          })
        )
      );

      setSubmissions((cur) =>
        cur.map((item) => (selectedIds.has(item.id) ? { ...item, status } : item))
      );
      setSelectedIds(new Set());
      setBulkNote("");
      toast(
        `${ids.length} idea${ids.length > 1 ? "s" : ""} updated to "${STATUS_LABELS[status]}".`,
        "success"
      );
      invalidateCache("admin_submissions");
      invalidateCache("feed_");
      invalidateCache("roadmap_");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to bulk update.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  // Comment Moderation Actions
  async function moderateComment(commentId: string, action: "unhide" | "hide" | "delete") {
    if (userRole !== "moderator" && userRole !== "admin") {
      toast("Moderator access required.", "error");
      return;
    }
    try {
      if (action === "unhide") {
        await supabase
          .from("comments")
          .update({ is_hidden: false, report_count: 0 })
          .eq("id", commentId);
        setFlaggedComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, is_hidden: false, report_count: 0 } : c))
        );
        toast("Comment approved and unhidden.", "success");
      } else if (action === "hide") {
        await supabase
          .from("comments")
          .update({ is_hidden: true })
          .eq("id", commentId);
        setFlaggedComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, is_hidden: true } : c))
        );
        toast("Comment hidden from public view.", "info");
      } else if (action === "delete") {
        await supabase.from("comments").delete().eq("id", commentId);
        setFlaggedComments((prev) => prev.filter((c) => c.id !== commentId));
        toast("Comment deleted permanently.", "info");
      }
    } catch (err) {
      toast("Unable to perform moderation action.", "error");
    }
  }

  // CSV Export
  function exportCsv() {
    const rows = [
      ["ID", "Title", "Description", "Category", "Status", "Votes", "Created Date"],
      ...filteredSubmissions.map((s) => [
        s.id,
        `"${s.title.replace(/"/g, '""')}"`,
        `"${s.description.replace(/"/g, '""')}"`,
        `"${s.categories?.name ?? "Other"}"`,
        s.status,
        String(s.vote_count || 0),
        new Date(s.created_at).toISOString(),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suggfeed-moderation-${filterStatus}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Moderation report exported to CSV.", "success");
  }

  // Sign out
  async function signOut() {
    await supabase.auth.signOut();
    setAccessToken(null);
    setUserRole(null);
    setSubmissions([]);
    toast("Staff session ended.", "info");
  }

  // Metrics computation
  const counts = useMemo(() => {
    return ALL_STATUSES.reduce(
      (acc, s) => {
        acc[s] = submissions.filter((x) => x.status === s).length;
        return acc;
      },
      {} as Record<Status, number>
    );
  }, [submissions]);

  const resolutionRate = useMemo(() => {
    if (submissions.length === 0) return 0;
    const resolvedCount = counts.resolved || 0;
    return Math.round((resolvedCount / submissions.length) * 100);
  }, [submissions.length, counts.resolved]);

  // Categories list
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      if (s.categories?.name) set.add(s.categories.name);
    });
    return Array.from(set);
  }, [submissions]);

  // Filtered & Sorted Submissions
  const filteredSubmissions = useMemo(() => {
    let result = submissions;

    // Filter by status
    if (filterStatus !== "all") {
      result = result.filter((s) => s.status === filterStatus);
    }

    // Filter by category
    if (filterCategory !== "all") {
      result = result.filter((s) => (s.categories?.name ?? "Other") === filterCategory);
    }

    // Filter by search query
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.categories?.name ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "votes") {
        return (b.vote_count || 0) - (a.vote_count || 0);
      }
      if (sortBy === "title") {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [submissions, filterStatus, filterCategory, search, sortBy]);

  // Reset visible count whenever filters/sort/tab change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setAllPagesSelected(false);
  }, [filterStatus, filterCategory, search, sortBy, activeTab]);

  // Visible slice for lazy rendering
  const visibleSubmissions = useMemo(
    () => filteredSubmissions.slice(0, visibleCount),
    [filteredSubmissions, visibleCount]
  );
  const hasMoreItems = visibleCount < filteredSubmissions.length;

  // IntersectionObserver — auto-load more when sentinel scrolls into view
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredSubmissions.length));
  }, [filteredSubmissions.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "300px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Neutral mounting shell to avoid hydration mismatches
  if (!mounted || roleLoading) {
    return (
      <main className="admin-shell admin-login">
        <div className="login-card">
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Connecting to Staff Portal...</span>
          </div>
        </div>
      </main>
    );
  }

  // Access denied — user is authenticated but lacks staff role
  // Block anyone who has a session but is not confirmed staff.
  // This covers: students, null/missing profiles, and any role not in the allowlist.
  if (accessToken && userRole !== "moderator" && userRole !== "admin") {
    return (
      <>
        <header className="site-header">
          <a className="brand" href="/">
            Sugg<span>Feed</span>
          </a>
          <nav>
            <a href="/">← Public Site</a>
            <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
            <button
              onClick={async () => { await supabase.auth.signOut(); setAccessToken(null); setUserRole(null); }}
              className="btn-ghost"
            >
              <LogOut size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Sign out
            </button>
            <ThemeToggle />
          </nav>
        </header>
        <main className="admin-shell admin-login">
          <div className="login-card" style={{ textAlign: "center" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "rgba(220, 38, 38, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                color: "#dc2626",
              }}
            >
              <Lock size={24} />
            </div>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Access Denied</h1>
            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 320, margin: "0 auto 24px" }}>
              Your account does not have moderator or administrator privileges. Contact your system administrator to request access.
            </p>
            <a href="/" className="btn-primary" style={{ display: "inline-block", textDecoration: "none", padding: "10px 24px" }}>
              Return to Public Site
            </a>
          </div>
        </main>
      </>
    );
  }

  // Account Recovery Screen
  if (recoveryMode) {
    return (
      <>
        <header className="site-header">
          <a className="brand" href="/">
            Sugg<span>Feed</span>
          </a>
          <nav>
            <a href="/">← Back to Campus Site</a>
            <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
            <ThemeToggle />
          </nav>
        </header>

        <main className="admin-shell admin-login">
          <div className="login-card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(11, 56, 87, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--navy)",
                }}
              >
                <Lock size={18} />
              </div>
              <span className="sp-eyebrow">SECURITY RESET</span>
            </div>
            <h1>Create New Password</h1>
            <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "6px 0 20px" }}>
              Choose a secure password for your moderator account.
            </p>
            <form onSubmit={updatePassword}>
              <div className="field">
                <label>New Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Min 6 characters"
                    minLength={6}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 12, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none",
                      color: "var(--muted)", cursor: "pointer",
                      display: "flex", alignItems: "center", padding: 0,
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                  </button>
                </div>
              </div>
              <button
                className="btn-primary"
                disabled={busy}
                style={{ marginTop: 24, width: "100%" }}
              >
                {busy ? "Updating credentials..." : "Update Password & Sign In"}
              </button>
            </form>
          </div>
        </main>
      </>
    );
  }

  // Sign In Screen
  if (!accessToken) {
    return (
      <>
        <header className="site-header">
          <a className="brand" href="/">
            Sugg<span>Feed</span>
          </a>
          <nav>
            <a href="/">← Public Site</a>
            <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
            <ThemeToggle />
          </nav>
        </header>

        <main className="admin-shell admin-login">
          <div className="login-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(11, 56, 87, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--navy)",
                }}
              >
                <ShieldCheck size={22} strokeWidth={2.2} />
              </div>
              <div>
                <span className="sp-eyebrow">STAFF ACCESS</span>
                <h1 style={{ fontSize: 22, margin: "2px 0 0" }}>Moderator Portal</h1>
              </div>
            </div>

            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 24px" }}>
              Sign in with your university moderator or administrative credentials to triage community submissions.
            </p>

            <form onSubmit={signIn} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Staff Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@school.edu"
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label>Password</label>
                  <button
                    type="button"
                    onClick={sendResetLink}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--navy)",
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute", right: 12, top: "50%",
                      transform: "translateY(-50%)",
                      background: "none", border: "none",
                      color: "var(--muted)", cursor: "pointer",
                      display: "flex", alignItems: "center", padding: 0,
                    }}
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                  </button>
                </div>
              </div>

              <button
                className="btn-primary"
                disabled={busy}
                style={{ marginTop: 8, height: 42, fontSize: 14, fontWeight: 700 }}
              >
                {busy ? "Authenticating..." : "Sign in to Dashboard →"}
              </button>
            </form>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          Sugg<span>Feed</span>
        </a>
        <nav>
          <a href="/" className="nav-link-hide-mobile">
            Public Site
          </a>
          <a href="/roadmap" className="nav-link-hide-mobile">
            Roadmap
          </a>
          <button onClick={signOut} className="btn-ghost" title="Sign out of staff portal">
            <LogOut size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
            <span className="admin-signout-label">Sign out</span>
          </button>
          <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
          <ThemeToggle />
        </nav>
      </header>

      <main className="admin-shell">
        {/* ── Header Command Bar ── */}
        <div className="sp-header">
          <div className="sp-title-area">
            <span className="sp-eyebrow">
              <ShieldCheck size={12} strokeWidth={2.4} />
              STAFF COMMAND CENTER
            </span>
            <h1 className="sp-title">
              {activeTab === "queue" && "Community Moderation Queue"}
              {activeTab === "flagged" && "Flagged Content & Reports"}
              {activeTab === "audit" && "Staff Decision Audit Trail"}
              {activeTab === "analytics" && "Campus Insights & Analytics"}
            </h1>
            <p className="sp-subtitle">
              {activeTab === "queue" && "Review, triage, and route community ideas into campus delivery."}
              {activeTab === "flagged" && "Inspect comments reported by students or auto-hidden for review."}
              {activeTab === "audit" && "Recent status changes and administrative notes logged across the campus."}
              {activeTab === "analytics" && "High-level metrics and submission trends."}
            </p>
          </div>

          <div className="sp-header-actions">
            {/* Main Navigation Tabs */}
            <div className="sp-nav-tabs" role="tablist" aria-label="Staff Portal Views">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "queue"}
                className={`sp-nav-tab${activeTab === "queue" ? " sp-nav-tab--active" : ""}`}
                onClick={() => setActiveTab("queue")}
              >
                <Layers size={14} />
                <span>Queue</span>
                {counts.pending > 0 && (
                  <span className="sp-tab-badge sp-tab-badge--urgent">{counts.pending}</span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "flagged"}
                className={`sp-nav-tab${activeTab === "flagged" ? " sp-nav-tab--active" : ""}`}
                onClick={() => setActiveTab("flagged")}
              >
                <Flag size={14} />
                <span>Flagged</span>
                {flaggedComments.length > 0 && (
                  <span className="sp-tab-badge">{flaggedComments.length}</span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "audit"}
                className={`sp-nav-tab${activeTab === "audit" ? " sp-nav-tab--active" : ""}`}
                onClick={() => setActiveTab("audit")}
              >
                <History size={14} />
                <span>Audit</span>
              </button>

              <Link
                href="/admin/analytics"
                className={`sp-nav-tab${activeTab === "analytics" ? " sp-nav-tab--active" : ""}`}
                onClick={() => setActiveTab("analytics")}
              >
                <Sparkles size={14} />
                <span>Analytics</span>
              </Link>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              className="sp-btn-action"
              onClick={() => {
                loadSubmissions(true);
                if (activeTab === "flagged") loadFlaggedComments();
                if (activeTab === "audit") loadAuditLog();
              }}
              title="Refresh submissions from database"
            >
              <RefreshCw size={13} className={busy ? "spin" : ""} />
              <span>Refresh</span>
            </button>

            {/* Export CSV (Visible on queue view) */}
            {activeTab === "queue" && (
              <button
                type="button"
                className="sp-btn-action"
                onClick={exportCsv}
                title="Export current view to CSV"
              >
                <Download size={13} />
                <span>Export CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Tab: Analytics View (Keeps existing analytics intact) ── */}
        {activeTab === "analytics" ? (
          <AnalyticsDashboard
            submissions={submissions}
            isLoading={busy}
            onRefresh={loadSubmissions}
          />
        ) : activeTab === "flagged" ? (
          /* ── Tab: Flagged Comments View ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="sp-controls-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Flagged & Reported Comments</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Inspect user comments that were flagged by community members.
                  </p>
                </div>
                <span className="sp-chip-count" style={{ fontWeight: 700 }}>
                  {flaggedComments.length} flagged comments
                </span>
              </div>
            </div>

            {flaggedLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                Loading flagged items...
              </div>
            ) : flaggedComments.length === 0 ? (
              <div
                style={{
                  padding: "60px 20px",
                  textAlign: "center",
                  border: "2px dashed var(--line)",
                  borderRadius: 16,
                  color: "var(--muted)",
                  background: "var(--surface)",
                }}
              >
                <ShieldCheck size={36} style={{ color: "#10b981", margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: 18, color: "var(--ink)", margin: 0 }}>All Clear!</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                  No reported or hidden comments pending moderation.
                </p>
              </div>
            ) : (
              <div className="sp-list">
                {flaggedComments.map((comment) => (
                  <div key={comment.id} className="sp-card" style={{ cursor: "default" }}>
                    <div className="sp-card-body">
                      <div className="sp-card-title-row">
                        <span className="sp-meta-pill" style={{ background: "#fee2e2", color: "#991b1b" }}>
                          <Flag size={10} />
                          {comment.report_count} Reports
                        </span>
                        {comment.is_hidden && (
                          <span className="sp-meta-pill" style={{ background: "var(--line-2)", color: "var(--muted)" }}>
                            Hidden from public
                          </span>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                          {comment.display_name || "Anonymous Student"}
                        </span>
                        <span className="sp-card-date">
                          on Idea:{" "}
                          <strong style={{ color: "var(--ink)" }}>
                            {comment.submissions?.title ?? comment.submission_id}
                          </strong>
                        </span>
                      </div>

                      <p
                        style={{
                          margin: "8px 0 4px",
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: "var(--ink-2)",
                          background: "var(--bg)",
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: "1px solid var(--line)",
                        }}
                      >
                        {comment.body}
                      </p>

                      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <button
                          type="button"
                          className="sp-btn-action"
                          style={{ color: "#10b981", borderColor: "#10b981" }}
                          onClick={() => moderateComment(comment.id, "unhide")}
                        >
                          <Check size={13} />
                          <span>Approve & Keep Visible</span>
                        </button>
                        <button
                          type="button"
                          className="sp-btn-action"
                          style={{ color: "#f59e0b", borderColor: "#f59e0b" }}
                          onClick={() => moderateComment(comment.id, "hide")}
                        >
                          <Eye size={13} />
                          <span>Hide from Public</span>
                        </button>
                        <button
                          type="button"
                          className="sp-btn-action"
                          style={{ color: "#ef4444", borderColor: "#ef4444" }}
                          onClick={() => moderateComment(comment.id, "delete")}
                        >
                          <X size={13} />
                          <span>Delete Permanently</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === "audit" ? (
          /* ── Tab: Audit History View ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="sp-controls-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Decision Audit Log</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Complete trail of all status reviews and moderator notes.
                  </p>
                </div>
                <span className="sp-chip-count" style={{ fontWeight: 700 }}>
                  Showing last {auditLog.length} actions
                </span>
              </div>
            </div>

            {auditLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                Loading audit trail...
              </div>
            ) : auditLog.length === 0 ? (
              <div
                style={{
                  padding: "60px 20px",
                  textAlign: "center",
                  border: "2px dashed var(--line)",
                  borderRadius: 16,
                  color: "var(--muted)",
                  background: "var(--surface)",
                }}
              >
                <Inbox size={36} style={{ color: "var(--muted-2)", margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: 18, color: "var(--ink)", margin: 0 }}>No audit logs recorded</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                  Moderation decisions will automatically stream here.
                </p>
              </div>
            ) : (
              <div className="sp-list">
                {auditLog.map((log) => (
                  <div key={log.id} className="sp-card" style={{ cursor: "default", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background:
                          log.new_status === "approved"
                            ? "#ecfdf5"
                            : log.new_status === "rejected"
                            ? "#fef2f2"
                            : log.new_status === "in_progress"
                            ? "#eff6ff"
                            : "#faf5ff",
                        color:
                          log.new_status === "approved"
                            ? "#059669"
                            : log.new_status === "rejected"
                            ? "#dc2626"
                            : log.new_status === "in_progress"
                            ? "#2563eb"
                            : "#7c3aed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 13,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      {log.new_status === "approved"
                        ? "✓"
                        : log.new_status === "rejected"
                        ? "✕"
                        : log.new_status === "in_progress"
                        ? "→"
                        : "★"}
                    </div>

                    <div className="sp-card-body">
                      <div className="sp-card-title-row">
                        <strong style={{ fontSize: 14, color: "var(--ink)" }}>
                          {STATUS_LABELS[log.new_status]}
                        </strong>
                        {log.old_status && (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            (from {STATUS_LABELS[log.old_status]})
                          </span>
                        )}
                        <span style={{ fontSize: 13, color: "var(--muted-2)" }}>·</span>
                        <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
                          {log.submissions?.title ?? "Community Submission"}
                        </span>
                      </div>

                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {log.profiles?.display_name && (
                          <span>Moderated by <strong>{log.profiles.display_name}</strong> · </span>
                        )}
                        {new Date(log.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>

                      {log.note && (
                        <p
                          style={{
                            margin: "6px 0 0",
                            fontSize: 13,
                            color: "var(--ink)",
                            background: "var(--bg)",
                            padding: "6px 12px",
                            borderRadius: 6,
                            borderLeft: "3px solid var(--navy)",
                          }}
                        >
                          {log.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Tab: Moderation Queue ── */
          <>
            {/* KPI Metric Cards */}
            <div className="sp-kpi-grid">
              {/* Needs Review */}
              <button
                type="button"
                className={`sp-kpi-card${filterStatus === "pending" ? " sp-kpi-card--active" : ""}`}
                style={{ "--kpi-accent": "#f59e0b" } as React.CSSProperties}
                onClick={() => setFilterStatus(filterStatus === "pending" ? "all" : "pending")}
              >
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Needs Review</span>
                  <div className="sp-kpi-icon">
                    <Clock size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num" style={{ color: counts.pending > 0 ? "#b45309" : "var(--ink)" }}>
                  {counts.pending}
                </div>
                <div className="sp-kpi-sub">
                  {counts.pending > 0 ? "⚡ Action required" : "Queue caught up"}
                </div>
              </button>

              {/* Approved */}
              <button
                type="button"
                className={`sp-kpi-card${filterStatus === "approved" ? " sp-kpi-card--active" : ""}`}
                style={{ "--kpi-accent": "#10b981" } as React.CSSProperties}
                onClick={() => setFilterStatus(filterStatus === "approved" ? "all" : "approved")}
              >
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Approved</span>
                  <div className="sp-kpi-icon">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num" style={{ color: "#059669" }}>
                  {counts.approved}
                </div>
                <div className="sp-kpi-sub">Queued for next roadmap cycle</div>
              </button>

              {/* In Progress */}
              <button
                type="button"
                className={`sp-kpi-card${filterStatus === "in_progress" ? " sp-kpi-card--active" : ""}`}
                style={{ "--kpi-accent": "#3b82f6" } as React.CSSProperties}
                onClick={() => setFilterStatus(filterStatus === "in_progress" ? "all" : "in_progress")}
              >
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">In Progress</span>
                  <div className="sp-kpi-icon">
                    <GitPullRequestArrow size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num" style={{ color: "#2563eb" }}>
                  {counts.in_progress}
                </div>
                <div className="sp-kpi-sub">Live on public campus roadmap</div>
              </button>

              {/* Resolved */}
              <button
                type="button"
                className={`sp-kpi-card${filterStatus === "resolved" ? " sp-kpi-card--active" : ""}`}
                style={{ "--kpi-accent": "#8b5cf6" } as React.CSSProperties}
                onClick={() => setFilterStatus(filterStatus === "resolved" ? "all" : "resolved")}
              >
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Resolved</span>
                  <div className="sp-kpi-icon">
                    <CircleCheck size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num" style={{ color: "#7c3aed" }}>
                  {counts.resolved}
                </div>
                <div className="sp-kpi-sub">Delivered & closed successfully</div>
              </button>

              {/* Total Processed */}
              <button
                type="button"
                className={`sp-kpi-card${filterStatus === "all" ? " sp-kpi-card--active" : ""}`}
                style={{ "--kpi-accent": "var(--navy)" } as React.CSSProperties}
                onClick={() => setFilterStatus("all")}
              >
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Total Submissions</span>
                  <div className="sp-kpi-icon">
                    <Inbox size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num">{submissions.length}</div>
                <div className="sp-kpi-sub">{resolutionRate}% resolution rate</div>
              </button>
            </div>

            {/* Controls Card: Search, Filter Chips, Category & Sort */}
            <div className="sp-controls-card">
              <div className="sp-controls-row">
                {/* Search Box */}
                <div className="sp-search-box">
                  <Search size={15} className="sp-search-icon" />
                  <input
                    type="text"
                    className="sp-search-input"
                    placeholder="Search by title, description, or keyword..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      className="sp-search-clear"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                <select
                  className="sp-select"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  aria-label="Filter by department category"
                >
                  <option value="all">All Departments / Categories</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* Sort Dropdown */}
                <select
                  className="sp-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort queue"
                >
                  <option value="newest">Sort: Newest First</option>
                  <option value="votes">Sort: Highest Student Votes</option>
                  <option value="oldest">Sort: Oldest First</option>
                  <option value="title">Sort: Alphabetical (A-Z)</option>
                </select>
              </div>

              {/* Status Chips */}
              <div className="sp-status-chips">
                <button
                  type="button"
                  className={`sp-chip${filterStatus === "all" ? " sp-chip--active" : ""}`}
                  onClick={() => setFilterStatus("all")}
                >
                  <span>All Ideas</span>
                  <span className="sp-chip-count">({submissions.length})</span>
                </button>

                {ALL_STATUSES.map((status) => {
                  const count = counts[status] ?? 0;
                  const isActive = filterStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`sp-chip${isActive ? " sp-chip--active" : ""}`}
                      onClick={() => setFilterStatus(status)}
                    >
                      <span>{STATUS_LABELS[status]}</span>
                      <span className="sp-chip-count">({count})</span>
                    </button>
                  );
                })}

                {(filterStatus !== "all" || filterCategory !== "all" || search) && (
                  <button
                    type="button"
                    className="sp-bulk-clear"
                    onClick={() => {
                      setFilterStatus("all");
                      setFilterCategory("all");
                      setSearch("");
                    }}
                    style={{ marginLeft: "auto" }}
                  >
                    <RotateCcw size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    Reset filters
                  </button>
                )}
              </div>
            </div>

            {/* ── Submissions Queue List ── */}
            <div ref={listTopRef}>
              {/* Table Top Selector */}
              <div className="sp-table-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    className="sp-card-checkbox"
                    aria-label="Select visible ideas"
                    checked={
                      visibleSubmissions.length > 0 &&
                      visibleSubmissions.every((s) => selectedIds.has(s.id))
                    }
                    onChange={(e) => {
                      setAllPagesSelected(false);
                      setSelectedIds(
                        e.target.checked
                          ? new Set(visibleSubmissions.map((s) => s.id))
                          : new Set()
                      );
                    }}
                  />
                  <span>
                    Showing {visibleSubmissions.length} of {filteredSubmissions.length}
                  </span>
                  {selectedIds.size > 0 && (
                    <span style={{ color: "var(--navy)", fontWeight: 700 }}>
                      · {selectedIds.size} selected
                    </span>
                  )}
                </div>

                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Click row to inspect details &amp; timeline
                </span>
              </div>

              {/* Select-All-Pages Banner */}
              {selectedIds.size === visibleSubmissions.length &&
                visibleSubmissions.length > 0 &&
                hasMoreItems && (
                  <div className="sp-select-all-banner">
                    {allPagesSelected ? (
                      <>
                        All <strong>{filteredSubmissions.length}</strong> items selected.{" "}
                        <button
                          type="button"
                          className="sp-select-all-btn"
                          onClick={() => {
                            setAllPagesSelected(false);
                            setSelectedIds(new Set());
                          }}
                        >
                          Clear selection
                        </button>
                      </>
                    ) : (
                      <>
                        All <strong>{visibleSubmissions.length}</strong> visible items selected.{" "}
                        <button
                          type="button"
                          className="sp-select-all-btn"
                          onClick={() => {
                            setAllPagesSelected(true);
                            setSelectedIds(new Set(filteredSubmissions.map((s) => s.id)));
                          }}
                        >
                          Select all {filteredSubmissions.length} items
                        </button>
                      </>
                    )}
                  </div>
                )}

              {/* Items List */}
              <div className="sp-list">
                {filteredSubmissions.length === 0 ? (
                  <div
                    style={{
                      padding: "60px 20px",
                      textAlign: "center",
                      color: "var(--muted)",
                      background: "var(--surface)",
                    }}
                  >
                    <Inbox size={40} style={{ color: "var(--muted-2)", margin: "0 auto 12px" }} />
                    <h3 style={{ fontSize: 18, color: "var(--ink)", margin: 0 }}>No submissions found</h3>
                    <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                      Try adjusting your search terms or clearing status filters.
                    </p>
                  </div>
                ) : (
                  visibleSubmissions.map((item) => {
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <article
                        key={item.id}
                        className={`sp-card${isSelected ? " sp-card--selected" : ""}`}
                        onClick={() => openIdeaModal(item)}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          className="sp-card-checkbox"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${item.title}`}
                        />

                        {/* Votes Indicator */}
                        <div className="sp-card-votes" title={`${item.vote_count || 0} student votes`}>
                          <ThumbsUp size={13} strokeWidth={2.5} />
                          <span>{item.vote_count || 0}</span>
                        </div>

                        {/* Body */}
                        <div className="sp-card-body">
                          <div className="sp-card-title-row">
                            <h2 className="sp-card-title">{item.title}</h2>
                          </div>

                          <p className="sp-card-desc">{item.description}</p>

                          <div className="sp-card-meta">
                            {/* Status badge */}
                            <span className={`status-badge ${item.status.replace("_", "-")}`}>
                              {STATUS_LABELS[item.status]}
                            </span>

                            {/* Category tag */}
                            <span className="sp-meta-pill">
                              <Tag size={10} />
                              {item.categories?.name ?? "Other"}
                            </span>

                            {/* Attachments */}
                            {(item.attachments?.length ?? 0) > 0 && (
                              <span className="sp-meta-pill" title={`${item.attachments.length} attached files`}>
                                <Paperclip size={10} />
                                {item.attachments.length}
                              </span>
                            )}

                            {/* Date */}
                            <span className="sp-card-date">
                              Submitted{" "}
                              {new Date(item.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Quick Inline Actions */}
                        <div className="sp-quick-actions" onClick={(e) => e.stopPropagation()}>
                          {item.status !== "approved" && (
                            <button
                              type="button"
                              className="sp-action-icon-btn sp-action-icon-btn--approve"
                              title="Quick Approve"
                              onClick={() => changeStatus(item.id, "approved")}
                            >
                              <Check size={14} strokeWidth={2.5} />
                            </button>
                          )}

                          {item.status !== "rejected" && (
                            <button
                              type="button"
                              className="sp-action-icon-btn sp-action-icon-btn--reject"
                              title="Quick Reject"
                              onClick={() => changeStatus(item.id, "rejected")}
                            >
                              <X size={14} strokeWidth={2.5} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="sp-action-icon-btn sp-action-icon-btn--inspect"
                            title="Open detailed view"
                            onClick={() => openIdeaModal(item)}
                          >
                            <ChevronRight size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}

                {/* Skeleton rows while loading more */}
                {busy && submissions.length === 0 &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="sp-skeleton-row">
                      <div className="sp-skeleton-pill" style={{ width: 17, height: 17, borderRadius: 3 }} />
                      <div className="sp-skeleton-pill" style={{ width: 44, height: 44, borderRadius: 8 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="sp-skeleton-pill" style={{ width: "60%", height: 13 }} />
                        <div className="sp-skeleton-pill" style={{ width: "85%", height: 11 }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <div className="sp-skeleton-pill" style={{ width: 64, height: 20, borderRadius: 10 }} />
                          <div className="sp-skeleton-pill" style={{ width: 72, height: 20, borderRadius: 10 }} />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Lazy load footer */}
              {filteredSubmissions.length > 0 && (
                <div className="sp-lazy-footer">
                  <div className="sp-lazy-info">
                    <span>
                      Showing <strong>{visibleSubmissions.length}</strong> of{" "}
                      <strong>{filteredSubmissions.length}</strong> submissions
                    </span>
                    <div className="sp-lazy-progress">
                      <div className="sp-lazy-track">
                        <div
                          className="sp-lazy-fill"
                          style={{
                            width: `${Math.round((visibleSubmissions.length / filteredSubmissions.length) * 100)}%`,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                        {Math.round((visibleSubmissions.length / filteredSubmissions.length) * 100)}%
                      </span>
                    </div>
                    {visibleSubmissions.length > PAGE_SIZE && (
                      <button
                        type="button"
                        className="sp-back-to-top"
                        onClick={() =>
                          listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        <ChevronsUp size={13} />
                        Top
                      </button>
                    )}
                  </div>

                  {hasMoreItems && (
                    <button
                      type="button"
                      className="sp-lazy-load-btn"
                      onClick={loadMore}
                    >
                      <RefreshCw size={13} />
                      Load {Math.min(PAGE_SIZE, filteredSubmissions.length - visibleCount)} more
                    </button>
                  )}

                  {/* Invisible sentinel triggers auto-load on scroll */}
                  <div ref={sentinelRef} className="sp-lazy-sentinel" aria-hidden="true" />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Floating Bulk Action Bar ── */}
        {selectedIds.size > 0 && (
          <div className="sp-bulk-bar" role="toolbar" aria-label="Bulk Moderation Actions">
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)", paddingRight: 4 }}>
              {selectedIds.size} Selected
            </span>

            <button
              type="button"
              className="sp-bulk-btn sp-bulk-btn--approve"
              disabled={bulkBusy}
              onClick={() => bulkChangeStatus("approved")}
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Approve All</span>
            </button>

            <button
              type="button"
              className="sp-bulk-btn sp-bulk-btn--progress"
              disabled={bulkBusy}
              onClick={() => bulkChangeStatus("in_progress")}
            >
              <GitPullRequestArrow size={14} strokeWidth={2.5} />
              <span>Set In Progress</span>
            </button>

            <button
              type="button"
              className="sp-bulk-btn sp-bulk-btn--reject"
              disabled={bulkBusy}
              onClick={() => bulkChangeStatus("rejected")}
            >
              <X size={14} strokeWidth={2.5} />
              <span>Reject All</span>
            </button>

            <button
              type="button"
              className="sp-bulk-clear"
              onClick={() => setSelectedIds(new Set())}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Detailed Inspector Drawer ── */}
        {viewIdea && (
          <div
            className="rm-drawer-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeIdeaModal();
            }}
          >
            <aside
              className="rm-drawer"
              style={{ width: 560 }}
              role="dialog"
              aria-modal="true"
              aria-label="Idea Moderation Inspector"
            >
              {/* Header */}
              <div className="rm-drawer-head">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`status-badge ${viewIdea.status.replace("_", "-")}`}>
                    {STATUS_LABELS[viewIdea.status]}
                  </span>
                  <span className="sp-meta-pill">
                    <Tag size={10} />
                    {viewIdea.categories?.name ?? "Other"}
                  </span>
                </div>

                <button
                  type="button"
                  className="rm-drawer-close"
                  onClick={closeIdeaModal}
                  aria-label="Close inspector"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="rm-drawer-body">
                {/* Title & Metadata */}
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)", margin: 0 }}>
                    {viewIdea.title}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Submitted on{" "}
                      {new Date(viewIdea.created_at).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>·</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--navy)",
                      }}
                    >
                      <ThumbsUp size={12} />
                      {viewIdea.vote_count || 0} student votes
                    </span>
                  </div>
                </div>

                {/* Status Stepper Pipeline */}
                <div>
                  <label className="rm-drawer-field-label" style={{ display: "block", marginBottom: 4 }}>
                    Lifecycle Stage
                  </label>
                  <div className="sp-stepper">
                    {[
                      { key: "pending", label: "Pending" },
                      { key: "approved", label: "Approved" },
                      { key: "in_progress", label: "Active" },
                      { key: "resolved", label: "Resolved" },
                    ].map((step, idx) => {
                      const statusOrder = ["pending", "approved", "in_progress", "resolved"];
                      const currentIdx = statusOrder.indexOf(viewIdea.status);
                      const isCompleted = currentIdx >= idx && viewIdea.status !== "rejected";
                      const isCurrent = viewIdea.status === step.key;

                      return (
                        <div
                          key={step.key}
                          className={`sp-step${isCompleted ? " sp-step--completed" : ""}${
                            isCurrent ? " sp-step--current" : ""
                          }`}
                        >
                          <span className="sp-step-dot">
                            {isCompleted ? "✓" : idx + 1}
                          </span>
                          <span className="sp-step-label">{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full Description */}
                <div>
                  <div className="rm-drawer-desc-label">Student Submission</div>
                  <div className="rm-drawer-desc">{viewIdea.description}</div>
                </div>

                {/* Attachments Section */}
                {adminAttachments.length > 0 && (
                  <div>
                    <div className="rm-drawer-desc-label" style={{ marginBottom: 8 }}>
                      Attached Files ({adminAttachments.length})
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {adminAttachments.map((file) => {
                        const isImg = file.mime_type.startsWith("image/");
                        return isImg ? (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => setAdminLightbox(file.url)}
                            style={{
                              width: 84,
                              height: 84,
                              borderRadius: 8,
                              overflow: "hidden",
                              border: "1px solid var(--line-2)",
                              padding: 0,
                              cursor: "pointer",
                              background: "none",
                            }}
                            title={file.name}
                          >
                            <img
                              src={file.url || ""}
                              alt={file.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </button>
                        ) : (
                          <a
                            key={file.id}
                            href={file.url ?? "#"}
                            download
                            className="sp-btn-action"
                            style={{ textDecoration: "none" }}
                          >
                            <Paperclip size={13} />
                            <span>{file.name}</span>
                            <ExternalLink size={11} style={{ opacity: 0.5 }} />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Moderation Controls */}
                <div
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <h3 style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>
                    Moderation Decision & Feedback
                  </h3>

                  {/* Canned Responses */}
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                      Quick Templates
                    </span>
                    <div className="sp-canned-chips">
                      {CANNED_RESPONSES.map((txt) => (
                        <button
                          key={txt}
                          type="button"
                          className="sp-canned-chip"
                          onClick={() =>
                            setNotes((n) => ({
                              ...n,
                              [viewIdea.id]: txt,
                            }))
                          }
                        >
                          {txt.slice(0, 30)}...
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    className="sp-search-input"
                    style={{
                      height: 70,
                      padding: "8px 12px",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                    placeholder="Provide a public status update or internal note..."
                    value={notes[viewIdea.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({
                        ...n,
                        [viewIdea.id]: e.target.value,
                      }))
                    }
                  />

                  {/* Decision Action Buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="sp-bulk-btn sp-bulk-btn--approve"
                      style={{ justifyContent: "center" }}
                      disabled={busy || viewIdea.status === "approved"}
                      onClick={() => changeStatus(viewIdea.id, "approved")}
                    >
                      <CheckCircle2 size={15} />
                      <span>Approve</span>
                    </button>

                    <button
                      type="button"
                      className="sp-bulk-btn sp-bulk-btn--progress"
                      style={{ justifyContent: "center" }}
                      disabled={busy || viewIdea.status === "in_progress"}
                      onClick={() => changeStatus(viewIdea.id, "in_progress")}
                    >
                      <GitPullRequestArrow size={15} />
                      <span>Start Progress</span>
                    </button>

                    <button
                      type="button"
                      className="sp-bulk-btn"
                      style={{
                        background: "#8b5cf6",
                        color: "white",
                        justifyContent: "center",
                      }}
                      disabled={busy || viewIdea.status === "resolved"}
                      onClick={() => changeStatus(viewIdea.id, "resolved")}
                    >
                      <CircleCheck size={15} />
                      <span>Mark Resolved</span>
                    </button>

                    <button
                      type="button"
                      className="sp-bulk-btn sp-bulk-btn--reject"
                      style={{ justifyContent: "center" }}
                      disabled={busy || viewIdea.status === "rejected"}
                      onClick={() => changeStatus(viewIdea.id, "rejected")}
                    >
                      <XCircle size={15} />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>

                {/* Status History Timeline */}
                <div>
                  <div className="rm-drawer-desc-label" style={{ marginBottom: 12 }}>
                    Audit History for this Idea
                  </div>
                  {historyLoading ? (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading history...</div>
                  ) : statusHistory.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>No status transitions recorded yet.</div>
                  ) : (
                    <div className="rm-history-list">
                      {statusHistory.map((h, i) => (
                        <div key={h.id || i} className="rm-history-item">
                          <span
                            className="rm-history-dot"
                            style={{
                              background:
                                h.new_status === "approved"
                                  ? "#10b981"
                                  : h.new_status === "rejected"
                                  ? "#ef4444"
                                  : h.new_status === "in_progress"
                                  ? "#3b82f6"
                                  : "#8b5cf6",
                            }}
                          />
                          <div>
                            <div className="rm-history-text">
                              <strong>{STATUS_LABELS[h.new_status]}</strong>
                              {h.old_status && ` from ${STATUS_LABELS[h.old_status]}`}
                            </div>
                            <div className="rm-history-time">
                              {h.profiles?.display_name && `${h.profiles.display_name} · `}
                              {new Date(h.created_at).toLocaleString()}
                            </div>
                            {h.note && (
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  fontSize: 12.5,
                                  color: "var(--ink)",
                                  background: "var(--bg)",
                                  padding: "6px 10px",
                                  borderRadius: 6,
                                }}
                              >
                                {h.note}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="rm-drawer-footer">
                <Link
                  href={`/idea/${viewIdea.id}`}
                  className="rm-drawer-link-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>View Public Community Page</span>
                  <ExternalLink size={13} />
                </Link>

                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setViewIdea(null)}
                >
                  Done
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* ── Image Lightbox ── */}
        {adminLightbox && (
          <div
            onClick={() => setAdminLightbox(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.9)",
              zIndex: 1500,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setAdminLightbox(null)}
              aria-label="Close image"
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                background: "rgba(255, 255, 255, 0.15)",
                border: "none",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "white",
              }}
            >
              <X size={20} strokeWidth={2.5} />
            </button>
            <img
              src={adminLightbox}
              alt="Attachment full view"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "92vw",
                maxHeight: "90vh",
                borderRadius: 12,
                boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
              }}
            />
          </div>
        )}
      </main>
    </>
  );
}
