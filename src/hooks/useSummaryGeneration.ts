import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  onStreamStart,
  onStreamToken,
  onStreamEnd,
  onStreamError,
} from "../lib/events";
import { updateMeetingSummary } from "../lib/ipc";
import { useMeetingStore } from "../stores/meetingStore";
import type { Meeting } from "../lib/types";

export interface SummaryGenerationState {
  isGenerating: boolean;
  streamedContent: string;
  error: string | null;
  generate: () => Promise<void>;
  cancel: () => void;
}

export function useSummaryGeneration(
  meeting: Meeting | null,
  onSummaryGenerated?: (summary: string) => void
): SummaryGenerationState {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef("");
  const isOurGeneration = useRef(false);
  const unlistenersRef = useRef<(() => void)[]>([]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unlistenersRef.current.forEach((fn) => fn());
      unlistenersRef.current = [];
    };
  }, []);

  const generate = useCallback(async () => {
    if (!meeting || isGenerating) return;

    setIsGenerating(true);
    setStreamedContent("");
    setError(null);
    contentRef.current = "";
    isOurGeneration.current = false;

    // Subscribe to stream events before triggering generation
    const cleanups: (() => void)[] = [];

    try {
      const unStart = await onStreamStart((event) => {
        if (event.mode === "MeetingSummary") {
          isOurGeneration.current = true;
        }
      });
      cleanups.push(unStart);

      const unToken = await onStreamToken((event) => {
        if (!isOurGeneration.current) return;
        contentRef.current += event.token;
        setStreamedContent(contentRef.current);
      });
      cleanups.push(unToken);

      const unEnd = await onStreamEnd(async () => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;

        // Persist summary to DB and refresh sidebar
        if (meeting && contentRef.current) {
          try {
            await updateMeetingSummary(meeting.id, contentRef.current);
            onSummaryGenerated?.(contentRef.current);
            // Refresh sidebar so has_summary badge updates
            useMeetingStore.getState().loadRecentMeetings();
          } catch (err) {
            console.error("[summaryGeneration] Failed to persist summary:", err);
          }
        }

        setIsGenerating(false);
        // Cleanup listeners
        cleanups.forEach((fn) => fn());
        unlistenersRef.current = unlistenersRef.current.filter(
          (fn) => !cleanups.includes(fn)
        );
      });
      cleanups.push(unEnd);

      const unError = await onStreamError((errMsg) => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;
        setError(errMsg);
        setIsGenerating(false);
        cleanups.forEach((fn) => fn());
        unlistenersRef.current = unlistenersRef.current.filter(
          (fn) => !cleanups.includes(fn)
        );
      });
      cleanups.push(unError);

      unlistenersRef.current.push(...cleanups);

      // Pass the meeting's transcript directly to bypass empty transcriptStore
      const segments = meeting.transcript
        .filter((s) => s.is_final)
        .map((s) => ({
          text: s.text,
          speaker: s.speaker,
          timestamp_ms: s.timestamp_ms,
        }));

      await invoke("generate_assist", {
        mode: "MeetingSummary",
        transcriptSegments: JSON.stringify(segments),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsGenerating(false);
      cleanups.forEach((fn) => fn());
    }
  }, [meeting, isGenerating, onSummaryGenerated]);

  const cancel = useCallback(async () => {
    try {
      await invoke("cancel_generation");
    } catch {
      // Non-critical
    }
    isOurGeneration.current = false;
    setIsGenerating(false);
  }, []);

  return {
    isGenerating,
    streamedContent,
    error,
    generate,
    cancel,
  };
}
