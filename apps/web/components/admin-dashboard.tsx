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
  User,
  Trash2,
  Save,
  AlertTriangle,
  KeyRound,
  BadgeCheck,
  Users2,
  UserPlus,
  Crown,
  UserX,
  UserCheck,
  SendHorizonal,
  ChevronDown,
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

  // Active view tab: 'queue' | 'flagged' | 'audit' | 'analytics' | 'profile' | 'staff'
  const [activeTab, setActiveTab] = useState<"queue" | "flagged" | "audit" | "analytics" | "profile" | "staff">(
    defaultViewMode === "analytics" ? "analytics" : "queue"
  );

  // Submissions data (moderation queue — filtered by filterStatus)
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);

  // Analytics data — always all statuses, loaded independently
  const [analyticsSubmissions, setAnalyticsSubmissions] = useState<Submission[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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
  const [dbCounts, setDbCounts] = useState<Record<Status | "all", number>>({
    all: 0,
    pending: 0,
    approved: 0,
    in_progress: 0,
    resolved: 0,
    rejected: 0,
  });

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

  // Profile / Account settings state
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileNewEmail, setProfileNewEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profileShowPassword, setProfileShowPassword] = useState(false);
  const [profileShowConfirm, setProfileShowConfirm] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [profileJoinedAt, setProfileJoinedAt] = useState<string | null>(null);

  // Header Profile Dropdown state
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const adminDisplayName =
    profileDisplayName ||
    authSession?.user?.user_metadata?.full_name ||
    authSession?.user?.email?.split("@")[0] ||
    "Staff";
  const adminEmail = profileEmail || authSession?.user?.email || "";
  const adminInitial = adminDisplayName[0]?.toUpperCase() || "S";
  const adminAvatarUrl = authSession?.user?.user_metadata?.avatar_url;

  // Hydrate profile data when authSession is available
  useEffect(() => {
    if (authSession?.user) {
      setProfileEmail(authSession.user.email ?? "");
      setProfileJoinedAt(authSession.user.created_at ?? null);
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", authSession.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.display_name) setProfileDisplayName(data.display_name);
        });
    }
  }, [authSession?.user]);

  // Click outside listener for profile dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    if (profileDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileDropdownOpen]);

  // Handler to switch to profile tab and refresh profile info
  const openProfileView = useCallback(() => {
    setActiveTab("profile");
    setProfileDropdownOpen(false);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setProfileEmail(session.user.email ?? "");
        setProfileJoinedAt(session.user.created_at ?? null);
      }
    });
    if (authSession?.user?.id) {
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", authSession.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.display_name) setProfileDisplayName(data.display_name);
        });
    }
  }, [authSession?.user?.id]);

  // Staff Management state
  type StaffMember = { id: string; display_name: string | null; role: string; created_at: string; email?: string | null };
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffRoleChanging, setStaffRoleChanging] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"moderator" | "admin">("moderator");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [promoteSearch, setPromoteSearch] = useState("");
  const [promoteResults, setPromoteResults] = useState<StaffMember[]>([]);
  const [promoteSearchBusy, setPromoteSearchBusy] = useState(false);
  const [staffRoleFilter, setStaffRoleFilter] = useState<"all" | "admin" | "moderator">("all");

  const filteredStaff = useMemo(() => {
    return staffMembers.filter((s) => {
      if (staffRoleFilter !== "all" && s.role !== staffRoleFilter) return false;
      if (staffSearch) {
        const q = staffSearch.toLowerCase();
        const matchName = (s.display_name ?? "").toLowerCase().includes(q);
        const matchEmail = (s.email ?? "").toLowerCase().includes(q);
        if (!matchName && !matchEmail) return false;
      }
      return true;
    });
  }, [staffMembers, staffRoleFilter, staffSearch]);

  // Load staff roster (moderators and admins) with email
  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,email,role,created_at")
        .in("role", ["admin", "moderator"])
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load staff members:", error);
        // Fallback: query without .in filter if enum issue
        const fallback = await supabase
          .from("profiles")
          .select("id,display_name,email,role,created_at")
          .neq("role", "student")
          .order("created_at", { ascending: true });
        if (fallback.data) {
          setStaffMembers(fallback.data as StaffMember[]);
        }
      } else if (data) {
        setStaffMembers(data as StaffMember[]);
      }
    } catch (err) {
      console.error("Error in loadStaff:", err);
    } finally {
      setStaffLoading(false);
    }
  }, []);

  // Load registered students for promotion panel based on email / gmail
  const loadStudents = useCallback(async (query = "") => {
    setPromoteSearchBusy(true);
    try {
      const trimmed = query.trim();
      // Try security-definer RPC first
      const { data: rpcData, error: rpcError } = await supabase.rpc("admin_search_students", {
        search_email: trimmed,
        result_limit: 30,
      });

      if (!rpcError && Array.isArray(rpcData)) {
        setPromoteResults(rpcData as StaffMember[]);
      } else {
        // Fallback to direct profiles query
        let q = supabase
          .from("profiles")
          .select("id,display_name,email,role,created_at")
          .eq("role", "student")
          .order("created_at", { ascending: false })
          .limit(30);

        if (trimmed) {
          q = q.or(`email.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`);
        }

        const { data, error } = await q;
        if (error) {
          console.error("Failed to fetch students:", error);
        } else {
          setPromoteResults((data ?? []) as StaffMember[]);
        }
      }
    } catch (err) {
      console.error("Error in loadStudents:", err);
    } finally {
      setPromoteSearchBusy(false);
    }
  }, []);

  // Automatically fetch staff and students when Staff tab is active
  useEffect(() => {
    if (activeTab === "staff") {
      loadStaff();
      loadStudents(promoteSearch);
    }
  }, [activeTab, loadStaff, loadStudents]);

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

  // Load real-time database counts for KPI cards and status chips
  const loadCounts = useCallback(async () => {
    try {
      const [totalRes, pendingRes, approvedRes, inProgressRes, resolvedRes, rejectedRes] = await Promise.all([
        supabase.from("submissions").select("*", { count: "exact", head: true }),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("status", "resolved"),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("status", "rejected"),
      ]);
      setDbCounts({
        all: totalRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        in_progress: inProgressRes.count ?? 0,
        resolved: resolvedRes.count ?? 0,
        rejected: rejectedRes.count ?? 0,
      });
    } catch (e) {
      console.error("Failed to load counts", e);
    }
  }, []);

  // Load ALL Submissions via batched requests (500/batch) to bypass PostgREST row limit
  const loadSubmissions = useCallback(
    async (statusOverride?: Status | "all" | boolean, _forceRefresh?: boolean) => {
      setBusy(true);
      loadCounts();
      const effectiveStatus = typeof statusOverride === "string" ? statusOverride : filterStatus;
      const BATCH = 500;
      try {
        const allRows: Submission[] = [];
        let offset = 0;
        let keepFetching = true;

        while (keepFetching) {
          let query = supabase
            .from("submissions")
            .select("id,title,description,status,created_at,user_id,category_id,categories(name),vote_count,attachments(id),author:profiles!submissions_user_id_fkey(display_name)")
            .order("created_at", { ascending: false })
            .range(offset, offset + BATCH - 1);

          if (effectiveStatus !== "all") {
            query = query.eq("status", effectiveStatus);
          }

          const { data, error } = await query;

          if (error) {
            console.error("Admin query error:", error);
            toast(`Unable to load submissions: ${error.message}`, "error");
            keepFetching = false;
            break;
          }

          const batch = (data ?? []) as unknown as Submission[];
          allRows.push(...batch);

          if (batch.length < BATCH) {
            // Fetched less than a full batch — we're done
            keepFetching = false;
          } else {
            offset += BATCH;
          }

          // Update UI progressively so admin sees rows load in
          setSubmissions([...allRows]);
        }
      } catch (err) {
        console.error("Admin load exception:", err);
      } finally {
        setBusy(false);
      }
    },
    [filterStatus, loadCounts]
  );

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
          if (resolvedRole === "admin") {
            loadStaff();
          }
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
              if (r === "admin") {
                loadStaff();
              }
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

  // Load ALL submissions for analytics (ignores status filter — always fetches every status)
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const BATCH = 500;
    try {
      const allRows: Submission[] = [];
      let offset = 0;
      let keepFetching = true;

      while (keepFetching) {
        const { data, error } = await supabase
          .from("submissions")
          .select("id,title,description,status,created_at,user_id,category_id,categories(name),vote_count,attachments(id),author:profiles!submissions_user_id_fkey(display_name)")
          .order("created_at", { ascending: false })
          .range(offset, offset + BATCH - 1);

        if (error) {
          console.error("Analytics query error:", error);
          break;
        }

        const batch = (data ?? []) as unknown as Submission[];
        allRows.push(...batch);

        if (batch.length < BATCH) {
          keepFetching = false;
        } else {
          offset += BATCH;
        }

        setAnalyticsSubmissions([...allRows]);
      }
    } catch (err) {
      console.error("Analytics load exception:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Fetch contextual tab data
  useEffect(() => {
    if (!accessToken) return;
    if (activeTab === "flagged") loadFlaggedComments();
    if (activeTab === "audit") loadAuditLog();
    if (activeTab === "analytics" && analyticsSubmissions.length === 0) loadAnalytics();
  }, [activeTab, accessToken, loadAnalytics]);

  // Re-fetch submissions with server-side status filter when filterStatus changes
  useEffect(() => {
    if (userRole === "moderator" || userRole === "admin") {
      loadSubmissions(filterStatus);
    }
  }, [filterStatus, userRole, loadSubmissions]);

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

  // Metrics computation from live database counters
  const counts = useMemo(() => {
    return {
      all: dbCounts.all || submissions.length,
      pending: dbCounts.pending,
      approved: dbCounts.approved,
      in_progress: dbCounts.in_progress,
      resolved: dbCounts.resolved,
      rejected: dbCounts.rejected,
    };
  }, [dbCounts, submissions.length]);

  const resolutionRate = useMemo(() => {
    const total = dbCounts.all || submissions.length;
    if (total === 0) return 0;
    const resolvedCount = counts.resolved || 0;
    return Math.round((resolvedCount / total) * 100);
  }, [dbCounts.all, submissions.length, counts.resolved]);

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
          {/* Staff Profile in Header */}
          <div style={{ position: "relative" }} ref={profileDropdownRef}>
            <button
              type="button"
              className={`avatar-chip ${activeTab === "profile" ? "avatar-chip--active" : ""}`}
              onClick={() => setProfileDropdownOpen((v) => !v)}
              aria-expanded={profileDropdownOpen}
              aria-label="Staff profile menu"
              title="Staff Profile & Settings"
              style={{
                cursor: "pointer",
                background: activeTab === "profile" ? "var(--bg)" : "var(--surface)",
                borderColor: activeTab === "profile" ? "var(--navy)" : "var(--line-2)",
              }}
            >
              <div
                className="avatar-circle"
                style={{
                  background:
                    userRole === "admin"
                      ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
                      : "linear-gradient(135deg, #0b3857 0%, #2563eb 100%)",
                }}
              >
                {adminAvatarUrl ? (
                  <img
                    src={adminAvatarUrl}
                    alt={adminInitial}
                    style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  adminInitial
                )}
              </div>
              <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {adminDisplayName}
              </span>
              <ChevronDown
                size={13}
                color="var(--muted)"
                style={{
                  transform: profileDropdownOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                  flexShrink: 0,
                }}
              />
            </button>

            {profileDropdownOpen && (
              <div
                className="dropdown-menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  minWidth: 230,
                  zIndex: 300,
                }}
              >
                <div className="dropdown-user-header">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div className="dropdown-user-name" style={{ fontSize: 13.5 }}>
                      {adminDisplayName}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 6,
                        background: userRole === "admin" ? "rgba(234, 88, 12, 0.12)" : "rgba(11, 56, 87, 0.12)",
                        color: userRole === "admin" ? "#ea580c" : "var(--navy)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        flexShrink: 0,
                      }}
                    >
                      {userRole === "admin" ? <Crown size={10} /> : <ShieldCheck size={10} />}
                      {userRole === "admin" ? "Admin" : "Moderator"}
                    </span>
                  </div>
                  {adminEmail && (
                    <div className="dropdown-user-email" style={{ fontSize: 11.5 }}>
                      {adminEmail}
                    </div>
                  )}
                </div>

                <div className="divider" style={{ margin: "4px 0" }} />

                <button
                  type="button"
                  onClick={openProfileView}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    padding: "9px 14px",
                    background: activeTab === "profile" ? "var(--bg)" : "transparent",
                    color: activeTab === "profile" ? "var(--accent)" : "var(--ink)",
                    fontWeight: activeTab === "profile" ? 600 : 500,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                  }}
                >
                  <User size={14} color={activeTab === "profile" ? "var(--accent)" : "currentColor"} />
                  <span>Profile & Settings</span>
                </button>

                {userRole === "admin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("staff");
                      setProfileDropdownOpen(false);
                      loadStaff();
                      loadStudents(promoteSearch);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      width: "100%",
                      padding: "9px 14px",
                      background: activeTab === "staff" ? "var(--bg)" : "transparent",
                      color: activeTab === "staff" ? "var(--accent)" : "var(--ink)",
                      fontWeight: activeTab === "staff" ? 600 : 500,
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                    }}
                  >
                    <Crown size={14} color={activeTab === "staff" ? "var(--accent)" : "currentColor"} />
                    <span>Staff Management</span>
                  </button>
                )}

                <div className="divider" style={{ margin: "4px 0" }} />

                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    setProfileDropdownOpen(false);
                    await signOut();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    padding: "9px 14px",
                    color: "var(--danger, #dc2626)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                  }}
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
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
              {activeTab === "profile" && "My Account & Profile"}
              {activeTab === "staff" && "Staff & Access Management"}
            </h1>
            <p className="sp-subtitle">
              {activeTab === "queue" && "Review, triage, and route community ideas into campus delivery."}
              {activeTab === "flagged" && "Inspect comments reported by students or auto-hidden for review."}
              {activeTab === "audit" && "Recent status changes and administrative notes logged across the campus."}
              {activeTab === "analytics" && "High-level metrics and submission trends."}
              {activeTab === "profile" && "Edit your display name, email, password, and account settings."}
              {activeTab === "staff" && "Promote users to staff, manage roles, and invite new team members."}
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

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "profile"}
                className={`sp-nav-tab${activeTab === "profile" ? " sp-nav-tab--active" : ""}`}
                onClick={openProfileView}
              >
                <User size={14} />
                <span>Profile</span>
              </button>

              {/* Staff Management — admins only */}
              {userRole === "admin" && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "staff"}
                  className={`sp-nav-tab${activeTab === "staff" ? " sp-nav-tab--active" : ""}`}
                  onClick={() => {
                    setActiveTab("staff");
                    loadStaff();
                    loadStudents(promoteSearch);
                  }}
                >
                  <Users2 size={14} />
                  <span>Staff</span>
                  {staffMembers.length > 0 && (
                    <span className="sp-tab-badge">{staffMembers.length}</span>
                  )}
                </button>
              )}
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              className="sp-btn-action"
              onClick={() => {
                loadSubmissions(filterStatus, true);
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

        {/* ── Tab: Analytics View ── */}
        {activeTab === "analytics" ? (
          <AnalyticsDashboard
            submissions={analyticsSubmissions}
            isLoading={analyticsLoading && analyticsSubmissions.length === 0}
            onRefresh={loadAnalytics}
          />
        ) : activeTab === "profile" ? (
          /* ── Tab: Profile & Account Settings (Refactored) ── */
          <div className="sp-profile-layout">
            {/* Left: Staff Overview Card */}
            <div className="sp-profile-sidebar">
              <div className="sp-profile-card">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 20 }}>
                  <div
                    style={{
                      position: "relative",
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background:
                        userRole === "admin"
                          ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
                          : "linear-gradient(135deg, #0b3857 0%, #2563eb 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 26,
                      fontWeight: 800,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      marginBottom: 14,
                    }}
                  >
                    {adminAvatarUrl ? (
                      <img
                        src={adminAvatarUrl}
                        alt={adminInitial}
                        style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      adminInitial
                    )}
                    <span
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: userRole === "admin" ? "#ea580c" : "var(--navy)",
                        border: "2px solid var(--surface)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                      }}
                    >
                      {userRole === "admin" ? <Crown size={12} /> : <ShieldCheck size={12} />}
                    </span>
                  </div>

                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)", margin: "0 0 4px 0" }}>
                    {adminDisplayName}
                  </h2>
                  <div style={{ fontSize: 13, color: "var(--muted)", wordBreak: "break-all" }}>
                    {adminEmail}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                    <span className={userRole === "admin" ? "sp-role-badge-admin" : "sp-role-badge-mod"}>
                      {userRole === "admin" ? <Crown size={12} /> : <ShieldCheck size={12} />}
                      <span>{userRole === "admin" ? "Administrator" : "Moderator"}</span>
                    </span>
                  </div>
                </div>

                <div className="divider" style={{ margin: "16px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--muted)" }}>Status</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#10b981", fontWeight: 700 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
                      Active Staff
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--muted)" }}>Permissions</span>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {userRole === "admin" ? "Full Governance" : "Moderation & Triage"}
                    </span>
                  </div>
                  {profileJoinedAt && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--muted)" }}>Joined Campus</span>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                        {new Date(profileJoinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </span>
                    </div>
                  )}
                  {authSession?.user?.id && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--muted)" }}>Staff ID</span>
                      <code style={{ fontSize: 11, background: "var(--bg)", padding: "2px 6px", borderRadius: 4, color: "var(--ink-2)" }}>
                        {authSession.user.id.slice(0, 8)}…
                      </code>
                    </div>
                  )}
                </div>

                <div className="divider" style={{ margin: "16px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a
                    href="/"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line)",
                      background: "var(--bg)",
                      color: "var(--ink)",
                      textDecoration: "none",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={13} />
                    <span>View Public Campus Site</span>
                  </a>
                  <a
                    href="/profile"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line)",
                      background: "var(--bg)",
                      color: "var(--ink)",
                      textDecoration: "none",
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    <User size={13} />
                    <span>View Public Profile</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Right: Settings Sections */}
            <div className="sp-profile-main">
              {/* Profile Details */}
              <div className="sp-section-card">
                <div className="sp-section-header">
                  <div className="sp-section-title-wrap">
                    <h3>
                      <User size={17} style={{ color: "var(--navy)" }} />
                      <span>Account Information</span>
                    </h3>
                    <p className="sp-section-subtitle">
                      Your staff display name is visible on moderation actions, status changes, and staff audit logs.
                    </p>
                  </div>
                </div>

                <div className="sp-form-row">
                  <label className="sp-form-label">
                    <span>Display Name</span>
                  </label>
                  <div className="sp-form-input-group">
                    <div className="sp-input-with-icon">
                      <div className="sp-input-icon">
                        <User size={15} />
                      </div>
                      <input
                        type="text"
                        value={profileDisplayName}
                        onChange={(e) => setProfileDisplayName(e.target.value)}
                        placeholder="Enter your full name"
                        maxLength={80}
                      />
                    </div>
                    <button
                      type="button"
                      className="sp-btn-inline"
                      disabled={profileBusy || !profileDisplayName.trim()}
                      onClick={async () => {
                        if (!authSession?.user?.id) return;
                        setProfileBusy(true);
                        try {
                          const { error } = await supabase
                            .from("profiles")
                            .update({ display_name: profileDisplayName.trim() })
                            .eq("id", authSession.user.id);
                          if (error) throw error;
                          toast("Display name saved.", "success");
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Failed to update name.", "error");
                        } finally {
                          setProfileBusy(false);
                        }
                      }}
                    >
                      <Save size={14} />
                      <span>Save Name</span>
                    </button>
                  </div>
                </div>

                <div className="divider" style={{ margin: "20px 0" }} />

                <div className="sp-form-row">
                  <label className="sp-form-label">
                    <span>Email Address</span>
                  </label>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
                    Current email: <strong style={{ color: "var(--ink)" }}>{profileEmail || "No email on file"}</strong>
                  </div>
                  <div className="sp-form-input-group">
                    <div className="sp-input-with-icon">
                      <div className="sp-input-icon">
                        <Mail size={15} />
                      </div>
                      <input
                        type="email"
                        value={profileNewEmail}
                        onChange={(e) => setProfileNewEmail(e.target.value)}
                        placeholder="Enter new email address"
                      />
                    </div>
                    <button
                      type="button"
                      className="sp-btn-inline"
                      disabled={profileBusy || !profileNewEmail.trim() || profileNewEmail === profileEmail}
                      onClick={async () => {
                        setProfileBusy(true);
                        try {
                          const { error } = await supabase.auth.updateUser({ email: profileNewEmail.trim() });
                          if (error) throw error;
                          toast("Confirmation link sent to new email address.", "success");
                          setProfileNewEmail("");
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Failed to update email.", "error");
                        } finally {
                          setProfileBusy(false);
                        }
                      }}
                    >
                      <Mail size={14} />
                      <span>Update Email</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Password & Security */}
              <div className="sp-section-card">
                <div className="sp-section-header">
                  <div className="sp-section-title-wrap">
                    <h3>
                      <KeyRound size={17} style={{ color: "var(--accent)" }} />
                      <span>Password & Security</span>
                    </h3>
                    <p className="sp-section-subtitle">
                      Change your staff account password. Passwords must be at least 8 characters long.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="sp-form-row">
                    <label className="sp-form-label">
                      <span>New Password</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <div className="sp-input-with-icon">
                        <div className="sp-input-icon">
                          <Lock size={15} />
                        </div>
                        <input
                          type={profileShowPassword ? "text" : "password"}
                          value={profilePassword}
                          onChange={(e) => setProfilePassword(e.target.value)}
                          placeholder="Min 8 characters"
                          style={{ paddingRight: 42 }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfileShowPassword((v) => !v)}
                        aria-label={profileShowPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          padding: 4,
                        }}
                      >
                        {profileShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="sp-form-row">
                    <label className="sp-form-label">
                      <span>Confirm New Password</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <div className="sp-input-with-icon">
                        <div className="sp-input-icon">
                          <Lock size={15} />
                        </div>
                        <input
                          type={profileShowConfirm ? "text" : "password"}
                          value={profileConfirmPassword}
                          onChange={(e) => setProfileConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          style={{ paddingRight: 42 }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfileShowConfirm((v) => !v)}
                        aria-label={profileShowConfirm ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          padding: 4,
                        }}
                      >
                        {profileShowConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {profilePassword && profileConfirmPassword && profilePassword !== profileConfirmPassword && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#dc2626" }}>
                      <AlertTriangle size={14} />
                      <span>Passwords do not match.</span>
                    </div>
                  )}

                  <div style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="sp-btn-inline"
                      disabled={
                        profileBusy ||
                        profilePassword.length < 8 ||
                        profilePassword !== profileConfirmPassword
                      }
                      style={{ padding: "0 22px" }}
                      onClick={async () => {
                        setProfileBusy(true);
                        try {
                          const { error } = await supabase.auth.updateUser({ password: profilePassword });
                          if (error) throw error;
                          toast("Password updated successfully.", "success");
                          setProfilePassword("");
                          setProfileConfirmPassword("");
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Failed to change password.", "error");
                        } finally {
                          setProfileBusy(false);
                        }
                      }}
                    >
                      <Check size={15} />
                      <span>Save Password</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="sp-section-card" style={{ borderColor: "rgba(239, 68, 68, 0.25)", background: "rgba(239, 68, 68, 0.02)" }}>
                <div className="sp-section-header" style={{ borderColor: "rgba(239, 68, 68, 0.15)" }}>
                  <div className="sp-section-title-wrap">
                    <h3 style={{ color: "#dc2626" }}>
                      <AlertTriangle size={17} style={{ color: "#dc2626" }} />
                      <span>Danger Zone</span>
                    </h3>
                    <p className="sp-section-subtitle">
                      Permanently delete your account and revoke all staff and administrative credentials.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>Delete Staff Account</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                      Once deleted, this account cannot be recovered.
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "9px 18px",
                      borderRadius: "var(--r-md)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: "rgba(239, 68, 68, 0.08)",
                      color: "#dc2626",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      transition: "all var(--t-fast)",
                    }}
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <Trash2 size={14} />
                    <span>Delete My Account</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Refined Delete Account Modal */}
            {showDeleteModal && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(6px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowDeleteModal(false);
                    setDeleteConfirm("");
                  }
                }}
              >
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r-xl)",
                    padding: 30,
                    maxWidth: 440,
                    width: "100%",
                    boxShadow: "0 20px 48px rgba(0,0,0,0.25)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "rgba(239,68,68,0.12)",
                        color: "#dc2626",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <AlertTriangle size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>Delete Staff Account</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>This action is permanent and immediate.</div>
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
                    To confirm deletion, please type <strong style={{ color: "#dc2626" }}>DELETE</strong> in the field below. Your staff session will terminate immediately.
                  </p>

                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    style={{
                      width: "100%",
                      marginBottom: 20,
                      height: 42,
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line)",
                      background: "var(--bg)",
                      padding: "0 14px",
                      boxSizing: "border-box",
                      fontSize: 13.5,
                      color: "var(--ink)",
                    }}
                  />

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: "var(--r-md)",
                        background: "var(--bg)",
                        border: "1px solid var(--line)",
                        color: "var(--ink)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setShowDeleteModal(false);
                        setDeleteConfirm("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleteConfirm !== "DELETE" || profileBusy}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: "var(--r-md)",
                        background: deleteConfirm === "DELETE" ? "#dc2626" : "rgba(239,68,68,0.3)",
                        border: "none",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: deleteConfirm === "DELETE" ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        transition: "background var(--t-fast)",
                      }}
                      onClick={async () => {
                        if (deleteConfirm !== "DELETE") return;
                        setProfileBusy(true);
                        try {
                          await supabase.auth.signOut();
                          setShowDeleteModal(false);
                          setDeleteConfirm("");
                          toast("Account signed out. Contact your system administrator to finalize database removal.", "info");
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Failed to delete account.", "error");
                        } finally {
                          setProfileBusy(false);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      <span>{profileBusy ? "Processing…" : "Confirm Delete"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "staff" ? (
          /* ── Tab: Staff & Access Management (Refactored) ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* ── Top Stats Row ── */}
            <div className="sp-kpi-grid">
              <div className="sp-kpi-card" style={{ "--kpi-accent": "#6366F1" } as React.CSSProperties}>
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Total Staff</span>
                  <div className="sp-kpi-icon">
                    <Users2 size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num">{staffMembers.length}</div>
                <div className="sp-kpi-sub">Active campus team members</div>
              </div>

              <div className="sp-kpi-card" style={{ "--kpi-accent": "#f59e0b" } as React.CSSProperties}>
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Administrators</span>
                  <div className="sp-kpi-icon" style={{ color: "#d97706" }}>
                    <Crown size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num" style={{ color: "#d97706" }}>
                  {staffMembers.filter((s) => s.role === "admin").length}
                </div>
                <div className="sp-kpi-sub">Full portal governance & access</div>
              </div>

              <div className="sp-kpi-card" style={{ "--kpi-accent": "#10b981" } as React.CSSProperties}>
                <div className="sp-kpi-top">
                  <span className="sp-kpi-label">Moderators</span>
                  <div className="sp-kpi-icon" style={{ color: "#059669" }}>
                    <ShieldCheck size={16} />
                  </div>
                </div>
                <div className="sp-kpi-num" style={{ color: "#059669" }}>
                  {staffMembers.filter((s) => s.role === "moderator").length}
                </div>
                <div className="sp-kpi-sub">Content triage & reviews</div>
              </div>
            </div>

            <div className="sp-staff-layout">
              {/* ── Left: Staff Directory ── */}
              <div className="sp-section-card">
                <div className="sp-section-header">
                  <div className="sp-section-title-wrap">
                    <h3>
                      <Users2 size={17} style={{ color: "var(--navy)" }} />
                      <span>Staff Directory</span>
                      <span className="sp-tab-badge" style={{ marginLeft: 6 }}>{staffMembers.length}</span>
                    </h3>
                    <p className="sp-section-subtitle">
                      Manage roles, promote team members, or revoke staff credentials.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sp-btn-action"
                    title="Refresh staff list"
                    onClick={() => {
                      loadStaff();
                      loadStudents(promoteSearch);
                    }}
                  >
                    <RefreshCw size={13} className={staffLoading || promoteSearchBusy ? "spin" : ""} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Filter and Search Bar */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                  <div className="sp-search-box" style={{ flex: 1, minWidth: 180 }}>
                    <Search size={14} className="sp-search-icon" />
                    <input
                      type="text"
                      className="sp-search-input"
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      placeholder="Search staff by name or email..."
                    />
                    {staffSearch && (
                      <button
                        type="button"
                        className="sp-search-clear"
                        onClick={() => setStaffSearch("")}
                        aria-label="Clear search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="sp-status-chips" style={{ margin: 0 }}>
                    {(["all", "admin", "moderator"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`sp-chip${staffRoleFilter === r ? " sp-chip--active" : ""}`}
                        onClick={() => setStaffRoleFilter(r)}
                      >
                        {r === "all" ? "All" : r === "admin" ? "Admins" : "Moderators"}
                      </button>
                    ))}
                  </div>
                </div>

                {staffLoading ? (
                  <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
                    <RefreshCw size={18} className="spin" style={{ margin: "0 auto 8px", display: "block" }} />
                    Loading staff directory...
                  </div>
                ) : filteredStaff.length === 0 ? (
                  <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
                    No staff members match your filter criteria.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filteredStaff.map((member) => {
                      const isSelf = member.id === authSession?.user?.id;
                      const initial = (member.display_name ?? "?")[0]?.toUpperCase() ?? "S";
                      return (
                        <div key={member.id} className="sp-staff-card">
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: "50%",
                                flexShrink: 0,
                                background:
                                  member.role === "admin"
                                    ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                                    : "linear-gradient(135deg, #0b3857 0%, #2563eb 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: 800,
                              }}
                            >
                              {initial}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {member.display_name || member.email?.split("@")[0] || "Staff Member"}
                                </span>
                                {isSelf && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: "1px 6px",
                                      borderRadius: "var(--r-full)",
                                      background: "var(--line)",
                                      color: "var(--muted)",
                                    }}
                                  >
                                    You
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
                                <span className={member.role === "admin" ? "sp-role-badge-admin" : "sp-role-badge-mod"}>
                                  {member.role === "admin" ? <Crown size={11} /> : <ShieldCheck size={11} />}
                                  <span>{member.role === "admin" ? "Administrator" : "Moderator"}</span>
                                </span>
                                {member.email && (
                                  <span style={{ fontSize: 11.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <Mail size={11} />
                                    <span>{member.email}</span>
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                  Since {new Date(member.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                            {member.role === "moderator" ? (
                              <button
                                type="button"
                                disabled={staffRoleChanging === member.id || isSelf}
                                title="Promote to Administrator"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "6px 12px",
                                  borderRadius: "var(--r-md)",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  background: "rgba(245, 158, 11, 0.1)",
                                  color: "#d97706",
                                  border: "1px solid rgba(245, 158, 11, 0.25)",
                                  transition: "all var(--t-fast)",
                                }}
                                onClick={async () => {
                                  setStaffRoleChanging(member.id);
                                  const { error } = await supabase.from("profiles").update({ role: "admin" }).eq("id", member.id);
                                  if (error) {
                                    toast(error.message, "error");
                                  } else {
                                    toast(`${member.display_name ?? "User"} promoted to Administrator.`, "success");
                                    loadStaff();
                                    loadStudents(promoteSearch);
                                  }
                                  setStaffRoleChanging(null);
                                }}
                              >
                                <Crown size={12} />
                                <span>Make Admin</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={staffRoleChanging === member.id || isSelf}
                                title={isSelf ? "You cannot demote yourself" : "Demote to Moderator"}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "6px 12px",
                                  borderRadius: "var(--r-md)",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: isSelf ? "not-allowed" : "pointer",
                                  background: "rgba(11, 56, 87, 0.08)",
                                  color: "var(--navy)",
                                  border: "1px solid var(--line)",
                                  opacity: isSelf ? 0.45 : 1,
                                  transition: "all var(--t-fast)",
                                }}
                                onClick={async () => {
                                  if (isSelf) return;
                                  setStaffRoleChanging(member.id);
                                  const { error } = await supabase.from("profiles").update({ role: "moderator" }).eq("id", member.id);
                                  if (error) {
                                    toast(error.message, "error");
                                  } else {
                                    toast(`${member.display_name ?? "User"} demoted to Moderator.`, "info");
                                    loadStaff();
                                    loadStudents(promoteSearch);
                                  }
                                  setStaffRoleChanging(null);
                                }}
                              >
                                <ShieldCheck size={12} />
                                <span>Demote</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={staffRoleChanging === member.id || isSelf}
                              title={isSelf ? "You cannot revoke your own access" : "Revoke staff access"}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 32,
                                height: 32,
                                borderRadius: "var(--r-md)",
                                cursor: isSelf ? "not-allowed" : "pointer",
                                background: "rgba(239, 68, 68, 0.08)",
                                color: "#dc2626",
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                                opacity: isSelf ? 0.45 : 1,
                                transition: "all var(--t-fast)",
                              }}
                              onClick={async () => {
                                if (isSelf) return;
                                if (!window.confirm(`Revoke staff access from ${member.display_name ?? "this user"}? They will be reverted to a student account.`)) return;
                                setStaffRoleChanging(member.id);
                                const { error } = await supabase.from("profiles").update({ role: "student" }).eq("id", member.id);
                                if (error) {
                                  toast(error.message, "error");
                                } else {
                                  toast(`${member.display_name ?? "User"} access revoked.`, "info");
                                  loadStaff();
                                  loadStudents(promoteSearch);
                                }
                                setStaffRoleChanging(null);
                              }}
                            >
                              <UserX size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Right Column: Growth Actions ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Promote Existing Student */}
                <div className="sp-section-card">
                  <div className="sp-section-header">
                    <div className="sp-section-title-wrap">
                      <h3>
                        <UserCheck size={17} style={{ color: "#10b981" }} />
                        <span>Promote Registered User</span>
                      </h3>
                      <p className="sp-section-subtitle">
                        Search student accounts by Gmail or email address to verify identity and promote to staff.
                      </p>
                    </div>
                  </div>

                  <div className="sp-form-input-group" style={{ marginBottom: 12 }}>
                    <div className="sp-input-with-icon">
                      <div className="sp-input-icon">
                        <Mail size={14} />
                      </div>
                      <input
                        type="text"
                        value={promoteSearch}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPromoteSearch(val);
                          if (!val.trim()) {
                            loadStudents("");
                          }
                        }}
                        placeholder="Search student by Gmail / email (e.g. @gmail.com)..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            loadStudents(promoteSearch);
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="sp-btn-inline"
                      disabled={promoteSearchBusy}
                      onClick={() => loadStudents(promoteSearch)}
                    >
                      <Search size={14} />
                      <span>{promoteSearch.trim() ? "Search" : "Show All"}</span>
                    </button>
                  </div>

                  {promoteSearchBusy && (
                    <div style={{ fontSize: 13, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>
                      <RefreshCw size={16} className="spin" style={{ margin: "0 auto 6px", display: "block" }} />
                      Loading student profiles...
                    </div>
                  )}

                  {!promoteSearchBusy && promoteResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                        Registered Students ({promoteResults.length})
                      </div>
                      {promoteResults.map((user) => (
                        <div
                          key={user.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: "var(--r-md)",
                            background: "var(--bg)",
                            border: "1px solid var(--line)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                flexShrink: 0,
                                background: "linear-gradient(135deg, var(--navy) 0%, var(--accent) 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {(user.display_name ?? user.email ?? "?")[0]?.toUpperCase() ?? "S"}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {user.display_name || user.email?.split("@")[0] || "Student #" + user.id.slice(0, 8)}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                                {user.email ? (
                                  <span style={{ fontSize: 11.5, color: "var(--ink)", display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(11, 56, 87, 0.06)", padding: "1px 6px", borderRadius: 4 }}>
                                    <Mail size={11} style={{ color: "var(--navy)" }} />
                                    <span style={{ fontWeight: 600 }}>{user.email}</span>
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, color: "var(--muted)" }}>No email linked</span>
                                )}
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                  Joined {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "5px 10px",
                                borderRadius: "var(--r-md)",
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: "rgba(16, 185, 129, 0.1)",
                                color: "#059669",
                                border: "1px solid rgba(16, 185, 129, 0.25)",
                              }}
                              onClick={async () => {
                                const { error } = await supabase.from("profiles").update({ role: "moderator" }).eq("id", user.id);
                                if (error) {
                                  toast(error.message, "error");
                                  return;
                                }
                                toast(`${user.display_name || "Student"} is now a Moderator.`, "success");
                                loadStaff();
                                loadStudents(promoteSearch);
                              }}
                            >
                              <ShieldCheck size={11} />
                              <span>Moderator</span>
                            </button>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "5px 10px",
                                borderRadius: "var(--r-md)",
                                fontSize: 11.5,
                                fontWeight: 700,
                                cursor: "pointer",
                                background: "rgba(245, 158, 11, 0.1)",
                                color: "#d97706",
                                border: "1px solid rgba(245, 158, 11, 0.25)",
                              }}
                              onClick={async () => {
                                const { error } = await supabase.from("profiles").update({ role: "admin" }).eq("id", user.id);
                                if (error) {
                                  toast(error.message, "error");
                                  return;
                                }
                                toast(`${user.display_name || "Student"} is now an Administrator.`, "success");
                                loadStaff();
                                loadStudents(promoteSearch);
                              }}
                            >
                              <Crown size={11} />
                              <span>Admin</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!promoteSearchBusy && promoteResults.length === 0 && (
                    <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "16px 0", textAlign: "center" }}>
                      {promoteSearch.trim()
                        ? `No student accounts found matching "${promoteSearch}".`
                        : "No registered student accounts found in the system."}
                    </div>
                  )}
                </div>

                {/* Invite New Staff */}
                <div className="sp-section-card">
                  <div className="sp-section-header">
                    <div className="sp-section-title-wrap">
                      <h3>
                        <UserPlus size={17} style={{ color: "var(--accent)" }} />
                        <span>Invite Team Member</span>
                      </h3>
                      <p className="sp-section-subtitle">
                        Send a secure magic-link invitation. The invitee can set their credentials upon arrival.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="sp-form-row">
                      <label className="sp-form-label">
                        <span>Staff Email Address</span>
                      </label>
                      <div className="sp-input-with-icon">
                        <div className="sp-input-icon">
                          <Mail size={15} />
                        </div>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="staff.name@university.edu"
                        />
                      </div>
                    </div>

                    <div className="sp-form-row">
                      <label className="sp-form-label">
                        <span>Assign Staff Role</span>
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <button
                          type="button"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            height: 42,
                            borderRadius: "var(--r-md)",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: inviteRole === "moderator" ? "rgba(16, 185, 129, 0.12)" : "var(--bg)",
                            color: inviteRole === "moderator" ? "#059669" : "var(--muted)",
                            border: inviteRole === "moderator" ? "2px solid #10b981" : "1px solid var(--line)",
                            transition: "all var(--t-fast)",
                          }}
                          onClick={() => setInviteRole("moderator")}
                        >
                          <ShieldCheck size={15} />
                          <span>Moderator</span>
                        </button>
                        <button
                          type="button"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            height: 42,
                            borderRadius: "var(--r-md)",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                            background: inviteRole === "admin" ? "rgba(245, 158, 11, 0.14)" : "var(--bg)",
                            color: inviteRole === "admin" ? "#d97706" : "var(--muted)",
                            border: inviteRole === "admin" ? "2px solid #f59e0b" : "1px solid var(--line)",
                            transition: "all var(--t-fast)",
                          }}
                          onClick={() => setInviteRole("admin")}
                        >
                          <Crown size={15} />
                          <span>Administrator</span>
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--r-md)",
                        background: "var(--bg)",
                        border: "1px solid var(--line)",
                        fontSize: 12,
                        color: "var(--muted)",
                        lineHeight: 1.5,
                      }}
                    >
                      {inviteRole === "admin" ? (
                        <>
                          <strong style={{ color: "var(--ink)" }}>Administrator role:</strong> Grants access to all staff tabs, user role management, system audit logs, and analytics.
                        </>
                      ) : (
                        <>
                          <strong style={{ color: "var(--ink)" }}>Moderator role:</strong> Grants access to triage submission ideas, manage flagged content, and leave official staff notes.
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn-primary"
                      disabled={inviteBusy || !inviteEmail.trim() || !inviteEmail.includes("@")}
                      style={{
                        height: 42,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        fontSize: 13.5,
                        fontWeight: 700,
                        marginTop: 4,
                      }}
                      onClick={async () => {
                        setInviteBusy(true);
                        try {
                          const origin = window.location.origin;
                          // Call custom SuggFeed invite Edge Function (sends custom HTML via Resend)
                          const { data, error } = await supabase.functions.invoke("invite-staff", {
                            body: {
                              email: inviteEmail.trim(),
                              role: inviteRole,
                              redirectTo: origin,
                            },
                          });

                          if (!error && data?.ok) {
                            if (data.emailSent) {
                              toast(`Custom SuggFeed invitation sent to ${inviteEmail.trim()}.`, "success");
                            } else {
                              toast(`Staff invitation generated for ${inviteEmail.trim()}.`, "success");
                            }
                            setInviteEmail("");
                            loadStaff();
                            loadStudents(promoteSearch);
                            return;
                          }

                          // Fallback to signInWithOtp if function is unreachable
                          const { error: otpError } = await supabase.auth.signInWithOtp({
                            email: inviteEmail.trim(),
                            options: {
                              emailRedirectTo: `${origin}/admin`,
                              data: { role: inviteRole, invited_as_staff: true },
                            },
                          });
                          if (otpError) throw otpError;
                          toast(`Invitation sent to ${inviteEmail.trim()}.`, "success");
                          setInviteEmail("");
                          loadStaff();
                          loadStudents(promoteSearch);
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Failed to send invitation.", "error");
                        } finally {
                          setInviteBusy(false);
                        }
                      }}
                    >
                      <SendHorizonal size={15} />
                      <span>{inviteBusy ? "Sending Invitation..." : "Send Invitation"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  {counts.pending > 0 ? "Action required" : "Queue caught up"}
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
                <div className="sp-kpi-num">{counts.all}</div>
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
                  <span className="sp-chip-count">({counts.all})</span>
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
