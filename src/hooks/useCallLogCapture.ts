// ============================================================================
// useCallLogCapture — Subscribes to LLM stream events and records them
// in callLogStore. Now captures ACTUAL prompt data from backend events
// instead of reconstructing from frontend stores.
// ============================================================================

import { useEffect, useRef } from "react";
import {
  onStreamStart,
  onStreamToken,
  onStreamEnd,
  onStreamError,
} from "../lib/events";
import { useCallLogStore } from "../stores/callLogStore";
import type { IntelligenceMode, LogEntry } from "../lib/types";

/** Timeout (ms) for stale "sending" entries — auto-transition to error */
const SENDING_TIMEOUT_MS = 10_000;

export function useCallLogCapture() {
  const activeCallId = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];

    unlisteners.push(
      onStreamStart((event) => {
        const id = crypto.randomUUID();
        activeCallId.current = id;

        const mode = event.mode as IntelligenceMode;

        const entry: LogEntry = {
          id,
          timestamp: Date.now(),
          mode,
          provider: event.provider,
          model: event.model,
          status: "sending",
          startedAt: Date.now(),
          firstTokenAt: null,
          completedAt: null,
          totalTokens: null,
          latencyMs: null,
          responseContent: "",
          responseContentClean: "",
          // Actual prompt data from backend
          actualSystemPrompt: event.system_prompt,
          actualUserPrompt: event.user_prompt,
          // Context source flags
          includeTranscript: event.include_transcript,
          includeRag: event.include_rag,
          includeInstructions: event.include_instructions,
          includeQuestion: event.include_question,
          // Legacy fields (empty for new entries)
          snapshotTranscript: "",
          snapshotContext: "",
          reconstructedSystemPrompt: "",
          errorMessage: null,
        };

        useCallLogStore.getState().beginEntry(entry);

        // Safety timeout: if entry stays in "sending" for >10s, mark as error
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          const entries = useCallLogStore.getState().entries;
          const e = entries.find((x) => x.id === id);
          if (e && e.status === "sending") {
            useCallLogStore
              .getState()
              .failEntry(id, "Timed out waiting for response");
            activeCallId.current = null;
          }
        }, SENDING_TIMEOUT_MS);
      })
    );

    unlisteners.push(
      onStreamToken((event) => {
        if (activeCallId.current) {
          // Clear sending timeout on first token
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          useCallLogStore
            .getState()
            .appendToken(activeCallId.current, event.token);
        }
      })
    );

    unlisteners.push(
      onStreamEnd((event) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (activeCallId.current) {
          useCallLogStore
            .getState()
            .completeEntry(
              activeCallId.current,
              event.total_tokens,
              event.latency_ms
            );
          activeCallId.current = null;
        }
      })
    );

    unlisteners.push(
      onStreamError((error) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (activeCallId.current) {
          useCallLogStore.getState().failEntry(activeCallId.current, error);
          activeCallId.current = null;
        }
      })
    );

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, []);
}
