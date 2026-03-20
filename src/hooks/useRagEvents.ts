import { useEffect } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useRagStore } from "../stores/ragStore";
import {
  onRagIndexProgress,
  onOllamaPullProgress,
  onTranscriptIndexed,
} from "../lib/events";

export function useRagEvents() {
  const setIndexProgress = useRagStore((s) => s.setIndexProgress);
  const setPullProgress = useRagStore((s) => s.setPullProgress);
  const setIsIndexing = useRagStore((s) => s.setIsIndexing);
  const setIsPullingModel = useRagStore((s) => s.setIsPullingModel);
  const refreshIndexStatus = useRagStore((s) => s.refreshIndexStatus);

  useEffect(() => {
    let unlistenIndex: UnlistenFn | null = null;
    let unlistenPull: UnlistenFn | null = null;
    let unlistenTranscript: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      const unlisten1 = await onRagIndexProgress((event) => {
        if (!mounted) return;
        setIndexProgress({
          status: event.status,
          filesTotal: event.files_total ?? 0,
          filesDone: event.files_done ?? 0,
          chunksTotal: event.chunks_total ?? 0,
          chunksDone: event.chunks_done ?? 0,
        });
        if (event.status === "complete") {
          setIsIndexing(false);
          setIndexProgress(null);
          refreshIndexStatus();
        }
      });

      const unlisten2 = await onOllamaPullProgress((event) => {
        if (!mounted) return;
        setPullProgress({
          status: event.status,
          total: event.total,
          completed: event.completed,
        });
        if (event.status === "complete") {
          setIsPullingModel(false);
          setPullProgress(null);
        }
      });

      const unlisten3 = await onTranscriptIndexed(() => {
        if (!mounted) return;
        refreshIndexStatus();
      });

      if (mounted) {
        unlistenIndex = unlisten1;
        unlistenPull = unlisten2;
        unlistenTranscript = unlisten3;
      } else {
        unlisten1();
        unlisten2();
        unlisten3();
      }
    };

    setup();

    return () => {
      mounted = false;
      if (unlistenIndex) unlistenIndex();
      if (unlistenPull) unlistenPull();
      if (unlistenTranscript) unlistenTranscript();
    };
  }, []);
}
