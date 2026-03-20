// Watches meetingAudioConfig changes during an active meeting
// and restarts the Rust audio capture pipeline with the new config.
// This enables "hot-swap" of STT provider and audio source mid-meeting.
//
// Key design: uses a debounce + sequential restart to avoid race conditions
// when multiple rapid config changes happen (e.g., switching STT provider
// while models are loading). Waits for stop to fully complete before starting.

import { useEffect, useRef } from "react";
import { useConfigStore } from "../stores/configStore";
import { useMeetingStore } from "../stores/meetingStore";
import { stopCapture, startCapturePerParty } from "../lib/ipc";

export function useAudioConfigSync() {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const meetingAudioConfig = useConfigStore((s) => s.meetingAudioConfig);

  // Track the config that is currently applied to the Rust audio pipeline
  const appliedConfigRef = useRef<string | null>(null);
  // Guard against concurrent restart attempts
  const restartingRef = useRef(false);
  // Debounce timer to batch rapid config changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRecording || !meetingAudioConfig) return;

    // Serialize to compare — avoids deep equality checks
    const configKey = JSON.stringify(meetingAudioConfig);

    // On first run (meeting just started), just record the applied config
    if (appliedConfigRef.current === null) {
      appliedConfigRef.current = configKey;
      return;
    }

    // No change
    if (appliedConfigRef.current === configKey) return;

    // Debounce: wait 300ms for rapid changes to settle before restarting
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;

      // Skip if already restarting from a previous change
      if (restartingRef.current) {
        console.log("[AudioConfigSync] Restart already in progress, queuing...");
        return;
      }

      // Get the latest config (may have changed during debounce)
      const latestConfig = useConfigStore.getState().meetingAudioConfig;
      if (!latestConfig) return;

      const latestKey = JSON.stringify(latestConfig);
      if (appliedConfigRef.current === latestKey) return;

      restartingRef.current = true;
      console.log("[AudioConfigSync] Config changed, restarting capture...");

      try {
        // Stop current capture and wait for full cleanup
        await stopCapture();

        // Brief delay to let Rust fully release audio resources
        await new Promise((r) => setTimeout(r, 150));

        // Start with the latest config
        const freshConfig = useConfigStore.getState().meetingAudioConfig;
        if (!freshConfig) {
          console.warn("[AudioConfigSync] No config available after stop");
          return;
        }

        await startCapturePerParty(freshConfig.you, freshConfig.them);
        appliedConfigRef.current = JSON.stringify(freshConfig);
        console.log("[AudioConfigSync] Capture restarted with new config");
      } catch (err) {
        console.error("[AudioConfigSync] Failed to restart capture:", err);
        // Reset applied config so next change attempt retries
        appliedConfigRef.current = null;
      } finally {
        restartingRef.current = false;
      }
    }, 300);

    // Update applied config immediately to prevent re-triggering
    appliedConfigRef.current = configKey;
  }, [isRecording, meetingAudioConfig]);

  // Reset when meeting ends
  useEffect(() => {
    if (!isRecording) {
      appliedConfigRef.current = null;
      restartingRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
  }, [isRecording]);
}
