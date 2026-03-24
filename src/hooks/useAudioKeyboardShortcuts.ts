import { useEffect } from "react";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";

const INTERACTIVE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useAudioKeyboardShortcuts() {
  const audioElement = useAudioPlayerStore((s) => s.audioElement);

  useEffect(() => {
    if (!audioElement) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs or focused on buttons
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (INTERACTIVE_TAGS.has(tag)) return;

      const store = useAudioPlayerStore.getState();

      switch (e.key) {
        case " ":
          e.preventDefault(); // prevent scrolling
          store.toggle();
          break;
        case "ArrowLeft":
          e.preventDefault();
          store.seekToTime(store.currentTimeMs - (e.shiftKey ? 15000 : 5000));
          break;
        case "ArrowRight":
          e.preventDefault();
          store.seekToTime(store.currentTimeMs + (e.shiftKey ? 15000 : 5000));
          break;
        case "[":
          e.preventDefault();
          store.cycleSpeed("down");
          break;
        case "]":
          e.preventDefault();
          store.cycleSpeed("up");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioElement]);
}
