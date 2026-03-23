// SP5 Enhancement 4: Consolidated keyboard shortcuts for live meeting overlay.
// Single-key shortcuts (B, S, K, M) work outside inputs; Escape always works;
// Ctrl+B and Ctrl+Shift+L are carried over from their previous individual handlers.

import { useEffect } from "react";
import { useMeetingStore } from "../stores/meetingStore";

interface ShortcutActions {
  addBookmark: () => void;
  toggleStats: () => void;
  toggleBookmarks: () => void;
  toggleMute: () => void;
  closeAllPanels: () => void;
  toggleDevLog: () => void;
}

export function useMeetingShortcuts(actions: ShortcutActions) {
  const isRecording = useMeetingStore((s) => s.isRecording);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isRecording) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Escape always works (even in inputs) — close all panels
      if (e.key === "Escape") {
        actions.closeAllPanels();
        return;
      }

      // Ctrl+B: bookmark (keep existing shortcut)
      if (e.ctrlKey && e.key === "b" && !e.shiftKey && !e.altKey) {
        if (isInput) return;
        e.preventDefault();
        actions.addBookmark();
        return;
      }

      // Ctrl+Shift+L: dev log (consolidated from OverlayView inline handler)
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        actions.toggleDevLog();
        return;
      }

      // Single-key shortcuts only outside inputs
      if (isInput) return;

      switch (e.key.toLowerCase()) {
        case "b":
          actions.addBookmark();
          break;
        case "s":
          actions.toggleStats();
          break;
        case "k":
          actions.toggleBookmarks();
          break;
        case "m":
          actions.toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecording, actions]);
}
