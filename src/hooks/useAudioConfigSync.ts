// Watches meetingAudioConfig changes during an active meeting
// and restarts the Rust audio capture pipeline with the new config.
// This enables "hot-swap" of STT provider and audio source mid-meeting.

import { useEffect, useRef } from "react";
import { useConfigStore } from "../stores/configStore";
import { useMeetingStore } from "../stores/meetingStore";
import { stopCapture, startCapturePerParty } from "../lib/ipc";
import type { MeetingAudioConfig } from "../lib/types";

export function useAudioConfigSync() {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const meetingAudioConfig = useConfigStore((s) => s.meetingAudioConfig);

  // Track the config that is currently applied to the Rust audio pipeline
  const appliedConfigRef = useRef<string | null>(null);

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

    // Config changed during active meeting — restart capture
    console.log("[AudioConfigSync] Config changed, restarting capture...");
    appliedConfigRef.current = configKey;

    (async () => {
      try {
        await stopCapture();
        await startCapturePerParty(
          meetingAudioConfig.you,
          meetingAudioConfig.them
        );
        console.log("[AudioConfigSync] Capture restarted with new config");
      } catch (err) {
        console.error("[AudioConfigSync] Failed to restart capture:", err);
      }
    })();
  }, [isRecording, meetingAudioConfig]);

  // Reset when meeting ends
  useEffect(() => {
    if (!isRecording) {
      appliedConfigRef.current = null;
    }
  }, [isRecording]);
}
