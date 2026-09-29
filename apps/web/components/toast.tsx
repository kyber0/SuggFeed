"use client";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  X,
  AlertCircle,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
export type ToastType = "success" | "error" | "info" | "warning";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
};

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmRequest = ConfirmOptions & {
  id: number;
  resolve: (value: boolean) => void;
};

type ToastCtx = {
  toast: (message: string, type?: ToastType, title?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

/* ─── Context ────────────────────────────────────────────────────────────── */
const Ctx = createContext<ToastCtx>({
  toast: () => {},
  confirm: async () => false,
});

export function useToast() {
  return useContext(Ctx);
}

/* ─── Icon map ───────────────────────────────────────────────────────────── */
const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const TOAST_DURATION = 4800;

/* ─── Provider ───────────────────────────────────────────────────────────── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirms, setConfirms] = useState<ConfirmRequest[]>([]);
  const counter = useRef(0);

  /* Toast */
  const toast = useCallback(
    (message: string, type: ToastType = "info", title?: string) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, type, title }]);
      setTimeout(() => dismiss(id), TOAST_DURATION);
    },
    []
  );

  function dismiss(id: number) {
    const el = document.getElementById(`toast-${id}`);
    if (el) {
      el.classList.add("toast--leaving");
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        260
      );
    } else {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }
  }

  /* Confirm */
  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = ++counter.current;
      setConfirms((prev) => [...prev, { ...options, id, resolve }]);
    });
  }, []);

  function resolveConfirm(id: number, value: boolean) {
    setConfirms((prev) => {
      const req = prev.find((c) => c.id === id);
      req?.resolve(value);
      return prev.filter((c) => c.id !== id);
    });
  }

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      {/* ── Toast stack ──────────────────────────────────────────────── */}
      <div className="toast-region" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              id={`toast-${t.id}`}
              className={`sf-toast sf-toast--${t.type}`}
              role="alert"
              aria-live="polite"
            >
              {/* Progress bar */}
              <div className="sf-toast__progress" />

              {/* Icon */}
              <span className="sf-toast__icon">
                <Icon size={18} strokeWidth={2.2} />
              </span>

              {/* Body */}
              <div className="sf-toast__body">
                {t.title && (
                  <div className="sf-toast__title">{t.title}</div>
                )}
                <div className="sf-toast__message">{t.message}</div>
              </div>

              {/* Close */}
              <button
                className="sf-toast__close"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Confirm dialogs ──────────────────────────────────────────── */}
      {confirms.map((c) => (
        <ConfirmDialog
          key={c.id}
          {...c}
          onConfirm={() => resolveConfirm(c.id, true)}
          onCancel={() => resolveConfirm(c.id, false)}
        />
      ))}
    </Ctx.Provider>
  );
}

/* ─── Confirm Dialog Component ───────────────────────────────────────────── */
function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="sf-dialog-backdrop" role="dialog" aria-modal="true">
      <div className="sf-dialog">
        {/* Icon header */}
        <div className={`sf-dialog__icon-wrap ${danger ? "sf-dialog__icon-wrap--danger" : "sf-dialog__icon-wrap--info"}`}>
          {danger ? (
            <AlertCircle size={26} strokeWidth={2} />
          ) : (
            <Info size={26} strokeWidth={2} />
          )}
        </div>

        {/* Content */}
        <div className="sf-dialog__body">
          {title && <h2 className="sf-dialog__title">{title}</h2>}
          <p className="sf-dialog__message">{message}</p>
        </div>

        {/* Actions */}
        <div className="sf-dialog__actions">
          <button className="sf-dialog__btn sf-dialog__btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`sf-dialog__btn ${danger ? "sf-dialog__btn--danger" : "sf-dialog__btn--confirm"}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
