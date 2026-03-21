import { useState, useEffect, useCallback, useRef } from "react";
import { useToastStore } from "../stores/toastStore";
import type { Toast as ToastData } from "../stores/toastStore";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

/** Left accent border color per type */
const accentMap = {
  success: "border-l-[hsl(var(--success))]",
  error: "border-l-[hsl(var(--destructive))]",
  info: "border-l-[hsl(var(--info))]",
};

/** Icon circle background + icon color */
const iconBgMap = {
  success: "bg-success/20 text-success",
  error: "bg-destructive/20 text-destructive",
  info: "bg-info/20 text-info",
};

/** Entrance animation for the icon */
const iconAnimMap = {
  success: "toast-icon-pop",
  error: "toast-icon-shake",
  info: "toast-icon-pop",
};

/** Progress bar color */
const progressMap = {
  success: "bg-success/50",
  error: "bg-destructive/50",
  info: "bg-info/50",
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const Icon = iconMap[toast.type];
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-dismiss with exit animation (component-driven)
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 280);
    }, 4000);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss]);

  const handleDismiss = useCallback(() => {
    if (exiting) return;
    clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(onDismiss, 280);
  }, [exiting, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        group relative flex items-start gap-3 overflow-hidden
        rounded-xl border border-border/20 border-l-[3.5px]
        ${accentMap[toast.type]}
        bg-card/90 backdrop-blur-md
        px-4 py-3
        shadow-xl shadow-black/10
        ${exiting ? "toast-exit" : "toast-enter"}
      `}
      style={{ maxWidth: 400, minWidth: 280 }}
    >
      {/* Icon with colored circle background */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBgMap[toast.type]} ${iconAnimMap[toast.type]}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Message */}
      <p className="flex-1 min-w-0 pt-[3px] text-sm font-medium leading-snug text-foreground/90">
        {toast.message}
      </p>

      {/* Dismiss button — visible on hover or always on touch */}
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-lg p-1 text-muted-foreground/30 transition-all duration-150 hover:bg-accent hover:text-foreground/70 group-hover:text-muted-foreground/60"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Progress bar — visual countdown to auto-dismiss */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden">
        <div className={`h-full ${progressMap[toast.type]} toast-progress-bar`} />
      </div>
    </div>
  );
}

/**
 * Toast container — renders in bottom-right of the viewport.
 * Mount once at the app root.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
