// src/hooks/useTranslation.ts
import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onTranslationResult,
  onTranslationError,
  onBatchTranslationProgress,
  onTranscriptFinal,
} from "../lib/events";
import { useTranslationStore } from "../stores/translationStore";
import { useMeetingStore } from "../stores/meetingStore";
import { translateSegments, getMeetingTranslations } from "../lib/ipc";
import type { TranscriptUpdateEvent } from "../lib/types";

export function useTranslation() {
  const addTranslation = useTranslationStore((s) => s.addTranslation);
  const addTranslations = useTranslationStore((s) => s.addTranslations);
  const setBatchProgress = useTranslationStore((s) => s.setBatchProgress);
  const autoTranslateActive = useTranslationStore((s) => s.autoTranslateActive);
  const targetLang = useTranslationStore((s) => s.targetLang);
  const sourceLang = useTranslationStore((s) => s.sourceLang);
  const setTranslating = useTranslationStore((s) => s.setTranslating);

  const activeMeeting = useMeetingStore((s) => s.activeMeeting);
  const meetingId = activeMeeting?.id ?? null;

  // Keep stable refs to avoid stale closures in async event handlers
  const addRef = useRef(addTranslation);
  const addTranslationsRef = useRef(addTranslations);
  const progressRef = useRef(setBatchProgress);
  const autoTranslateActiveRef = useRef(autoTranslateActive);
  const targetLangRef = useRef(targetLang);
  const sourceLangRef = useRef(sourceLang);
  const setTranslatingRef = useRef(setTranslating);
  const meetingIdRef = useRef(meetingId);

  useEffect(() => {
    addRef.current = addTranslation;
    addTranslationsRef.current = addTranslations;
    progressRef.current = setBatchProgress;
    autoTranslateActiveRef.current = autoTranslateActive;
    targetLangRef.current = targetLang;
    sourceLangRef.current = sourceLang;
    setTranslatingRef.current = setTranslating;
    meetingIdRef.current = meetingId;
  }, [addTranslation, addTranslations, setBatchProgress, autoTranslateActive, targetLang, sourceLang, setTranslating, meetingId]);

  // Subscribe to translation result/error/progress events
  useEffect(() => {
    let unResult: UnlistenFn | null = null;
    let unError: UnlistenFn | null = null;
    let unProgress: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      const u1 = await onTranslationResult((result) => {
        if (!mounted) return;
        addRef.current(result);
      });

      const u2 = await onTranslationError((error) => {
        if (!mounted) return;
        console.warn("[translation] Error:", error.error, error.segment_id);
        // Clear translating state for the failed segment so spinner doesn't hang
        if (error.segment_id) {
          setTranslatingRef.current(error.segment_id, false);
        }
      });

      const u3 = await onBatchTranslationProgress((progress) => {
        if (!mounted) return;
        progressRef.current(
          progress.completed >= progress.total ? null : progress,
        );
      });

      if (mounted) {
        unResult = u1;
        unError = u2;
        unProgress = u3;
      } else {
        u1();
        u2();
        u3();
      }
    };

    setup();

    return () => {
      mounted = false;
      if (unResult) unResult();
      if (unError) unError();
      if (unProgress) unProgress();
    };
  }, []);

  // Auto-translate: listen for final transcript segments and translate when active
  useEffect(() => {
    let unFinal: UnlistenFn | null = null;
    let mounted = true;
    // Debounce timer ref per segment — stored as map of segmentId -> timeoutId
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const setup = async () => {
      const u = await onTranscriptFinal((event: TranscriptUpdateEvent) => {
        if (!mounted) return;

        const { segment } = event;
        if (!segment.is_final) return;

        const active = autoTranslateActiveRef.current;
        const mid = meetingIdRef.current;
        if (!active || !mid) return;

        const segmentId = segment.id;

        // Clear any pending debounce for this segment
        const existing = debounceTimers.get(segmentId);
        if (existing !== undefined) {
          clearTimeout(existing);
        }

        // Debounce by 200ms to avoid rapid successive calls
        const timer = setTimeout(() => {
          debounceTimers.delete(segmentId);

          const currentActive = autoTranslateActiveRef.current;
          const currentMid = meetingIdRef.current;
          const currentTarget = targetLangRef.current;
          const currentSource = sourceLangRef.current;

          if (!currentActive || !currentMid || !currentTarget) return;

          setTranslatingRef.current(segmentId, true);
          translateSegments(
            [segmentId],
            [segment.text],
            currentMid,
            currentTarget,
            currentSource === "auto" ? undefined : currentSource,
          ).catch((err) => {
            console.error("[useTranslation] Auto-translate failed:", err);
            setTranslatingRef.current(segmentId, false);
          });
        }, 200);

        debounceTimers.set(segmentId, timer);
      });

      if (mounted) {
        unFinal = u;
      } else {
        u();
      }
    };

    setup();

    return () => {
      mounted = false;
      // Clear all pending debounce timers
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
      if (unFinal) unFinal();
    };
  }, []);

  // Preload cached translations when meeting ID or target language changes
  useEffect(() => {
    if (!meetingId || !targetLang) return;
    getMeetingTranslations(meetingId, targetLang)
      .then((cached) => {
        if (cached.length > 0) {
          addTranslationsRef.current(cached);
        }
      })
      .catch((err) =>
        console.warn("[useTranslation] Failed to preload translations:", err),
      );
  }, [meetingId, targetLang]);
}
