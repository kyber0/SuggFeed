"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  X, Send, ArrowLeft, ArrowRight,
  Building2, BookOpen, ShieldCheck, PartyPopper, Lightbulb,
  Paperclip, EyeOff, Eye, Check,
} from "lucide-react";
import { useSubmitIdea } from "./submit-idea-context";
import { useToast } from "./toast";
import { fileToPayload, submitFeedback } from "../lib/feedback-api";
import { addDraft } from "../lib/offline-queue";
import { FileDropzone } from "./file-dropzone";
import { TurnstileWidget } from "./turnstile-widget";
import { Confetti } from "./confetti";

/* ── Types ── */
const CATEGORIES = [
  { id: "Facilities",   icon: Building2,   label: "Facilities",   hint: "Buildings, rooms, amenities" },
  { id: "Learning",     icon: BookOpen,    label: "Learning",     hint: "Courses, faculty, resources" },
  { id: "Safety",       icon: ShieldCheck, label: "Safety",       hint: "Security, lighting, health" },
  { id: "Student life", icon: PartyPopper, label: "Student Life", hint: "Events, clubs, social spaces" },
  { id: "Other",        icon: Lightbulb,   label: "Other",        hint: "Any innovative suggestion" },
] as const;

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1 as Step, label: "Category" },
  { num: 2 as Step, label: "Details" },
  { num: 3 as Step, label: "Review" },
];

/* ── Char counter ── */
function CharCounter({ value, max, warnAt = 0.8 }: { value: string; max: number; warnAt?: number }) {
  const len = value.length;
  const ratio = len / max;
  const cls = ratio >= 1 ? "danger" : ratio >= warnAt ? "warn" : "";
  return <div className={`char-counter${cls ? ` ${cls}` : ""}`}>{len} / {max}</div>;
}

/* ── Initial state ── */
const emptySubmission = {
  title: "",
  description: "",
  category: "",
  isAnonymous: true,
  consent: false,
};

