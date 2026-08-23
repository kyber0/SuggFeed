"use client";
import { Check, Circle, XCircle } from "lucide-react";

const STEPS = [
  { key: "pending",     label: "Submitted" },
  { key: "approved",    label: "Approved" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved",    label: "Resolved" },
];
const ORDER = ["pending", "approved", "in_progress", "resolved", "rejected"];

export function StatusStepper({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <div className="status-stepper" style={{ justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--error)", padding: "8px 0" }}>
          <XCircle size={32} strokeWidth={1.5} style={{ margin: "0 auto 8px" }} />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Not approved</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            This submission was reviewed and not moved forward.
          </div>
        </div>
      </div>
    );
  }

  const currentIndex = ORDER.indexOf(status);

  return (
    <div className="status-stepper">
      {STEPS.map((step, i) => {
        const stepIndex = ORDER.indexOf(step.key);
        const done   = stepIndex < currentIndex;
        const active = stepIndex === currentIndex;
        return (
          <div key={step.key} className={`step${done ? " done" : ""}${active ? " active" : ""}`}>
            <div className="step-dot">
              {done
                ? <Check size={14} strokeWidth={2.5} />
                : active
                  ? <Circle size={8} fill="currentColor" strokeWidth={0} />
                  : null}
            </div>
            <div className="step-label">{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}
