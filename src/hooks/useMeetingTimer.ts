import { useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";

/**
 * Hook that manages the elapsed time counter during an active meeting.
 * Updates elapsedMs every second while a meeting is active.
 * Automatically cleans up on unmount or when meeting ends.
 */
export function useMeetingTimer() {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const setElapsedMs = useMeetingStore((s) => s.setElapsedMs);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording && meetingStartTime) {
      // Start interval
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - meetingStartTime);
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Not recording — clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isRecording, meetingStartTime, setElapsedMs]);
}
