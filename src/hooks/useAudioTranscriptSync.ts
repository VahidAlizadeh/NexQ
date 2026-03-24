// Syncs audio playback position to transcript segments.
// - Finds the active segment based on currentTimeMs
// - Updates activeSegmentId in the audio player store
// - Auto-scrolls to the active segment (pauses on manual wheel scroll,
//   re-enables after 5 seconds of inactivity)

import { useEffect, useRef } from "react";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";
import type { TranscriptSegment } from "@/lib/types";

const MANUAL_SCROLL_COOLDOWN_MS = 5000;

export function useAudioTranscriptSync(
  segments: TranscriptSegment[],
  meetingStartMs: number,
  recordingOffsetMs: number,
  segmentRefs?: React.MutableRefObject<Map<string, HTMLElement>>
): void {
  // Use granular selectors to avoid unnecessary re-renders
  const currentTimeMs = useAudioPlayerStore((s) => s.currentTimeMs);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const activeSegmentId = useAudioPlayerStore((s) => s.activeSegmentId);
  const setActiveSegmentId = useAudioPlayerStore((s) => s.setActiveSegmentId);

  // Refs for manual scroll state — not Zustand state to avoid re-renders
  const autoScrollEnabledRef = useRef(true);
  const manualScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Active segment tracking ---
  useEffect(() => {
    if (!isPlaying || segments.length === 0) return;

    // Find the last segment whose adjusted timestamp <= currentTimeMs
    let activeId: string | null = null;
    for (let i = 0; i < segments.length; i++) {
      const adjustedMs =
        segments[i].timestamp_ms - meetingStartMs - recordingOffsetMs;
      if (adjustedMs <= currentTimeMs) {
        activeId = segments[i].id;
      } else {
        // Segments are in ascending time order — can stop early
        break;
      }
    }

    setActiveSegmentId(activeId);
  }, [
    currentTimeMs,
    isPlaying,
    segments,
    meetingStartMs,
    recordingOffsetMs,
    setActiveSegmentId,
  ]);

  // --- Auto-scroll when active segment changes ---
  useEffect(() => {
    if (!isPlaying) return;
    if (!segmentRefs) return;
    if (!activeSegmentId) return;
    if (!autoScrollEnabledRef.current) return;

    const el = segmentRefs.current.get(activeSegmentId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSegmentId, isPlaying, segmentRefs]);

  // --- Manual scroll detection: pause auto-scroll, re-enable after cooldown ---
  useEffect(() => {
    function handleWheel() {
      autoScrollEnabledRef.current = false;

      if (manualScrollTimerRef.current) {
        clearTimeout(manualScrollTimerRef.current);
      }

      manualScrollTimerRef.current = setTimeout(() => {
        autoScrollEnabledRef.current = true;
        manualScrollTimerRef.current = null;
      }, MANUAL_SCROLL_COOLDOWN_MS);
    }

    window.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (manualScrollTimerRef.current) {
        clearTimeout(manualScrollTimerRef.current);
      }
    };
  }, []);

  // --- Cleanup timer on unmount ---
  // Per spec: keep activeSegmentId at its last value on unmount/pause — no explicit clear.
  useEffect(() => {
    return () => {
      if (manualScrollTimerRef.current) {
        clearTimeout(manualScrollTimerRef.current);
      }
    };
  }, []);
}
