// SP2 Task 3: Standalone BookmarkToast — singleton interactive toast for bookmark creation.
// Triggered via CustomEvent "bookmark-toast-show". One at a time — new bookmark replaces previous.
// Step 1: Confirmation with auto-dismiss timer. Step 2: Optional note input with timer pause.

import { useState, useEffect, useRef, useCallback } from "react";
import { Bookmark, X } from "lucide-react";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { formatDuration } from "../lib/utils";

// -- Custom event helper: dispatch from anywhere to show the toast ---------------

export interface BookmarkToastDetail {
  bookmarkId: string;
  timestampMs: number;
}

export function showBookmarkToast(bookmarkId: string, timestampMs: number) {
  window.dispatchEvent(
    new CustomEvent<BookmarkToastDetail>("bookmark-toast-show", {
      detail: { bookmarkId, timestampMs },
    }),
  );
}

// -- Constants ------------------------------------------------------------------

const TOAST_DURATION_MS = 5000;
const TICK_INTERVAL_MS = 50;

// -- Component ------------------------------------------------------------------

export function BookmarkToast() {
  const [visible, setVisible] = useState(false);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [timestampMs, setTimestampMs] = useState(0);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateBookmarkNote = useBookmarkStore((s) => s.updateBookmarkNote);

  // -- Dismiss ------------------------------------------------------------------

  const dismiss = useCallback(() => {
    setVisible(false);
    setShowNoteInput(false);
    setNoteText("");
    setElapsed(0);
    setBookmarkId(null);
    pausedRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // -- Save note ----------------------------------------------------------------

  const saveNote = useCallback(() => {
    if (bookmarkId && noteText.trim()) {
      updateBookmarkNote(bookmarkId, noteText.trim());
    }
    dismiss();
  }, [bookmarkId, noteText, updateBookmarkNote, dismiss]);

  // -- Listen for custom event --------------------------------------------------

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BookmarkToastDetail>).detail;

      // Reset everything for the new bookmark (singleton — replaces previous)
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      pausedRef.current = false;
      setBookmarkId(detail.bookmarkId);
      setTimestampMs(detail.timestampMs);
      setShowNoteInput(false);
      setNoteText("");
      setElapsed(0);
      setVisible(true);
    };

    window.addEventListener("bookmark-toast-show", handler);
    return () => window.removeEventListener("bookmark-toast-show", handler);
  }, []);

  // -- Auto-dismiss timer with 50ms ticks --------------------------------------

  useEffect(() => {
    if (!visible) return;

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;

      setElapsed((prev) => {
        const next = prev + TICK_INTERVAL_MS;
        if (next >= TOAST_DURATION_MS) {
          // Time's up — dismiss on next frame to avoid setState during render
          setTimeout(dismiss, 0);
          return TOAST_DURATION_MS;
        }
        return next;
      });
    }, TICK_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, dismiss]);

  // -- Autofocus input when note mode activates ---------------------------------

  useEffect(() => {
    if (showNoteInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNoteInput]);

  // -- Progress fraction (0 → 1) -----------------------------------------------

  const progress = Math.min(elapsed / TOAST_DURATION_MS, 1);

  if (!visible) return null;

  const timeLabel = formatDuration(timestampMs);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <div className="relative overflow-hidden rounded-lg border border-border/60 bg-card shadow-lg">
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-0.5 bg-emerald-500/40 transition-none" style={{ width: `${(1 - progress) * 100}%` }} />

        <div className="p-3">
          {/* Step 1: Confirmation row */}
          <div className="flex items-center gap-2">
            {/* Green checkmark icon */}
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <Bookmark className="h-3 w-3 text-emerald-500 fill-current" />
            </div>

            {/* Label */}
            <span className="flex-1 text-sm font-medium text-foreground">
              Bookmarked{" "}
              <span className="tabular-nums text-muted-foreground">{timeLabel}</span>
            </span>

            {/* + Note button (only when note input is hidden) */}
            {!showNoteInput && (
              <button
                onClick={() => setShowNoteInput(true)}
                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/10"
              >
                + Note
              </button>
            )}

            {/* Dismiss X */}
            <button
              onClick={dismiss}
              className="shrink-0 rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Step 2: Note input (expanded) */}
          {showNoteInput && (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onFocus={() => { pausedRef.current = true; }}
                onBlur={() => { pausedRef.current = false; }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveNote();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    dismiss();
                  }
                }}
                placeholder="Add a note..."
                className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
              />
              <button
                onClick={saveNote}
                className="shrink-0 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/25"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
