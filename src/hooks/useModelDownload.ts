// Hook for tracking local STT model download progress.
// Listens to `model_download_progress` Tauri events and provides
// download state + control functions.

import { useState, useEffect, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ModelDownloadProgress } from "../lib/types";
import { downloadLocalSTTModel, cancelModelDownload } from "../lib/ipc";
import { showToast } from "../stores/toastStore";

interface DownloadState {
  [key: string]: ModelDownloadProgress;
}

export function useModelDownload() {
  const [downloads, setDownloads] = useState<DownloadState>({});

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<ModelDownloadProgress>("model_download_progress", (event) => {
      const progress = event.payload;
      const key = `${progress.engine}:${progress.model_id}`;

      setDownloads((prev) => {
        // Auto-clear terminal states after a brief delay
        if (
          progress.status === "complete" ||
          progress.status === "error" ||
          progress.status === "cancelled"
        ) {
          const next = { ...prev, [key]: progress };
          setTimeout(() => {
            setDownloads((current) => {
              const entry = current[key];
              // Only clear if still in a terminal state (not overwritten by e.g. "extracting")
              if (
                entry &&
                (entry.status === "complete" ||
                  entry.status === "error" ||
                  entry.status === "cancelled")
              ) {
                const updated = { ...current };
                delete updated[key];
                return updated;
              }
              return current;
            });
          }, 3000);
          return next;
        }
        return { ...prev, [key]: progress };
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const startDownload = useCallback(
    async (engine: string, modelId: string) => {
      try {
        await downloadLocalSTTModel(engine, modelId);
      } catch (err: any) {
        const msg = typeof err === "string" ? err : err?.message ?? "Unknown error";
        console.error("Failed to start download:", msg);
        showToast(`Download failed: ${msg}`, "error");
      }
    },
    []
  );

  const cancelDownloadFn = useCallback(
    async (engine: string, modelId: string) => {
      try {
        await cancelModelDownload(engine, modelId);
      } catch (err) {
        console.error("Failed to cancel download:", err);
      }
    },
    []
  );

  return { downloads, startDownload, cancelDownload: cancelDownloadFn };
}
