import { useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";
import { showToast } from "../stores/toastStore";

export function useTrayNotifications() {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const overlayHidden = useMeetingStore((s) => s.overlayHidden);
  const trayNotifications = useConfigStore((s) => s.trayNotifications);
  const prevRecording = useRef(false);
  const lastToastTime = useRef(0);

  useEffect(() => {
    if (!trayNotifications || overlayHidden) {
      prevRecording.current = isRecording;
      return;
    }

    const now = Date.now();
    if (now - lastToastTime.current < 30_000) {
      prevRecording.current = isRecording;
      return;
    }

    if (isRecording && !prevRecording.current) {
      showToast("Meeting started — NexQ is recording.", "info");
      lastToastTime.current = now;
    } else if (!isRecording && prevRecording.current) {
      showToast("Meeting ended — check your transcript and action items.", "success");
      lastToastTime.current = now;
    }

    prevRecording.current = isRecording;
  }, [isRecording, trayNotifications, overlayHidden]);
}