/* ── Main component ── */
export function SubmitIdeaPanel({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const { isOpen, closeSubmitPanel } = useSubmitIdea();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [online, setOnline] = useState(true);
  const [submission, setSubmission] = useState(emptySubmission);
  const [files, setFiles] = useState<File[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confetti, setConfetti] = useState(false);

  /* ── Draft persistence ── */
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem("sf_draft_submission") ??
        localStorage.getItem("cv_draft_submission");
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

  useEffect(() => {
    if (!draftLoaded) return;
    if (submission === emptySubmission) {
      localStorage.removeItem("sf_draft_submission");
      localStorage.removeItem("cv_draft_submission");
    } else {
      localStorage.setItem("sf_draft_submission", JSON.stringify(submission));
    }
  }, [submission, draftLoaded]);

  /* ── Body scroll lock ── */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setStep(1); // reset step when closed
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  /* ── Step navigation ── */
  function goNext() {
    if (step === 1) {
      if (!submission.category) {
        toast("Pick a category to continue.", "error");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (submission.title.trim().length < 8) {
        toast("Your title needs to be a bit more specific (at least 8 characters).", "error");
        return;
      }
      if (submission.description.trim().length < 20) {
        toast("Please add a bit more detail in your description.", "error");
        return;
      }
      setStep(3);
    }
  }

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  /* ── Final submit ── */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = submission;
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
        toast(`Submitted! 🎉 Save your tracking code: ${result.trackingCode}`, "success");
        try {
          const stored = JSON.parse(
            localStorage.getItem("sf_my_tracking_codes") ||
            localStorage.getItem("cv_my_tracking_codes") ||
            "[]"
          );
          localStorage.setItem("sf_my_tracking_codes", JSON.stringify([...stored, result.trackingCode]));
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

  const selectedCat = CATEGORIES.find((c) => c.id === submission.category);

  return (
    <>
      <Confetti trigger={confetti} />
      <div className="panel-overlay" onClick={closeSubmitPanel} aria-hidden="true" />

      <aside className="detail-panel sip-panel" role="dialog" aria-modal="true" aria-label="Share feedback">

        {/* ── Header ── */}
        <div className="sip-header">
          <div className="sip-header-left">
            <div className="sip-brand-dot" aria-hidden="true" />
            <div>
              <div className="sip-header-title">Share your idea</div>
              {online
                ? <div className="sip-header-sub sip-online">● Online</div>
                : <div className="sip-header-sub sip-offline">◌ Offline — will queue</div>}
            </div>
          </div>
          <button className="panel-close-btn" onClick={closeSubmitPanel} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Stepper ── */}
        <div className="sip-stepper" role="list">
          {STEPS.map(({ num, label }, i) => {
            const status = step === num ? "active" : step > num ? "done" : "upcoming";
            return (
              <div key={num} className="sip-step-item" role="listitem">
                <div className={`sip-step-dot sip-step-${status}`} aria-current={step === num ? "step" : undefined}>
                  {status === "done" ? <Check size={11} strokeWidth={3} /> : num}
                </div>
                <span className={`sip-step-label sip-step-${status}`}>{label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`sip-step-line${step > num ? " sip-step-line--done" : ""}`} aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Body ── */}
        <div className="sip-body">

          {/* ══ STEP 1: Category ══ */}
          {step === 1 && (
            <div className="sip-step-content">
              <div className="sip-step-intro">
                <h2 className="sip-step-heading">What area does your idea relate to?</h2>
                <p className="sip-step-desc">Choose the category that best fits your suggestion.</p>
              </div>

              <div className="sip-cat-grid" role="radiogroup" aria-label="Category">
                {CATEGORIES.map(({ id, icon: Icon, label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={submission.category === id}
                    className={`sip-cat-card${submission.category === id ? " sip-cat-card--selected" : ""}`}
                    onClick={() => setSubmission((c) => ({ ...c, category: id }))}
                  >
                    <div className="sip-cat-icon-wrap" aria-hidden="true">
                      <Icon size={26} strokeWidth={1.75} />
                    </div>
                    <span className="sip-cat-label">{label}</span>
                    <span className="sip-cat-hint">{hint}</span>
                  </button>
                ))}
              </div>

              <div className="sip-actions sip-actions--single">
                <button className="sip-btn-next" type="button" onClick={goNext} disabled={!submission.category}>
                  Continue <ArrowRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 2: Details ══ */}
          {step === 2 && (
            <div className="sip-step-content">
              <div className="sip-step-intro">
                {selectedCat && (
                  <div className="sip-selected-cat-pill">
                    <selectedCat.icon size={13} strokeWidth={2} />
                    {selectedCat.label}
                  </div>
                )}
                <h2 className="sip-step-heading">Describe your idea</h2>
                <p className="sip-step-desc">Be specific and constructive. Avoid personal or sensitive information.</p>
              </div>

              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="sip-title">Short title</label>
                <input
                  id="sip-title"
                  value={submission.title}
                  onChange={(e) => setSubmission((c) => ({ ...c, title: e.target.value }))}
                  maxLength={120}
                  placeholder="e.g. Add benches near the science building"
                  autoFocus
                />
                <CharCounter value={submission.title} max={120} warnAt={0.75} />
              </div>

              <div className="field">
                <label htmlFor="sip-desc">Tell us more</label>
                <textarea
                  id="sip-desc"
                  value={submission.description}
                  onChange={(e) => setSubmission((c) => ({ ...c, description: e.target.value }))}
                  maxLength={2000}
                  placeholder="What is happening, who is affected, and what change would help?"
                  style={{ height: 160 }}
                />
                <CharCounter value={submission.description} max={2000} warnAt={0.8} />
              </div>

              <div className="sip-actions">
                <button className="sip-btn-back" type="button" onClick={goBack}>
                  <ArrowLeft size={15} strokeWidth={2.5} /> Back
                </button>
                <button className="sip-btn-next" type="button" onClick={goNext}>
                  Continue <ArrowRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 3: Review & Submit ══ */}
          {step === 3 && (
            <form onSubmit={submit} noValidate>
              <div className="sip-step-content">
                <div className="sip-step-intro">
                  <h2 className="sip-step-heading">Almost done!</h2>
                  <p className="sip-step-desc">Optionally attach files, then review and send your idea.</p>
                </div>

                {/* Summary card */}
                <div className="sip-summary-card">
                  {selectedCat && (
                    <div className="sip-summary-cat">
                      <selectedCat.icon size={13} strokeWidth={2} />
                      {selectedCat.label}
                    </div>
                  )}
                  <div className="sip-summary-title">{submission.title}</div>
                  <div className="sip-summary-desc">{submission.description}</div>
                </div>

                {/* Attachments */}
                <div className="field">
                  <label>
                    <Paperclip size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />
                    Attachments
                    <span className="field-hint">Optional · up to 3 images or PDFs, 5 MB each</span>
                  </label>
                  <FileDropzone
                    files={files}
                    onChange={setFiles}
                    onError={(msg) => toast(msg, "error")}
                  />
                </div>

                {/* Anonymous toggle */}
                <label className="sip-toggle-row">
                  <div className="sip-toggle-track">
                    <input
                      type="checkbox"
                      id="sip-anonymous"
                      checked={submission.isAnonymous}
                      onChange={(e) => setSubmission((c) => ({ ...c, isAnonymous: e.target.checked }))}
                      style={{ display: "none" }}
                    />
                    <div className={`sip-toggle-thumb${submission.isAnonymous ? " sip-toggle-on" : ""}`}
                      onClick={() => setSubmission((c) => ({ ...c, isAnonymous: !c.isAnonymous }))}
                      role="switch"
                      aria-checked={submission.isAnonymous}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === " " && setSubmission((c) => ({ ...c, isAnonymous: !c.isAnonymous }))}
                    />
                  </div>
                  <div className="sip-toggle-text">
                    <div className="sip-toggle-label">
                      {submission.isAnonymous ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
                      Submit anonymously
                    </div>
                    <div className="sip-toggle-hint">
                      {submission.isAnonymous
                        ? "Your name won't be attached. Save the tracking code shown after submitting."
                        : "Sign in is required for account-linked updates."}
                    </div>
                  </div>
                </label>

                {/* Consent */}
                <label className="sip-consent-row" htmlFor="sip-consent">
                  <input
                    type="checkbox"
                    id="sip-consent"
                    checked={submission.consent}
                    onChange={(e) => setSubmission((c) => ({ ...c, consent: e.target.checked }))}
                    style={{ accentColor: "var(--navy)", flexShrink: 0 }}
                  />
                  <span>
                    I understand what is stored: my feedback, optional files, status history, and either a private tracking hash or my signed-in account.
                  </span>
                </label>

                {/* Turnstile */}
                <div className="sip-turnstile">
                  <TurnstileWidget key={captchaKey} siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
                </div>

                {/* Actions */}
                <div className="sip-actions">
                  <button className="sip-btn-back" type="button" onClick={goBack}>
                    <ArrowLeft size={15} strokeWidth={2.5} /> Back
                  </button>
                  <button
                    className="sip-btn-submit"
                    type="submit"
                    disabled={submitting || !submission.consent}
                  >
                    {submitting
                      ? <><span className="sip-spinner" />Sending…</>
                      : <><Send size={15} strokeWidth={2} />Send for review</>}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </aside>
    </>
  );
}
