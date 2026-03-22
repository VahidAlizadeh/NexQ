// Task 16: Bookmark hotkey hook
// Listens for Ctrl+B keydown while recording and adds a bookmark at current offset.
// Returns an addBookmarkAtNow() function for manual invocation (toolbar button).

import { useEffect, useCallback } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { showToast } from "../stores/toastStore";
import { formatDuration } from "../lib/utils";

export function useBookmarkHotkey(): () => void {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);

  const addBookmarkAtNow = useCallback(() => {
    if (!isRecording || !meetingStartTime) return;
    const offsetMs = Date.now() - meetingStartTime;
    addBookmark(offsetMs);
    showToast(`Bookmark added at ${formatDuration(offsetMs)}`, "success");
  }, [isRecording, meetingStartTime, addBookmark]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "b" && !e.shiftKey && !e.altKey) {
        // Only fire when recording; don't fire in input/textarea elements
        const target = e.target as HTMLElement;
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
        if (!isRecording || isInput) return;
        e.preventDefault();
        addBookmarkAtNow();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecording, addBookmarkAtNow]);

  return addBookmarkAtNow;
}
