// Sub-PRD 3: Subscribe to audio_level IPC events (~20Hz)

import { useEffect, useRef, useState } from "react";
import { onAudioLevel } from "../lib/events";
import type { AudioLevelEvent } from "../lib/types";

interface AudioLevelState {
  micLevel: number;
  systemLevel: number;
  micPeak: number;
  systemPeak: number;
}

/**
 * Hook that subscribes to backend audio_level events.
 * The backend emits these at roughly 20Hz while capture is active.
 *
 * Returns current mic and system audio levels (0.0 - 1.0)
 * and peak values for level meter rendering.
 */
export function useAudioLevel(): AudioLevelState {
  const [state, setState] = useState<AudioLevelState>({
    micLevel: 0,
    systemLevel: 0,
    micPeak: 0,
    systemPeak: 0,
  });

  // Use refs for peak decay to avoid excessive re-renders
  const micPeakRef = useRef(0);
  const systemPeakRef = useRef(0);
  // EMA smoothing refs — reduces spiky behavior for mixer-type inputs
  const micSmoothedRef = useRef(0);
  const systemSmoothedRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      const unlisten = await onAudioLevel((event: AudioLevelEvent) => {
        if (!mounted) return;

        if (event.source === "Mic") {
          // EMA smoothing: smooth = prev * 0.7 + current * 0.3
          micSmoothedRef.current = micSmoothedRef.current * 0.7 + event.level * 0.3;

          // Update peak with decay
          if (event.peak > micPeakRef.current) {
            micPeakRef.current = event.peak;
          } else {
            // Decay peak slowly
            micPeakRef.current = micPeakRef.current * 0.95;
          }

          setState((prev) => ({
            ...prev,
            micLevel: micSmoothedRef.current,
            micPeak: micPeakRef.current,
          }));
        } else if (event.source === "System") {
          // EMA smoothing: smooth = prev * 0.7 + current * 0.3
          systemSmoothedRef.current = systemSmoothedRef.current * 0.7 + event.level * 0.3;

          if (event.peak > systemPeakRef.current) {
            systemPeakRef.current = event.peak;
          } else {
            systemPeakRef.current = systemPeakRef.current * 0.95;
          }

          setState((prev) => ({
            ...prev,
            systemLevel: systemSmoothedRef.current,
            systemPeak: systemPeakRef.current,
          }));
        }
      });

      // Return cleanup function
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;

    setupListener().then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      mounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return state;
}
