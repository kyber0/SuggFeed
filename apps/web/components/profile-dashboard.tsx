"use client";

import { useEffect, useState } from "react";
import { getAnonToken } from "../lib/anon-token";
import { getDeviceFingerprint } from "../lib/device-fingerprint";
import {
  loadMyActivity,
  loadSubmissionsByIds,
  loadUserBookmarkIds,
  loadUserSharedIds,
  toggleUserBookmark,
  type PublishedSubmission,
} from "../lib/feedback-api";
import { Header } from "./header";
import { useAuth } from "./auth-context";
import { useToast } from "./toast";
import Link from "next/link";
import {
  ThumbsUp,
  Paperclip,
  MessageSquare,
  Bookmark,
  Share2,
  CheckCircle,
  User,
  LogIn,
  Settings,
  Sparkles,
  Clock,
  ArrowUpRight,
  EyeOff,
  Bell,
  Trash2,
} from "lucide-react";
import { readableStatus } from "../lib/format";
import { supabase } from "../lib/supabase";

const STATUS_COLOR: Record<string, string> = {
  approved: "#10B981",
  in_progress: "#3B82F6",
  resolved: "#0D9488",
  pending: "#F59E0B",
};

type ProfileTab = "submissions" | "bookmarks" | "shared" | "voted";

function ActivityCard({
  item,
  isBookmarkTab,
  onRemoveBookmark,
}: {
  item: PublishedSubmission;
  isBookmarkTab?: boolean;
  onRemoveBookmark?: (id: string) => void;
}) {
  const catName = item.categories?.name ?? "Other";
  const statusColor = STATUS_COLOR[item.status] ?? "#94A3B8";
  const date = new Date(item.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="prof-activity-card-wrap">
      <Link
        href={`/idea/${item.id}`}
        className="prof-activity-card"
        aria-label={item.title}
      >
        <div className="prof-activity-card-top">
          <span className="prof-activity-cat">{catName}</span>
          <span
            className="prof-activity-status"
            style={{ color: statusColor, background: `${statusColor}18`, borderColor: `${statusColor}30` }}
          >
            {readableStatus(item.status)}
          </span>
        </div>
        <h3 className="prof-activity-title">{item.title}</h3>
        <div className="prof-activity-footer">
          <span className="prof-activity-stat">
            <ThumbsUp size={12} strokeWidth={2.5} />
            {item.vote_count}
          </span>
          {(item.attachments?.length ?? 0) > 0 && (
            <span className="prof-activity-stat">
              <Paperclip size={12} strokeWidth={2.5} />
              {item.attachments.length}
            </span>
          )}
          <span className="prof-activity-date">
            <Clock size={11} strokeWidth={2} />
            {date}
          </span>
          <ArrowUpRight size={13} className="prof-activity-arrow" />
        </div>
      </Link>
      {isBookmarkTab && onRemoveBookmark && (
        <button
          type="button"
          className="prof-remove-bookmark-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveBookmark(item.id);
          }}
          aria-label="Remove from bookmarks"
          title="Remove from bookmarks"
        >
          <Bookmark size={14} fill="var(--bookmark, #F59E0B)" strokeWidth={0} />
          <span>Remove</span>
        </button>
      )}
    </div>
  );
}

