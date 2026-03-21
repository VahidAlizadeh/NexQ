import { useToastStore } from "../stores/toastStore";
import type { Toast as ToastData } from "../stores/toastStore";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colorMap = {
  success:
    "border-success/30 bg-success/10 text-success",
  error:
    "border-destructive/30 bg-destructive/10 text-destructive",
  info:
    "border-info/30 bg-info/10 text-info",
};

const iconColorMap = {
  success: "text-success",
  error: "text-destructive",
  info: "text-info",
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const Icon = iconMap[toast.type];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg transition-all duration-300 animate-in slide-in-from-right ${colorMap[toast.type]}`}
      style={{ maxWidth: 360 }}
    >
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColorMap[toast.type]}`} />
      <p className="flex-1 text-xs font-medium leading-relaxed">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Toast container -- renders in bottom-right of the viewport.
 * Mount once at the app root.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      aria-label="Notifications"
      aria-atomic="true"
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
