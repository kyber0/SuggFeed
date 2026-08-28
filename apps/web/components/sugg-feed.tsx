"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  fileToPayload, loadPublishedSubmissions, lookupTrackingCode,
  type PublishedSubmission, submitFeedback, voteSubmission,
} from "../lib/feedback-api";
import { addDraft, drafts, queuedDrafts } from "../lib/offline-queue";
import { TurnstileWidget } from "./turnstile-widget";
import { CategoryPicker } from "./category-picker";
import { FileDropzone } from "./file-dropzone";
import { Lock, BellRing, CheckCircle, ThumbsUp, Check, MessageSquare, ArrowRight, Send, Paperclip } from "lucide-react";
import { AnimatedCounter } from "./animated-counter";
import { Confetti } from "./confetti";
import { StatusStepper } from "./status-stepper";
import { Header } from "./header";
import { useToast } from "./toast";
import { IdeaDetailPanel } from "./idea-detail-panel";
import { getAnonToken } from "../lib/anon-token";

type Timeline = { new_status: string; note: string | null; created_at: string }[];

function uuidv4(): string {
  // crypto.randomUUID requires a secure context (HTTPS / localhost).
  // Fall back to a Math.random-based v4 UUID for plain HTTP dev.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}


function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function readableStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CharCounter({ value, max, warnAt = 0.8 }: { value: string; max: number; warnAt?: number }) {
  const len = value.length;
  const ratio = len / max;
  const cls = ratio >= 1 ? "danger" : ratio >= warnAt ? "warn" : "";
  return <div className={`char-counter${cls ? ` ${cls}` : ""}`}>{len} / {max}</div>;
}

function SkeletonCard() {
  return <div className="idea-card skeleton-card skeleton" />;
}

const emptySubmission = { title: "", description: "", category: "Facilities", isAnonymous: true, consent: false };

export function SuggFeed({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"share" | "track">("share");
  const [submission, setSubmission] = useState(emptySubmission);
  const [files, setFiles] = useState<File[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cv_draft_submission");
      if (saved) setSubmission(JSON.parse(saved));
    } catch { /* ignore */ }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    if (submission === emptySubmission) {
      localStorage.removeItem("cv_draft_submission");
    } else {
      localStorage.setItem("cv_draft_submission", JSON.stringify(submission));
    }
  }, [submission, draftLoaded]);

  const [online, setOnline] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [queued, setQueued] = useState(0);
  const [tracking, setTracking] = useState("");
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [trackStatus, setTrackStatus] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);
  const [feed, setFeed] = useState<PublishedSubmission[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [publishedCount, setPublishedCount] = useState(0);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingId, setVotingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [sortBy, setSortBy] = useState<"popular" | "newest" | "oldest">("popular");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<PublishedSubmission | null>(null);
  const [anonToken, setAnonToken] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cv_voted");
      if (raw) setVotedIds(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  const refreshQueue = useCallback(() => drafts.count().then(setQueued), []);
  const refreshFeed = useCallback(async () => {
    try {
      const result = await loadPublishedSubmissions(sortBy, 0, Math.max(page * 18, 18));
      setFeed(result.submissions);
      setPublishedCount(result.count);
      setHasMore(result.count > Math.max(page * 18, 18));
    } catch { toast("Couldn't load the community feed right now.", "error"); }
    finally { setFeedLoading(false); }
  }, [toast, sortBy, page]);

  useEffect(() => {
    setFeedLoading(true);
    loadPublishedSubmissions(sortBy, 0, 18).then(result => {
      setFeed(result.submissions);
      setPublishedCount(result.count);
      setHasMore(result.count > 18);
      setPage(1);
    }).catch(() => toast("Couldn't load the community feed right now.", "error"))
    .finally(() => setFeedLoading(false));
  }, [sortBy, toast]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await loadPublishedSubmissions(sortBy, page * 18, 18);
      setFeed(prev => {
        const existingIds = new Set(prev.map(i => i.id));
        const newItems = result.submissions.filter(i => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
      setHasMore(result.count > (page + 1) * 18);
      setPage(p => p + 1);
    } catch { toast("Couldn't load more ideas.", "error"); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh(); refreshQueue(); // refreshFeed is handled by the sortBy effect on mount
    setAnonToken(getAnonToken());
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, [refreshFeed, refreshQueue]);

  useEffect(() => {
    const id = setInterval(() => { void refreshFeed(); }, 60_000);
    return () => clearInterval(id);
  }, [refreshFeed]);

  const syncOneDraft = useCallback(async () => {
    if (!online || !turnstileToken) return;
    const [draft] = await queuedDrafts(); if (!draft) return;
    await drafts.update(draft.id, { syncStatus: "syncing" });
    try {
      const attachments = await Promise.all(
        draft.attachments.map((a) => fileToPayload(new File([a.blob], a.name, { type: a.type })))
      );
      const result = await submitFeedback({ title: draft.title, description: draft.description, category: draft.category, isAnonymous: draft.isAnonymous, consent: true, attachments, turnstileToken });
      await drafts.delete(draft.id);
      if (result.trackingCode) {
        toast(`Queued draft sent! Save your code: ${result.trackingCode}`, "success");
        try {
          const stored = JSON.parse(localStorage.getItem("cv_my_tracking_codes") || "[]");
          localStorage.setItem("cv_my_tracking_codes", JSON.stringify([...stored, result.trackingCode]));
        } catch { /* ignore */ }
      } else {
        toast("Queued draft sent successfully.", "success");
      }
      await refreshFeed();
    } catch (error) {
      await drafts.update(draft.id, { syncStatus: "failed", attempts: draft.attempts + 1, lastError: error instanceof Error ? error.message : "Sync failed" });
      toast("A queued draft failed to send. Complete the spam check and retry.", "error");
    } finally { setTurnstileToken(""); setCaptchaKey((k) => k + 1); refreshQueue(); }
  }, [online, refreshFeed, refreshQueue, toast, turnstileToken]);

  useEffect(() => { void syncOneDraft(); }, [syncOneDraft]);
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void syncOneDraft(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncOneDraft]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = submission;
    if (body.title.trim().length < 8) { toast("Your title needs to be a bit more specific (at least 8 characters).", "error"); return; }
    if (body.description.trim().length < 20) { toast("Please add a bit more detail in your description.", "error"); return; }
    if (!body.consent) { toast("Please accept the privacy notice before sending.", "error"); return; }
    if (!online) {
      await addDraft({ ...body, consent: true, attachments: files.map((f) => ({ name: f.name, type: f.type, blob: f })) });
      setSubmission(emptySubmission); setFiles([]);
      await refreshQueue();
      toast("Saved on this device. It will send automatically when you're back online.", "info");
      return;
    }
    if (!turnstileToken) { toast("Complete the spam check before sending.", "error"); return; }
    setSubmitting(true);
    try {
      const attachments = await Promise.all(files.map(fileToPayload));
      const result = await submitFeedback({ ...body, consent: true, attachments, turnstileToken });
      if (result.trackingCode) {
        toast(`Submitted! 🎉 Save your private tracking code: ${result.trackingCode}`, "success");
        try {
          const stored = JSON.parse(localStorage.getItem("cv_my_tracking_codes") || "[]");
          localStorage.setItem("cv_my_tracking_codes", JSON.stringify([...stored, result.trackingCode]));
        } catch { /* ignore */ }
      } else {
        toast("Submitted for review. Thank you for speaking up! 🙌", "success");
      }
      setConfetti(true);
      setTimeout(() => setConfetti(false), 4000);
      setSubmission(emptySubmission); setFiles([]);
      setTurnstileToken(""); setCaptchaKey((k) => k + 1);
      await refreshFeed();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't send that right now. Please try again.", "error");
    } finally { setSubmitting(false); }
  }

  async function findSubmission(event: FormEvent) {
    event.preventDefault();
    if (!tracking.trim()) return;
    setTrackBusy(true); setTimeline([]); setTrackStatus("");
    try {
      const result = await lookupTrackingCode(tracking.trim().toUpperCase());
      setTrackStatus(result.status ?? "");
      setTimeline(result.timeline ?? []);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't look up that code.", "error");
    } finally { setTrackBusy(false); }
  }

  async function handleVote(id: string) {
    if (votingId) return; // prevent double-fire during inflight call
    const isUnvote = votedIds.has(id);

    // ── Instant UI update (fire-and-forget optimism) ──────────────
    const nextVotedIds = new Set(votedIds);
    if (isUnvote) { nextVotedIds.delete(id); } else { nextVotedIds.add(id); }
    setVotedIds(nextVotedIds);
    localStorage.setItem("cv_voted", JSON.stringify([...nextVotedIds]));
    setFeed((cur) => cur.map((item) =>
      item.id === id
        ? { ...item, vote_count: Math.max(0, item.vote_count + (isUnvote ? -1 : 1)) }
        : item
    ));

    // ── Background sync ───────────────────────────────────────────
    setVotingId(id); // lock only to prevent rapid double-click; no visual delay
    try {
      const { voteCount } = await voteSubmission(id, getAnonToken());
      // Sync server's authoritative count (should match optimistic)
      setFeed((cur) => cur.map((item) => item.id === id ? { ...item, vote_count: voteCount } : item));
    } catch (error) {
      // Revert everything on network/server failure
      setVotedIds(new Set(votedIds)); // closure captures original state ✓
      setFeed((cur) => cur.map((item) =>
        item.id === id
          ? { ...item, vote_count: Math.max(0, item.vote_count + (isUnvote ? 1 : -1)) }
          : item
      ));
      localStorage.setItem("cv_voted", JSON.stringify([...votedIds]));
      toast(error instanceof Error ? error.message : "Couldn't record your vote.", "error");
    } finally { setVotingId(null); }
  }

  const ALL_CATS = ["All", "Facilities", "Learning", "Safety", "Student life", "Other"];
  const filtered = feed.filter((item) => {
    const matchCat = filterCat === "All" || item.categories?.name === filterCat;
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <>
      <Confetti trigger={confetti} />
      <Header />
      <main>
        {/* ── Hero ── */}
        <section className="hero" id="top">
          <div className="hero-copy">
            <p className="eyebrow">YOUR SCHOOL. YOUR VOICE.</p>
            <h1>Small ideas can make a real difference.</h1>
            <p className="lede">Share feedback safely, follow its progress, and see the improvements your community is shaping.</p>
            <div className="pills">
              <span><Lock size={13} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 5 }} />Anonymous option</span>
              <span><BellRing size={13} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 5 }} />Updates you can follow</span>
              <span><CheckCircle size={13} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 5 }} />Reviewed by your school</span>
            </div>
          </div>
          <aside className="impact">
            <p>Community impact</p>
            <strong><AnimatedCounter value={publishedCount} /></strong>
            <span>ideas published so far</span>
            <hr />
            <b><AnimatedCounter value={queued} /></b>
            <span>draft{queued === 1 ? "" : "s"} queued on this device</span>
          </aside>
        </section>

        {/* ── Workspace ── */}
        <section className="workspace">
          <div className="tabs">
            <button id="tab-share" className={mode === "share" ? "active" : ""} onClick={() => setMode("share")}>
              Share feedback
            </button>
            <button id="tab-track" className={mode === "track" ? "active" : ""} onClick={() => setMode("track")}>
              Track submission
            </button>
          </div>

          {mode === "share" ? (
            <form className="card" onSubmit={submit} noValidate>
              <div className="form-head">
                <div>
                  <h2>What would you like to improve?</h2>
                  <p>Be constructive and avoid including personal or sensitive information.</p>
                </div>
                <span className={`online-badge ${online ? "online" : "offline"}`}>
                  {online ? "● Online" : "◌ Offline — will queue"}
                </span>
              </div>

              <div className="field">
                <label>Category</label>
                <CategoryPicker value={submission.category} onChange={(cat) => setSubmission((c) => ({ ...c, category: cat }))} />
              </div>

              <div className="field">
                <label htmlFor="title-input">Short title</label>
                <input
                  id="title-input"
                  value={submission.title}
                  onChange={(e) => setSubmission((c) => ({ ...c, title: e.target.value }))}
                  maxLength={120}
                  placeholder="e.g. Add benches near the science building"
                />
                <CharCounter value={submission.title} max={120} warnAt={0.75} />
              </div>

              <div className="field">
                <label htmlFor="desc-input">Tell us more</label>
                <textarea
                  id="desc-input"
                  value={submission.description}
                  onChange={(e) => setSubmission((c) => ({ ...c, description: e.target.value }))}
                  maxLength={2000}
                  placeholder="What is happening, who is affected, and what change would help?"
                />
                <CharCounter value={submission.description} max={2000} warnAt={0.8} />
              </div>

              <div className="field">
                <label>Attachments <span className="field-hint">Optional · up to 3 images or PDFs, 5 MB each</span></label>
                <FileDropzone
                  files={files}
                  onChange={setFiles}
                  onError={(msg) => toast(msg, "error")}
                />
              </div>

              <div className="switch-row">
                <input
                  type="checkbox"
                  id="anonymous-toggle"
                  checked={submission.isAnonymous}
                  onChange={(e) => setSubmission((c) => ({ ...c, isAnonymous: e.target.checked }))}
                />
                <div>
                  <div className="sw-label">Submit anonymously</div>
                  <div className="sw-hint">
                    {submission.isAnonymous
                      ? "Your name won't be attached. Save the tracking code shown after submitting."
                      : "Sign in is required for account-linked updates."}
                  </div>
                </div>
              </div>

              <div className="consent-row">
                <input
                  type="checkbox"
                  id="consent-check"
                  checked={submission.consent}
                  onChange={(e) => setSubmission((c) => ({ ...c, consent: e.target.checked }))}
                />
                <label htmlFor="consent-check" style={{ margin: 0, fontWeight: 400, fontSize: 13, color: "var(--muted)" }}>
                  I understand what is stored: my feedback, optional files, status history, and either a private tracking hash or my signed-in account.
                </label>
              </div>

              <TurnstileWidget key={captchaKey} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />

              <button className="btn-primary" type="submit" disabled={submitting || !submission.consent}>
                {submitting ? "Sending…" : <><Send size={15} strokeWidth={2} />Send for review</>}
              </button>
            </form>
          ) : (
            <form className="card" onSubmit={findSubmission}>
              <h2>Check on your feedback</h2>
              <p style={{ marginTop: 8 }}>Enter the private tracking code shown after an anonymous submission.</p>

              <div className="field">
                <label htmlFor="tracking-input">Tracking code</label>
                <input
                  id="tracking-input"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value.toUpperCase())}
                  placeholder="e.g. CV-ABCDEF1234…"
                  autoCapitalize="characters"
                />
              </div>

              <button className="btn-primary" type="submit" disabled={trackBusy}>
                {trackBusy ? "Looking up…" : <><ArrowRight size={15} strokeWidth={2} />Check status</>}
              </button>

              {trackStatus && (
                <>
                  <StatusStepper status={trackStatus} />
                  {timeline.length > 0 && (
                    <ol className="timeline" aria-label="Status history">
                      {timeline.map((entry) => (
                        <li key={entry.created_at}>
                          <div>
                            <strong>{readableStatus(entry.new_status)}</strong>
                            <span>{new Date(entry.created_at).toLocaleString()}</span>
                            {entry.note && <p>{entry.note}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </form>
          )}
        </section>

        {/* ── Feed ── */}
        <section className="feed" id="feed">
          <div className="feed-header">
            <div>
              <p className="eyebrow">OPEN IDEAS</p>
              <h2>What the community is talking about</h2>
            </div>
            <a className="feed-cta" href="#top" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Share your own idea <ArrowRight size={14} strokeWidth={2} /></a>
          </div>

          <div className="feed-controls">
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
                  background: "var(--bg)", fontSize: 14, color: "var(--ink)", cursor: "pointer",
                  outline: "none"
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

          <div className="idea-grid">
            {feedLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : filtered.length === 0 ? (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px 0", color: "var(--muted)" }}>
                <MessageSquare size={40} strokeWidth={1.25} style={{ margin: '0 auto 12px', opacity: .4 }} />
                <p>No ideas match your search. <button className="filter-chip active" onClick={() => { setSearch(""); setFilterCat("All"); }}>Clear filters</button></p>
              </div>
            ) : (
              filtered.map((item) => (
                <article
                  key={item.id}
                  className="idea-card clickable"
                  onClick={() => setSelectedIdea(item)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open details for: ${item.title}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedIdea(item); } }}
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
                      onClick={(e) => { e.stopPropagation(); handleVote(item.id); }}
                      disabled={votingId === item.id}
                      aria-label={votedIds.has(item.id) ? "Remove support" : `Support this idea`}
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

          {hasMore && filtered.length > 0 && !search && filterCat === "All" && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button
                className="btn-ghost"
                onClick={loadMore}
                disabled={loadingMore}
                style={{ padding: "8px 24px" }}
              >
                {loadingMore ? "Loading…" : "Load more ideas"}
              </button>
            </div>
          )}
        </section>

        <footer className="site-footer">
          SuggFeed <span>•</span> A respectful space for constructive feedback
          <span>•</span> <a href="/admin" className="admin-link">Staff Portal</a>
        </footer>
      </main>

      {selectedIdea && (() => {
          const liveIdea = feed.find((f) => f.id === selectedIdea.id) ?? selectedIdea;
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
