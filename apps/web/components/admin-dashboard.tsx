"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "./toast";
import { loadAttachments, type AttachmentFile } from "../lib/feedback-api";
import { CheckCircle2, GitPullRequestArrow, CircleCheck, XCircle, LogOut, Paperclip, X, ChevronRight, ExternalLink } from "lucide-react";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { AnimatedCounter } from "./animated-counter";
import { ThemeToggle } from "./theme-toggle";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import type { PublishedSubmission } from "../lib/feedback-api";

type Status = "pending" | "approved" | "rejected" | "in_progress" | "resolved";
type Submission = Omit<PublishedSubmission, 'status'> & { status: Status };
type HistoryEntry = { id: string; new_status: Status; old_status: Status | null; note: string | null; created_at: string; profiles: { display_name: string | null } | null };

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected",
  in_progress: "In progress", resolved: "Resolved",
};
const ALL_STATUSES: Status[] = ["pending", "approved", "in_progress", "resolved", "rejected"];

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge ${status.replace("_", "-")}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function StatChip({ label, count, cls }: { label: string; count: number; cls?: string }) {
  return (
    <div className={`stat-chip${cls ? ` ${cls}` : ""}`}>
      <span className="stat-num">{count}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function AdminDashboard() {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adminAttachments, setAdminAttachments] = useState<AttachmentFile[]>([]);
  const [adminLightbox, setAdminLightbox] = useState<string | null>(null);
  const [viewIdea, setViewIdea] = useState<Submission | null>(null);
  const [statusHistory, setStatusHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [viewMode, setViewMode] = useState<"queue" | "analytics">("queue");

  async function loadSubmissions() {
    const { data, error } = await supabase
      .from("submissions")
      .select("id,title,description,status,created_at,categories(name),vote_count,attachments(id,storage_path)")
      .order("created_at", { ascending: false });
    if (error) {
      toast("You're signed in, but this account doesn't have moderator access.", "error");
      return;
    }
    setSubmissions((data ?? []) as unknown as Submission[]);
  }

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setAccessToken(data.session.access_token); loadSubmissions(); }
    });
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      } else if (session) {
        setAccessToken(session.access_token);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load attachments when a submission is opened in the admin detail modal
  useEffect(() => {
    if (viewIdea && (viewIdea.attachments?.length ?? 0) > 0) {
      setAdminAttachments([]);
      loadAttachments(viewIdea.id).then(setAdminAttachments).catch(console.error);
    } else {
      setAdminAttachments([]);
    }
  }, [viewIdea]);

  // Load status history when a submission is opened
  useEffect(() => {
    if (!viewIdea) { setStatusHistory([]); return; }
    setHistoryLoading(true);
    supabase
      .from("status_history")
      .select("id,new_status,old_status,note,created_at,profiles(display_name)")
      .eq("submission_id", viewIdea.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setStatusHistory((data ?? []) as unknown as HistoryEntry[]);
      })
      .then(() => setHistoryLoading(false));
  }, [viewIdea]);

  // Render a neutral shell on the server and during first paint to avoid
  // hydration mismatches — auth state is only known after mount.
  if (!mounted) return (
    <main className="admin-shell admin-login">
      <div className="admin-header">
        <a className="brand" href="/">campus<span>voice</span></a>
      </div>
    </main>
  );

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error || !data.session) { toast(error?.message ?? "Unable to sign in.", "error"); return; }
    setAccessToken(data.session.access_token);
    await loadSubmissions();
    toast("Signed in successfully.", "success");
  }

  async function sendResetLink() {
    if (!email) { toast("Enter your email address first.", "error"); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/admin" });
    setBusy(false);
    if (error) toast(error.message, "error");
    else toast("Password reset link sent to your email.", "success");
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 6) { toast("Password must be at least 6 characters.", "error"); return; }
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

  async function changeStatus(id: string, status: Status) {
    if (!accessToken) return;
    setBusy(true);
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
          body: JSON.stringify({ submissionId: id, status, note: notes[id] ?? "" }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update");
      setSubmissions((cur) => cur.map((item) => item.id === id ? { ...item, status } : item));
      setNotes((n) => { const next = { ...n }; delete next[id]; return next; });
      // Refresh history for the currently viewed idea
      if (viewIdea?.id === id) {
        supabase
          .from("status_history")
          .select("id,new_status,old_status,note,created_at,profiles(display_name)")
          .eq("submission_id", id)
          .order("created_at", { ascending: false })
          .then(({ data }) => setStatusHistory((data ?? []) as unknown as HistoryEntry[]));
      }
      toast(`Status updated to "${STATUS_LABELS[status]}".`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update status.", "error");
    } finally { setBusy(false); }
  }

  async function bulkChangeStatus(status: Status) {
    if (!accessToken || selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id =>
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/review-submission`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ submissionId: id, status, note: notes[id] ?? "" }),
        })
      ));
      setSubmissions((cur) => cur.map((item) => selectedIds.has(item.id) ? { ...item, status } : item));
      setSelectedIds(new Set());
      toast(`${ids.length} submission${ids.length > 1 ? "s" : ""} updated to "${STATUS_LABELS[status]}".`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to bulk update.", "error");
    } finally { setBulkBusy(false); }
  }

  function exportCsv() {
    const rows = [
      ["Title", "Description", "Category", "Status", "Votes", "Date"],
      ...visible.map(s => [
        `"${s.title.replace(/"/g, '""')}"`,
        `"${s.description.replace(/"/g, '""')}"`,
        `"${s.categories?.name ?? 'Other'}"`,
        s.status,
        String(s.vote_count),
        new Date(s.created_at).toLocaleDateString(),
      ])
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `campusvoice-${filterStatus}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast("CSV exported.", "success");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAccessToken(null); setSubmissions([]);
    toast("Signed out.", "info");
  }

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = submissions.filter((x) => x.status === s).length;
    return acc;
  }, {} as Record<Status, number>);

  const visible = filterStatus === "all"
    ? submissions
    : submissions.filter((s) => s.status === filterStatus);

  if (recoveryMode) return (
    <>
      <header className="site-header">
        <a className="brand" href="/">campus<span>voice</span></a>
        <nav>
          <a href="/">← Back to site</a>
          <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
          <ThemeToggle />
        </nav>
      </header>
      <main className="admin-shell admin-login">
        <section className="login-card">
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h1>Set new password</h1>
          <p style={{ marginTop: 8 }}>Enter a new password for your account.</p>
          <form onSubmit={updatePassword} style={{ marginTop: 24 }}>
            <div className="field">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="••••••••" minLength={6} />
            </div>
            <button className="btn-primary" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        </section>
      </main>
    </>
  );

  if (!accessToken) return (
    <>
      <header className="site-header">
        <a className="brand" href="/">campus<span>voice</span></a>
        <nav>
          <a href="/">← Back to site</a>
          <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
          <ThemeToggle />
        </nav>
      </header>
      <main className="admin-shell admin-login">
        <section className="login-card">
          <p className="eyebrow">STAFF ACCESS</p>
          <h1>Review community feedback.</h1>
          <p style={{ marginTop: 8 }}>Sign in with an account that has the moderator or admin role.</p>
          <form onSubmit={signIn} style={{ marginTop: 24 }}>
            <div className="field">
              <label>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@school.edu" />
            </div>
            <div className="field">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label>Password</label>
                <button type="button" onClick={sendResetLink} style={{ background: "none", border: "none", color: "var(--navy)", fontSize: 13, cursor: "pointer", padding: 0 }}>Forgot?</button>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            <button className="btn-primary" disabled={busy} style={{ marginTop: 20 }}>
              {busy ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        </section>
      </main>
    </>
  );


  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">campus<span>voice</span></a>
        <nav>
          <a href="/" className="nav-link-hide-mobile">Public site</a>
          <button
            onClick={signOut}
            className="btn-ghost"
          >
            <LogOut size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            <span className="admin-signout-label">Sign out</span>
          </button>
          <div style={{ width: 1, height: 24, background: "var(--line-2)", margin: "0 4px" }} />
          <ThemeToggle />
        </nav>
      </header>
      <main className="admin-shell">

      <div className="admin-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p className="eyebrow">STAFF PORTAL</p>
          <h1>{viewMode === 'queue' ? 'Moderation Queue' : 'Analytics Dashboard'}</h1>
          <p>{viewMode === 'queue' ? 'Review and manage community submissions.' : 'High-level insights into community engagement.'}</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-2)', padding: 4, borderRadius: 'var(--r-md)', border: '1px solid var(--line-2)' }}>
            <button
              onClick={() => setViewMode('queue')}
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 'var(--r-sm)',
                background: viewMode === 'queue' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'queue' ? 'var(--ink)' : 'var(--muted)',
                boxShadow: viewMode === 'queue' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              Queue
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 'var(--r-sm)',
                background: viewMode === 'analytics' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'analytics' ? 'var(--ink)' : 'var(--muted)',
                boxShadow: viewMode === 'analytics' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              Analytics
            </button>
          </div>

          {viewMode === 'queue' && (
            <button
              className="btn-ghost"
              onClick={exportCsv}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
              title="Export current view as CSV"
            >
              ↓ Export CSV
            </button>
          )}
        </div>
      </div>

      {viewMode === 'analytics' ? (
        <div style={{ marginTop: 24 }}>
          {/* Top KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
            <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Ideas</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>{submissions.length}</span>
            </div>
            <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Votes</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>
                {submissions.reduce((acc, s) => acc + s.vote_count, 0)}
              </span>
            </div>
            <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Avg Votes per Idea</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--ink)', marginTop: 8 }}>
                {submissions.length > 0 ? (submissions.reduce((acc, s) => acc + s.vote_count, 0) / submissions.length).toFixed(1) : "0.0"}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
            {/* Category Chart */}
            <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 'var(--r-xl)', border: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 24 }}>Ideas by Category</h3>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={
                    Object.entries(submissions.reduce((acc, s) => {
                      const cat = s.categories?.name || 'Other';
                      acc[cat] = (acc[cat] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>))
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                  }>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                    <Tooltip cursor={{ fill: 'var(--bg-2)' }} contentStyle={{ borderRadius: 8, border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }} />
                    <Bar dataKey="count" fill="var(--navy)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Chart */}
            <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 'var(--r-xl)', border: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 24 }}>Moderation Funnel</h3>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={ALL_STATUSES.map(s => ({ name: STATUS_LABELS[s], value: counts[s] })).filter(d => d.value > 0)}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {ALL_STATUSES.map(s => ({ name: STATUS_LABELS[s], value: counts[s] })).filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={
                          entry.name === 'Approved' ? 'var(--success)' :
                          entry.name === 'Rejected' ? 'var(--error)' :
                          entry.name === 'Resolved' ? 'var(--mint)' :
                          entry.name === 'In progress' ? 'var(--sky)' : 'var(--warn)'
                        } />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="stats-bar">
            <StatChip label="Total" count={submissions.length} />
            <StatChip label="Pending" count={counts.pending} cls="pending" />
            <StatChip label="Approved" count={counts.approved} cls="approved" />
            <StatChip label="In Progress" count={counts.in_progress} />
            <StatChip label="Resolved" count={counts.resolved} />
            <StatChip label="Rejected" count={counts.rejected} />
          </div>

          {/* Filter bar */}
          <div className="admin-filters">
            {([["all", "All"], ...ALL_STATUSES.map((s) => [s, STATUS_LABELS[s]])] as [string, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`filter-chip${filterStatus === key ? " active" : ""}`}
                onClick={() => setFilterStatus(key as Status | "all")}
              >
                {label} {key !== "all" && <span style={{ opacity: .7 }}>({counts[key as Status] ?? 0})</span>}
              </button>
            ))}
          </div>

          <div className="review-list">
            {visible.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", border: "2px dashed var(--line-2)", borderRadius: 16, color: "var(--muted)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <h2 style={{ fontSize: 20, marginBottom: 8, color: "var(--ink)" }}>No submissions here</h2>
                <p>New feedback will appear once submitted.</p>
              </div>
            ) : (
              <>
                {/* Select all row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--line)', fontSize: 13, color: 'var(--muted)' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selectedIds.size === visible.length && visible.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(visible.map(v => v.id)) : new Set())}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Select all ({visible.length})</span>
                  {selectedIds.size > 0 && <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 600 }}>{selectedIds.size} selected</span>}
                </div>
                {visible.map((item) => (
                  <article className="review-card" key={item.id} onClick={() => setViewIdea(item)}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        e.stopPropagation();
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          e.target.checked ? next.add(item.id) : next.delete(item.id);
                          return next;
                        });
                      }}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                      aria-label={`Select ${item.title}`}
                    />
                    <div className="review-card-content">
                      <h2>{item.title}</h2>
                      
                      <div className="review-card-meta">
                        <StatusBadge status={item.status} />
                        <span className="tag">{item.categories?.name ?? "Other"}</span>
                        {(item.attachments?.length ?? 0) > 0 && (
                          <span className="card-attachment-badge" title={`${item.attachments.length} file${item.attachments.length > 1 ? "s" : ""} attached`}>
                            <Paperclip size={11} strokeWidth={2.5} />
                            {item.attachments.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', alignSelf: 'center', flexShrink: 0 }}>
                      <small className="date-stamp" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </small>
                      <ChevronRight size={18} color="var(--muted-2)" style={{ flexShrink: 0 }} />
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 10, alignItems: 'center',
          background: 'var(--surface)', color: 'var(--ink)',
          border: '1px solid var(--line)',
          padding: '12px 20px', borderRadius: 'var(--r-full)',
          boxShadow: 'var(--shadow-lg)', zIndex: 200,
          animation: 'overlay-in 150ms ease both',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button
            onClick={() => bulkChangeStatus("approved")}
            disabled={bulkBusy}
            style={{ background: '#11845b', color: 'white', border: 'none', borderRadius: 'var(--r-md)', padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ✓ Approve all
          </button>
          <button
            onClick={() => bulkChangeStatus("rejected")}
            disabled={bulkBusy}
            style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: 'var(--r-md)', padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            ✕ Reject all
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '5px 10px', fontSize: 13, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {viewIdea && (
        <>
          <div className="panel-overlay" onClick={() => setViewIdea(null)} />
          <aside className="detail-panel admin-detail-modal" role="dialog" aria-modal="true">
            <div className="detail-panel-header">
              <div>
                <div className="detail-panel-badges" style={{ marginBottom: 4 }}>
                  <StatusBadge status={viewIdea.status} />
                  <span className="tag">{viewIdea.categories?.name ?? "Other"}</span>
                </div>
                <h1 id="detail-title" style={{ fontSize: 20, color: "var(--ink)" }}>{viewIdea.title}</h1>
                <small className="date-stamp" style={{ marginTop: 4, display: "block" }}>
                  Submitted on {new Date(viewIdea.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </small>
              </div>
              <button className="panel-close-btn" aria-label="Close" onClick={() => setViewIdea(null)}>
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="detail-col">
              <div className="detail-body" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 24, marginBottom: 24 }}>
                <p style={{ whiteSpace: "pre-wrap" }}>{viewIdea.description}</p>
                {adminAttachments.length > 0 && (
                  <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {adminAttachments.map(file => {
                      const isImage = file.mime_type.startsWith("image/");

                      return isImage ? (
                        <button key={file.id} className="attachment-thumb" onClick={() => setAdminLightbox(file.url)} title={file.name} style={{ cursor: 'pointer', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line-2)', padding: 0, background: 'none' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.url || undefined} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        </button>
                      ) : (
                        <a key={file.id} href={file.url ?? '#'} download className="attachment-file-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--line-2)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
                          <Paperclip size={14} />
                          <span style={{ flex: 1, fontSize: 13 }}>{file.name}</span>
                          <ExternalLink size={12} style={{ opacity: 0.5 }} />
                        </a>
                      );
                    })}
                  </div>
                )}
                {(viewIdea.attachments?.length ?? 0) > 0 && adminAttachments.length === 0 && (
                  <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                    {viewIdea.attachments!.map(f => <div key={f.id} className="skeleton" style={{ width: 80, height: 80, borderRadius: 8 }} />)}
                  </div>
                )}
              </div>

              <div className="admin-moderation-tools">
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>Moderation Actions</h3>
                <textarea
                  className="note-input"
                  placeholder="Optional note for the submitter (e.g. reason for rejection)…"
                  rows={2}
                  value={notes[viewIdea.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [viewIdea.id]: e.target.value }))}
                />
                
                <div className="review-actions" style={{ marginTop: 16 }}>
                  <button className="approve" onClick={() => { changeStatus(viewIdea.id, "approved"); setViewIdea(null); }} disabled={busy || viewIdea.status === "approved"}>
                    <CheckCircle2 size={14} strokeWidth={2} /> Approve
                  </button>
                  <button className="reject" onClick={() => { changeStatus(viewIdea.id, "rejected"); setViewIdea(null); }} disabled={busy || viewIdea.status === "rejected"}>
                    <XCircle size={14} strokeWidth={2} /> Reject
                  </button>
                  <button onClick={() => { changeStatus(viewIdea.id, "in_progress"); setViewIdea(null); }} disabled={busy || viewIdea.status === "in_progress"}>
                    <GitPullRequestArrow size={14} strokeWidth={2} /> In Progress
                  </button>
                  <button onClick={() => { changeStatus(viewIdea.id, "resolved"); setViewIdea(null); }} disabled={busy || viewIdea.status === "resolved"}>
                    <CircleCheck size={14} strokeWidth={2} /> Resolve
                  </button>
                </div>
              </div>

              {/* Status History Timeline */}
              <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 16 }}>Status History</h3>
                {historyLoading ? (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading history…</div>
                ) : statusHistory.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>No status changes yet.</div>
                ) : (
                  <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {statusHistory.map((entry, i) => (
                      <li key={entry.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: entry.new_status === 'approved' ? 'var(--success-bg)' :
                            entry.new_status === 'rejected' ? 'var(--error-bg)' :
                            entry.new_status === 'in_progress' ? 'var(--sky)' :
                            entry.new_status === 'resolved' ? 'var(--mint)' : 'var(--bg-2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12,
                          border: `2px solid ${i === 0 ? 'var(--accent)' : 'transparent'}`,
                        }}>
                          {entry.new_status === 'approved' ? '✓' :
                           entry.new_status === 'rejected' ? '✕' :
                           entry.new_status === 'resolved' ? '★' : '→'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{STATUS_LABELS[entry.new_status]}</strong>
                            {entry.old_status && <span style={{ fontSize: 12, color: 'var(--muted)' }}>from {STATUS_LABELS[entry.old_status]}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            {entry.profiles?.display_name && <span>{entry.profiles.display_name} · </span>}
                            {new Date(entry.created_at).toLocaleString()}
                          </div>
                          {entry.note && (
                            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink)', background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 'var(--r-md)', borderLeft: '3px solid var(--line-2)' }}>
                              {entry.note}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </aside>
        </>
      )}

      {adminLightbox && (
        <div
          onClick={() => setAdminLightbox(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'overlay-in 150ms ease both',
          }}
        >
          <button
            onClick={() => setAdminLightbox(null)}
            aria-label="Close image"
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.12)', border: 'none',
              borderRadius: '50%', width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white',
            }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={adminLightbox}
            alt="Attachment preview"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw', maxHeight: '92vh',
              borderRadius: 12,
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              animation: 'lightbox-in 200ms cubic-bezier(.22,.85,.4,1) both',
            }}
          />
        </div>
      )}
    </main>
  </>
  );
}
