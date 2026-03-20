// Sub-PRD 4: Subscribe to transcript_update + transcript_final events
// Connects the Tauri IPC event stream to the Zustand transcript store.

import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onTranscriptUpdate, onTranscriptFinal } from "../lib/events";
import { useTranscriptStore } from "../stores/transcriptStore";
import type { TranscriptUpdateEvent } from "../lib/types";

/**
 * Hook that subscribes to transcript IPC events and routes them
 * to the transcript store.
 *
 * - "transcript_update" events (interim results) -> updateInterimSegment
 * - "transcript_final" events (final results) -> appendSegment
 *
 * Call this hook once in a parent component that wraps the transcript UI
 * (e.g., OverlayView). It automatically cleans up listeners on unmount.
 */
export function useTranscript() {
  const appendSegment = useTranscriptStore((s) => s.appendSegment);
  const updateInterimSegment = useTranscriptStore(
    (s) => s.updateInterimSegment
  );

  // Use refs to avoid re-subscribing when store actions change reference
  const appendRef = useRef(appendSegment);
  const updateRef = useRef(updateInterimSegment);

  useEffect(() => {
    appendRef.current = appendSegment;
    updateRef.current = updateInterimSegment;
  }, [appendSegment, updateInterimSegment]);

  useEffect(() => {
    let unlistenUpdate: UnlistenFn | null = null;
    let unlistenFinal: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      // Subscribe to interim transcript updates — upsert by id
      const unlisten1 = await onTranscriptUpdate(
        (event: TranscriptUpdateEvent) => {
          if (!mounted) return;
          console.log("[STT] transcript_update:", event.segment);
          updateRef.current(event.segment);
        }
      );

      // Subscribe to final transcript results — replace interim in-place (same id)
      const unlisten2 = await onTranscriptFinal(
        (event: TranscriptUpdateEvent) => {
          if (!mounted) return;
          console.log("[STT] transcript_final:", event.segment);
          // Use updateInterimSegment so it replaces the interim with same id,
          // or appends if no interim existed (e.g., very short utterance)
          updateRef.current(event.segment);
        }
      );

      if (mounted) {
        unlistenUpdate = unlisten1;
        unlistenFinal = unlisten2;
      } else {
        // Component unmounted before setup finished
        unlisten1();
        unlisten2();
      }
    };

    setup();

    return () => {
      mounted = false;
      if (unlistenUpdate) unlistenUpdate();
      if (unlistenFinal) unlistenFinal();
    };
  }, []);
}
