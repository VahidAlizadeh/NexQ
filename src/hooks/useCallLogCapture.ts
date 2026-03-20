// ============================================================================
// useCallLogCapture — Subscribes to LLM stream events and records them
// in callLogStore. Mounted in OverlayView alongside useStreamBuffer.
// ============================================================================

import { useEffect, useRef } from "react";
import {
  onStreamStart,
  onStreamToken,
  onStreamEnd,
  onStreamError,
} from "../lib/events";
import { useCallLogStore } from "../stores/callLogStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { useContextStore } from "../stores/contextStore";
import { getSystemPromptForMode } from "../lib/promptTemplates";
import type { IntelligenceMode, LogEntry } from "../lib/types";

export function useCallLogCapture() {
  const activeCallId = useRef<string | null>(null);

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];

    unlisteners.push(
      onStreamStart((event) => {
        const id = crypto.randomUUID();
        activeCallId.current = id;

        const mode = event.mode as IntelligenceMode;

        // Snapshot transcript context
        const segments = useTranscriptStore.getState().segments;
        const snapshotTranscript = segments
          .filter((s) => s.is_final)
          .slice(-20)
          .map((s) => `[${s.speaker}]: ${s.text}`)
          .join("\n");

        // Snapshot context files summary
        const { resources, customInstructions } = useContextStore.getState();
        const contextParts: string[] = [];
        if (resources.length > 0) {
          contextParts.push(
            `${resources.length} file(s): ${resources.map((r) => r.name).join(", ")}`
          );
        }
        if (customInstructions) {
          contextParts.push(
            `Custom instructions (${customInstructions.length} chars)`
          );
        }
        const snapshotContext = contextParts.join(" | ") || "(none)";

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
          snapshotTranscript,
          snapshotContext,
          reconstructedSystemPrompt: getSystemPromptForMode(mode),
          errorMessage: null,
        };

        useCallLogStore.getState().beginEntry(entry);
      })
    );

    unlisteners.push(
      onStreamToken((event) => {
        if (activeCallId.current) {
          useCallLogStore
            .getState()
            .appendToken(activeCallId.current, event.token);
        }
      })
    );

    unlisteners.push(
      onStreamEnd((event) => {
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
        if (activeCallId.current) {
          useCallLogStore.getState().failEntry(activeCallId.current, error);
          activeCallId.current = null;
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, []);
}
