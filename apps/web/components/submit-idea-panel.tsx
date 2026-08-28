"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { useSubmitIdea } from "./submit-idea-context";
import { useToast } from "./toast";
import { fileToPayload, submitFeedback } from "../lib/feedback-api";
import { addDraft } from "../lib/offline-queue";
import { CategoryPicker } from "./category-picker";
import { FileDropzone } from "./file-dropzone";
import { TurnstileWidget } from "./turnstile-widget";
import { Confetti } from "./confetti";

function CharCounter({ value, max, warnAt = 0.8 }: { value: string; max: number; warnAt?: number }) {
  const len = value.length;
  const ratio = len / max;
  const cls = ratio >= 1 ? "danger" : ratio >= warnAt ? "warn" : "";
  return <div className={`char-counter${cls ? ` ${cls}` : ""}`}>{len} / {max}</div>;
}

const emptySubmission = { title: "", description: "", category: "Facilities", isAnonymous: true, consent: false };

export function SubmitIdeaPanel({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const { isOpen, closeSubmitPanel } = useSubmitIdea();
  const { toast } = useToast();

  const [online, setOnline] = useState(true);
  const [submission, setSubmission] = useState(emptySubmission);
  const [files, setFiles] = useState<File[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confetti, setConfetti] = useState(false);

  // Load draft from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cv_draft_submission");
      if (saved) setSubmission(JSON.parse(saved));
    } catch { /* ignore */ }
    setDraftLoaded(true);
    setOnline(navigator.onLine);
    
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Save draft continuously
  useEffect(() => {
    if (!draftLoaded) return;
    if (submission === emptySubmission) {
      localStorage.removeItem("cv_draft_submission");
    } else {
      localStorage.setItem("cv_draft_submission", JSON.stringify(submission));
    }
  }, [submission, draftLoaded]);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = submission;
    if (body.title.trim().length < 8) { toast("Your title needs to be a bit more specific (at least 8 characters).", "error"); return; }
    if (body.description.trim().length < 20) { toast("Please add a bit more detail in your description.", "error"); return; }
    if (!body.consent) { toast("Please accept the privacy notice before sending.", "error"); return; }
    
    if (!online) {
      await addDraft({ ...body, consent: true, attachments: files.map((f) => ({ name: f.name, type: f.type, blob: f })) });
      setSubmission(emptySubmission); setFiles([]);
      toast("Saved on this device. It will send automatically when you're back online.", "info");
      closeSubmitPanel();
      return;
    }
    
    if (!turnstileToken) { toast("Complete the spam check before sending.", "error"); return; }
    
    setSubmitting(true);
    try {
      const attachments = await Promise.all(files.map(fileToPayload));
      const result = await submitFeedback({ ...body, consent: true, attachments, turnstileToken });
      
      if (result.trackingCode) {
        toast(`Submitted! 🎉 Save your tracking code: ${result.trackingCode}`, "success", { duration: 6000 });
        try {
          const stored = JSON.parse(localStorage.getItem("cv_my_tracking_codes") || "[]");
          localStorage.setItem("cv_my_tracking_codes", JSON.stringify([...stored, result.trackingCode]));
        } catch { /* ignore */ }
      } else {
        toast("Submitted for review. Thank you for speaking up! 🙌", "success");
      }
      
      setConfetti(true);
      setTimeout(() => {
        setConfetti(false);
        closeSubmitPanel();
      }, 3000);
      
      setSubmission(emptySubmission); setFiles([]);
      setTurnstileToken(""); setCaptchaKey((k) => k + 1);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't send that right now. Please try again.", "error");
    } finally { 
      setSubmitting(false); 
    }
  }

  return (
    <>
      <Confetti trigger={confetti} />
      {/* Backdrop */}
      <div className="panel-overlay" onClick={closeSubmitPanel} aria-hidden="true" />
      
      {/* Panel */}
      <aside className="detail-panel" style={{ width: "100%", maxWidth: "600px", left: "50%", transform: "translateX(-50%)" }} role="dialog" aria-modal="true" aria-label="Share feedback">
        
        <div className="detail-panel-header" style={{ borderBottom: "1px solid var(--line-1)" }}>
          <h2 style={{ fontSize: 18, color: "var(--ink)", fontWeight: 600 }}>Share Feedback</h2>
          <div style={{ marginLeft: "auto" }}>
            <button className="panel-close-btn" onClick={closeSubmitPanel} aria-label="Close">
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="detail-panel-body" style={{ padding: "24px" }}>
          <form onSubmit={submit} noValidate>
            <div className="form-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 16, marginBottom: 4 }}>What would you like to improve?</h2>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>Be constructive and avoid including personal or sensitive information.</p>
              </div>
              <span className={`online-badge ${online ? "online" : "offline"}`} style={{ flexShrink: 0 }}>
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

            <div className="switch-row" style={{ marginTop: 24 }}>
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

            <div style={{ margin: "24px 0" }}>
              <TurnstileWidget key={captchaKey} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" className="btn-ghost" onClick={closeSubmitPanel}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={submitting || !submission.consent}>
                {submitting ? "Sending…" : <><Send size={15} strokeWidth={2} />Send for review</>}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}
