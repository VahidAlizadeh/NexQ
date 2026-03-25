import { useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";
import { useStreamStore } from "../stores/streamStore";
import { useRagStore } from "../stores/ragStore";
import {
  setTrayState,
  setMeetingStartTime,
  rebuildTrayMenu,
} from "../lib/ipc";
import type { TrayState, MeetingSummary } from "../lib/types";

/**
 * Priority order: Stealth > Muted > Recording > AiProcessing > Indexing > Idle
 */
function computeTrayState(
  isRecording: boolean,
  mutedYou: boolean,
  overlayHidden: boolean,
  isStreaming: boolean,
  isIndexing: boolean
): TrayState {
  if (isRecording && overlayHidden) return "stealth";
  if (isRecording && mutedYou) return "muted";
  if (isRecording) return "recording";
  if (isStreaming) return "ai_processing";
  if (isIndexing) return "indexing";
  return "idle";
}

export function useTraySync() {
  const prevState = useRef<TrayState>("idle");
  const prevRecording = useRef(false);

  const isRecording = useMeetingStore((s) => s.isRecording);
  const overlayHidden = useMeetingStore((s) => s.overlayHidden);
  const recentMeetings = useMeetingStore((s) => s.recentMeetings);
  const mutedYou = useConfigStore((s) => s.mutedYou);
  const isStreaming = useStreamStore((s) => s.isStreaming);
  const isIndexing = useRagStore((s) => s.isIndexing);

  // Sync tray state on store changes
  useEffect(() => {
    const newState = computeTrayState(
      isRecording, mutedYou, overlayHidden, isStreaming, isIndexing
    );

    if (newState !== prevState.current) {
      prevState.current = newState;
      setTrayState(newState).catch((e) =>
        console.warn("[useTraySync] Failed to set tray state:", e)
      );
    }
  }, [isRecording, mutedYou, overlayHidden, isStreaming, isIndexing]);

  // Sync meeting start/stop time
  useEffect(() => {
    if (isRecording && !prevRecording.current) {
      setMeetingStartTime(true).catch((e) =>
        console.warn("[useTraySync] Failed to set meeting start:", e)
      );
    } else if (!isRecording && prevRecording.current) {
      setMeetingStartTime(false).catch((e) =>
        console.warn("[useTraySync] Failed to clear meeting start:", e)
      );
    }
    prevRecording.current = isRecording;
  }, [isRecording]);

  // Rebuild tray menu when meeting state or recent meetings change
  useEffect(() => {
    const recent = recentMeetings.slice(0, 3).map((m: MeetingSummary) => ({
      id: m.id,
      title: m.title || "Untitled Meeting",
      startTime: m.start_time || "",
      duration: m.duration_seconds ?? 0,
    }));
    rebuildTrayMenu(isRecording, recent).catch((e) =>
      console.warn("[useTraySync] Failed to rebuild tray menu:", e)
    );
  }, [isRecording, recentMeetings]);
}
