"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };
type ToastCtx = { toast: (message: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx>({ toast: () => {} });
export function useToast() { return useContext(Ctx); }

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  info:    Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4500);
  }, []);

  function dismiss(id: number) {
    const el = document.getElementById(`toast-${id}`);
    if (el) {
      el.classList.add("leaving");
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 200);
    } else {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }
  }

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div key={t.id} id={`toast-${t.id}`} className={`toast ${t.type}`} role="alert">
              <Icon className="toast-icon" size={18} strokeWidth={2} />
              <span className="toast-body">{t.message}</span>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
