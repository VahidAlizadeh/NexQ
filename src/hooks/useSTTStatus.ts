import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onSTTConnectionStatus, type STTConnectionStatusEvent } from "../lib/events";
import { showToast } from "../stores/toastStore";

export function useSTTStatus() {
  const connectedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      const u = await onSTTConnectionStatus((event: STTConnectionStatusEvent) => {
        if (!mounted) return;
        console.log("[STT Status]", event);

        if (event.status === "error" && event.message) {
          showToast(`STT (${event.party}): ${event.message}`, "error");
        } else if (event.status === "connected") {
          const key = `${event.provider}_${event.party}`;
          if (!connectedRef.current.has(key)) {
            connectedRef.current.add(key);
            showToast(`STT: ${event.provider} connected (${event.party})`, "info");
          }
        } else if (event.status === "disconnected") {
          const key = `${event.provider}_${event.party}`;
          connectedRef.current.delete(key);
        }
      });
      if (mounted) unlisten = u; else u();
    };

    setup();
    return () => { mounted = false; if (unlisten) unlisten(); };
  }, []);
}