export function ProfileDashboard() {
  const { user, openAuthModal } = useAuth();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<PublishedSubmission[]>([]);
  const [bookmarks, setBookmarks] = useState<PublishedSubmission[]>([]);
  const [sharedPosts, setSharedPosts] = useState<PublishedSubmission[]>([]);
  const [voted, setVoted] = useState<PublishedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("submissions");

  // Profile settings state
  const [displayName, setDisplayName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Check URL query parameters for initial tab (e.g. ?tab=bookmarks)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as ProfileTab | null;
      if (tabParam && ["submissions", "bookmarks", "shared", "voted"].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load display name preferences
  useEffect(() => {
    const name = localStorage.getItem("sf_display_name") ?? localStorage.getItem("cv_display_name") ?? "";
    const anon = (localStorage.getItem("sf_anon_pref") ?? localStorage.getItem("cv_anon_pref")) === "true";
    setDisplayName(name);
    setIsAnonymous(anon);

    if (user) {
      const authName =
        user.user_metadata?.full_name ??
        user.user_metadata?.display_name ??
        name;
      setDisplayName(authName);

      supabase
        .from("profiles")
        .select("email_notifications_enabled")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setEmailNotifs(data.email_notifications_enabled ?? false);
        });
    }
  }, [user]);

  // Load user submissions, voted ideas, bookmarks, and shared ideas
  useEffect(() => {
    let trackingCodes: string[] = [];
    try {
      trackingCodes = JSON.parse(
        localStorage.getItem("sf_my_tracking_codes") ||
        localStorage.getItem("cv_my_tracking_codes") ||
        "[]"
      );
    } catch { /* ignore */ }

    async function fetchActivity() {
      setLoading(true);
      try {
        const deviceFp = await getDeviceFingerprint();
        if (user) {
          const [res, bMarks, sPosts] = await Promise.all([
            loadMyActivity(getAnonToken(), trackingCodes, deviceFp),
            loadUserBookmarkIds().then((ids) => loadSubmissionsByIds(ids)),
            loadUserSharedIds().then((ids) => loadSubmissionsByIds(ids)),
          ]);
          setSubmissions(res.submissions ?? []);
          setVoted(res.votedSubmissions ?? []);
          setBookmarks(bMarks);
          setSharedPosts(sPosts);
        } else {
          const res = await loadMyActivity(getAnonToken(), trackingCodes, deviceFp);
          setSubmissions(res.submissions ?? []);
          setVoted(res.votedSubmissions ?? []);
          setBookmarks([]);
          setSharedPosts([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchActivity();
  }, [user]);

  async function handleRemoveBookmark(id: string) {
    if (!user) return;
    setBookmarks((prev) => prev.filter((item) => item.id !== id));
    try {
      await toggleUserBookmark(id, false);
      toast("Removed from bookmarks", "info");
    } catch {
      toast("Failed to remove bookmark", "error");
    }
  }

  async function handleSave() {
    setSaving(true);
    localStorage.setItem("sf_display_name", displayName.trim());
    localStorage.setItem("sf_anon_pref", String(isAnonymous));

    if (user) {
      await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          email_notifications_enabled: emailNotifs,
        })
        .eq("id", user.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  const initial =
    displayName?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  const shownName = displayName || user?.email?.split("@")[0] || "Anonymous user";

  let activeList: PublishedSubmission[] = [];
  if (activeTab === "submissions") activeList = submissions;
  else if (activeTab === "bookmarks") activeList = bookmarks;
  else if (activeTab === "shared") activeList = sharedPosts;
  else if (activeTab === "voted") activeList = voted;

  return (
    <>
      <Header />
      <main className="prof-page">
        {/* ── Profile Hero ── */}
        <div className="prof-hero">
          <div className="prof-hero-inner">
            {/* Avatar */}
            <div className="prof-avatar">{initial}</div>

            <div className="prof-hero-info">
              <h1 className="prof-hero-name">
                {isAnonymous ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <EyeOff size={16} />
                    Anonymous
                  </span>
                ) : shownName}
              </h1>
              {user && (
                <p className="prof-hero-email">{user.email}</p>
              )}
              <div className="prof-hero-badges">
                <span className="prof-hero-badge">
                  <Sparkles size={11} />
                  {submissions.length} ideas
                </span>
                <span className="prof-hero-badge">
                  <Bookmark size={11} />
                  {bookmarks.length} saved
                </span>
                <span className="prof-hero-badge">
                  <Share2 size={11} />
                  {sharedPosts.length} shared
                </span>
                <span className="prof-hero-badge">
                  <ThumbsUp size={11} />
                  {voted.length} supported
                </span>
              </div>
            </div>

            {/* Auth action */}
            {!user ? (
              <button
                className="btn-primary-sm"
                style={{ marginLeft: "auto", flexShrink: 0 }}
                onClick={() => openAuthModal("signin")}
              >
                <LogIn size={13} strokeWidth={2} />
                Sign in
              </button>
            ) : (
              <Link href="#settings" className="prof-settings-link">
                <Settings size={16} />
              </Link>
            )}
          </div>
        </div>

        {/* ── Content Area ── */}
        <div className="prof-content">
          {/* Left: Settings Panel */}
          <aside className="prof-settings" id="settings">
            <h2 className="prof-section-title">
              <User size={15} />
              Profile Settings
            </h2>

            {!user && (
              <div className="prof-auth-callout">
                <p>Sign in to sync your activity across devices.</p>
                <div className="prof-auth-btns">
                  <button className="btn-primary" onClick={() => openAuthModal("signin")}>
                    <LogIn size={13} /> Sign in
                  </button>
                  <button className="btn-ghost" onClick={() => openAuthModal("signup")}>
                    Create account
                  </button>
                </div>
              </div>
            )}

            <div className="prof-field">
              <label htmlFor="prof-display-name" className="prof-field-label">
                Display name
                <span className="prof-field-hint">Shown on your posts & comments</span>
              </label>
              <input
                id="prof-display-name"
                type="text"
                className="prof-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex, Campus Resident, or leave blank"
                maxLength={60}
              />
            </div>

            <label className="prof-toggle-row">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              <span className="prof-toggle-label">
                <EyeOff size={13} strokeWidth={2} />
                Post anonymously by default
              </span>
            </label>
            <p className="prof-field-hint" style={{ marginTop: 4 }}>
              When enabled, your name is hidden on new comments. You can override per post.
            </p>

            {user && (
              <>
                <label className="prof-toggle-row" style={{ marginTop: 14 }}>
                  <input
                    type="checkbox"
                    checked={emailNotifs}
                    onChange={(e) => setEmailNotifs(e.target.checked)}
                  />
                  <span className="prof-toggle-label">
                    <Bell size={13} strokeWidth={2} />
                    Email notifications
                  </span>
                </label>
                <p className="prof-field-hint" style={{ marginTop: 4 }}>
                  Receive updates when your ideas change status or get comments.
                </p>
              </>
            )}

            <button
              className="btn-primary"
              style={{ marginTop: 20, width: "100%" }}
              onClick={handleSave}
              disabled={saving}
            >
              {saved ? "✓ Saved!" : saving ? "Saving…" : "Save preferences"}
            </button>
          </aside>

          {/* Right: Activity Tabs */}
          <section className="prof-activity">
            <div className="prof-activity-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "submissions"}
                className={`prof-tab-btn${activeTab === "submissions" ? " active" : ""}`}
                onClick={() => setActiveTab("submissions")}
              >
                <MessageSquare size={14} />
                <span>My Ideas</span>
                <span className="prof-tab-count">{submissions.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "bookmarks"}
                className={`prof-tab-btn${activeTab === "bookmarks" ? " active" : ""}`}
                onClick={() => setActiveTab("bookmarks")}
              >
                <Bookmark size={14} />
                <span>Bookmarks</span>
                <span className="prof-tab-count">{bookmarks.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "shared"}
                className={`prof-tab-btn${activeTab === "shared" ? " active" : ""}`}
                onClick={() => setActiveTab("shared")}
              >
                <Share2 size={14} />
                <span>Shared</span>
                <span className="prof-tab-count">{sharedPosts.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "voted"}
                className={`prof-tab-btn${activeTab === "voted" ? " active" : ""}`}
                onClick={() => setActiveTab("voted")}
              >
                <CheckCircle size={14} />
                <span>Supported</span>
                <span className="prof-tab-count">{voted.length}</span>
              </button>
            </div>

            <div className="prof-activity-list">
              {loading ? (
                <>
                  <div className="prof-skeleton" />
                  <div className="prof-skeleton" />
                  <div className="prof-skeleton" />
                </>
              ) : activeList.length === 0 ? (
                <div className="prof-empty">
                  {activeTab === "submissions" && (
                    <>
                      <MessageSquare size={32} strokeWidth={1.5} className="prof-empty-icon" />
                      <p className="prof-empty-title">No submissions yet</p>
                      <p className="prof-empty-text">You haven't submitted any ideas or suggestions yet.</p>
                      <Link href="/" className="btn-primary-sm" style={{ marginTop: 12 }}>
                        Submit an Idea
                      </Link>
                    </>
                  )}
                  {activeTab === "bookmarks" && (
                    <>
                      <Bookmark size={32} strokeWidth={1.5} className="prof-empty-icon" />
                      <p className="prof-empty-title">
                        {!user ? "Sign in to view saved bookmarks" : "No bookmarked ideas"}
                      </p>
                      <p className="prof-empty-text">
                        {!user
                          ? "Bookmarks are saved to your account so you can access them on any device."
                          : "Save ideas you want to keep track of from the ideas feed."}
                      </p>
                      {!user ? (
                        <button
                          type="button"
                          className="btn-primary-sm"
                          style={{ marginTop: 12 }}
                          onClick={() => openAuthModal("signin")}
                        >
                          Sign In to Bookmark
                        </button>
                      ) : (
                        <Link href="/feed" className="btn-primary-sm" style={{ marginTop: 12 }}>
                          Browse Ideas Stream
                        </Link>
                      )}
                    </>
                  )}
                  {activeTab === "shared" && (
                    <>
                      <Share2 size={32} strokeWidth={1.5} className="prof-empty-icon" />
                      <p className="prof-empty-title">
                        {!user ? "Sign in to view shared ideas" : "No shared ideas yet"}
                      </p>
                      <p className="prof-empty-text">
                        {!user
                          ? "Sign in to your account to share ideas and track them across devices."
                          : "Ideas you share with classmates or groups will appear here."}
                      </p>
                      {!user ? (
                        <button
                          type="button"
                          className="btn-primary-sm"
                          style={{ marginTop: 12 }}
                          onClick={() => openAuthModal("signin")}
                        >
                          Sign In to Share
                        </button>
                      ) : (
                        <Link href="/feed" className="btn-primary-sm" style={{ marginTop: 12 }}>
                          Explore & Share Ideas
                        </Link>
                      )}
                    </>
                  )}
                  {activeTab === "voted" && (
                    <>
                      <ThumbsUp size={32} strokeWidth={1.5} className="prof-empty-icon" />
                      <p className="prof-empty-title">No supported ideas</p>
                      <p className="prof-empty-text">Support proposals you want campus administration to prioritize.</p>
                      <Link href="/feed" className="btn-primary-sm" style={{ marginTop: 12 }}>
                        Vote on Ideas
                      </Link>
                    </>
                  )}
                </div>
              ) : (
                activeList.map((item) => (
                  <ActivityCard
                    key={item.id}
                    item={item}
                    isBookmarkTab={activeTab === "bookmarks"}
                    onRemoveBookmark={handleRemoveBookmark}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

