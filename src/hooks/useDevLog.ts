// Always-on hook that subscribes to stt_debug and stt_connection_status
// events and pipes them into the global devLogStore.
// Wired into ActiveMeetingProvider so events are captured from meeting start.

import { useEffect } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onSTTConnectionStatus,
  onSTTDebug,
  type STTConnectionStatusEvent,
  type STTDebugEvent,
} from "../lib/events";
import { useDevLogStore } from "../stores/devLogStore";

export function useDevLog() {
  const addEntry = useDevLogStore((s) => s.addEntry);

  useEffect(() => {
    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const u1 = await onSTTDebug((e: STTDebugEvent) => {
        if (mounted) addEntry(e.level, e.source, e.message);
      });
      const u2 = await onSTTConnectionStatus((e: STTConnectionStatusEvent) => {
        if (!mounted) return;
        const level =
          e.status === "error"
            ? "error"
            : e.status === "reconnecting"
              ? "warn"
              : "info";
        addEntry(
          level,
          `stt:${e.provider}`,
          `[${e.party}] ${e.status}${e.message ? ": " + e.message : ""}`
        );
      });
      if (mounted) {
        unlisteners.push(u1, u2);
      } else {
        u1();
        u2();
      }
    };

    setup();
    return () => {
      mounted = false;
      unlisteners.forEach((u) => u());
    };
  }, [addEntry]);
}
