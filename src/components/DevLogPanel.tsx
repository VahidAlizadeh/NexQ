import { useCallback, useEffect, useRef, useState } from "react";
import { useDevLogStore } from "../stores/devLogStore";
import { Copy, ExternalLink, Trash2, X } from "lucide-react";

// For the detached window, we import Tauri's WebviewWindow API
async function openDetachedDevLog() {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    // Check if window already exists
    const existing = await WebviewWindow.getByLabel("devlog");
    if (existing) {
      await existing.setFocus();
      return;
    }
    // Create a new window pointing to the same app with ?view=devlog
    const devUrl = `${window.location.origin}${window.location.pathname}?view=devlog`;
    new WebviewWindow("devlog", {
      url: devUrl,
      title: "NexQ Dev Log",
      width: 700,
      height: 450,
      resizable: true,
      decorations: true,
      alwaysOnTop: false,
      center: true,
    });
  } catch (e) {
    console.error("[DevLog] Failed to open detached window:", e);
  }
}

/** Inline DevLog panel (embedded in OverlayView). */
export function DevLogPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [height, setHeight] = useState(180);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // Mouse drag resize
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    e.preventDefault();
  }, [height]);

  useEffect(() => {
    if (!open) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging UP increases height (startY - currentY)
      const delta = startY.current - e.clientY;
      setHeight(Math.max(80, Math.min(500, startH.current + delta)));
    };
    const onMouseUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="shrink-0 flex flex-col border-t border-border/30 bg-card/95" style={{ height }}>
      {/* Resize handle at top */}
      <div
        onMouseDown={onMouseDown}
        className="h-1.5 shrink-0 cursor-ns-resize hover:bg-primary/20 transition-colors flex items-center justify-center"
        title="Drag to resize"
      >
        <div className="h-0.5 w-8 rounded-full bg-border/30" />
      </div>
      <DevLogContent
        onClose={onClose}
        onDetach={() => {
          openDetachedDevLog();
          onClose();
        }}
      />
    </div>
  );
}

/** Full-page DevLog for the detached window. */
export function DevLogFullPage() {
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <DevLogContent />
    </div>
  );
}

/** Shared content used by both inline panel and detached window. */
function DevLogContent({
  onClose,
  onDetach,
}: {
  onClose?: () => void;
  onDetach?: () => void;
} = {}) {
  const entries = useDevLogStore((s) => s.entries);
  const clear = useDevLogStore((s) => s.clear);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  // Escape to close (inline only)
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCopyAll = useCallback(() => {
    const text = entries
      .map(
        (e) =>
          `[${e.timestamp.toLocaleTimeString()}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
  }, [entries]);

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/15 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Dev Log
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] tabular-nums text-muted-foreground/30">
            {entries.length} entries
          </span>
          <button
            onClick={handleCopyAll}
            className="rounded p-1 text-muted-foreground/40 hover:bg-accent/50 hover:text-foreground"
            title="Copy all"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={clear}
            className="rounded p-1 text-muted-foreground/40 hover:bg-accent/50 hover:text-foreground"
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {onDetach && (
            <button
              onClick={onDetach}
              className="rounded p-1 text-muted-foreground/40 hover:bg-accent/50 hover:text-foreground"
              title="Open in separate window"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground/40 hover:bg-accent/50 hover:text-foreground"
              title="Close (Esc)"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-1.5 font-mono text-[10px] leading-relaxed"
      >
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[60px] items-center justify-center text-muted-foreground/25">
            Waiting for STT events...
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex gap-1.5 rounded px-1 py-0.5 hover:bg-accent/20"
            >
              <span className="shrink-0 tabular-nums text-muted-foreground/30">
                {entry.timestamp.toLocaleTimeString()}
              </span>
              <span
                className={`shrink-0 font-semibold uppercase ${
                  entry.level === "error"
                    ? "text-red-400"
                    : entry.level === "warn"
                      ? "text-amber-400"
                      : "text-blue-400"
                }`}
              >
                {entry.level.substring(0, 3)}
              </span>
              <span className="shrink-0 text-muted-foreground/40">
                [{entry.source}]
              </span>
              <span className="break-all text-foreground/80">
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
