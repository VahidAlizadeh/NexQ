// Sub-PRD 6: Subscribe to llm_token/stream_start/stream_end events
// Batch at 60fps via requestAnimationFrame

import { useEffect, useRef } from "react";
import { useStreamStore } from "../stores/streamStore";
import {
  onStreamStart,
  onStreamToken,
  onStreamEnd,
  onStreamError,
} from "../lib/events";
import type { IntelligenceMode } from "../lib/types";

/**
 * Hook that subscribes to LLM streaming events from the Tauri backend
 * and updates the streamStore. Batches token updates at 60fps using
 * requestAnimationFrame for smooth rendering.
 */
export function useStreamBuffer() {
  const appendToken = useStreamStore((s) => s.appendToken);
  const startStream = useStreamStore((s) => s.startStream);
  const endStream = useStreamStore((s) => s.endStream);
  const setError = useStreamStore((s) => s.setError);

  // Token batching buffer
  const tokenBuffer = useRef<string>("");
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];

    // Flush buffered tokens to the store at ~60fps
    const flushTokens = () => {
      if (tokenBuffer.current.length > 0) {
        appendToken(tokenBuffer.current);
        tokenBuffer.current = "";
      }
      rafId.current = null;
    };

    // Schedule a flush if not already scheduled
    const scheduleFlush = () => {
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(flushTokens);
      }
    };

    // Subscribe to stream start
    unlisteners.push(
      onStreamStart((event) => {
        tokenBuffer.current = "";
        if (rafId.current !== null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
        startStream(
          event.mode as IntelligenceMode,
          event.model,
          event.provider
        );
      })
    );

    // Subscribe to stream tokens — batch at 60fps
    unlisteners.push(
      onStreamToken((event) => {
        tokenBuffer.current += event.token;
        scheduleFlush();
      })
    );

    // Subscribe to stream end
    unlisteners.push(
      onStreamEnd((event) => {
        // Flush any remaining buffered tokens immediately
        if (tokenBuffer.current.length > 0) {
          appendToken(tokenBuffer.current);
          tokenBuffer.current = "";
        }
        if (rafId.current !== null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
        endStream(event.latency_ms);
      })
    );

    // Subscribe to stream errors
    unlisteners.push(
      onStreamError((error) => {
        tokenBuffer.current = "";
        if (rafId.current !== null) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
        setError(error);
      })
    );

    // Cleanup on unmount
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, [appendToken, startStream, endStream, setError]);
}
