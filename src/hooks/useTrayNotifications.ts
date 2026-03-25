import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";

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
      sendToast("Meeting started", "NexQ is recording.");
      lastToastTime.current = now;
    } else if (!isRecording && prevRecording.current) {
      sendToast("Meeting ended", "Check your transcript and action items.");
      lastToastTime.current = now;
    }

    prevRecording.current = isRecording;
  }, [isRecording, trayNotifications, overlayHidden]);
}

async function sendToast(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch (e) {
    console.warn("[trayNotifications] Toast failed:", e);
  }
}
