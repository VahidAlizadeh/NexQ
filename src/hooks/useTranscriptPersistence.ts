import { useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { appendTranscriptSegment } from "../lib/ipc";

const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Hook that persists transcript segments to SQLite incrementally.
 * Every 30 seconds during an active meeting, it flushes any new
 * (not-yet-persisted) transcript segments to the database.
 * Tracks which segments have been persisted by index.
 */
export function useTranscriptPersistence() {
  const activeMeeting = useMeetingStore((s) => s.activeMeeting);
  const lastPersistedIndex = useMeetingStore((s) => s.lastPersistedIndex);
  const setLastPersistedIndex = useMeetingStore((s) => s.setLastPersistedIndex);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeMeeting) {
      // No active meeting — clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const meetingId = activeMeeting.id;

    async function flushSegments() {
      const segments = useTranscriptStore.getState().segments;
      const currentLastIndex = useMeetingStore.getState().lastPersistedIndex;

      // Get only final segments that haven't been persisted yet
      const newSegments = segments
        .slice(currentLastIndex)
        .filter((s) => s.is_final);

      if (newSegments.length === 0) return;

      for (const segment of newSegments) {
        try {
          await appendTranscriptSegment(meetingId, JSON.stringify(segment));
        } catch (err) {
          console.error("[transcriptPersistence] Failed to persist segment:", err);
          // Stop trying to persist more if one fails
          return;
        }
      }

      // Update the persisted index to include all segments we've checked
      // (even non-final ones, since we'll skip them anyway)
      setLastPersistedIndex(segments.length);
    }

    // Set up the 30-second interval
    intervalRef.current = setInterval(flushSegments, FLUSH_INTERVAL_MS);

    return () => {
      // On cleanup, do a final flush
      flushSegments();

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeMeeting, setLastPersistedIndex]);
}
