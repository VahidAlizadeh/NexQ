import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  onStreamStart,
  onStreamToken,
  onStreamEnd,
  onStreamError,
} from "../lib/events";
import { saveMeetingActionItems } from "../lib/ipc";
import { useMeetingStore } from "../stores/meetingStore";
import type { Meeting, ActionItem } from "../lib/types";

// ---------------------------------------------------------------------------
// Defensive JSON parsing — strips markdown fences, finds the array, and
// normalises each item into a proper ActionItem with generated id.
// ---------------------------------------------------------------------------
function parseActionItemsJSON(raw: string): ActionItem[] {
  console.log("[actionItems] Raw LLM response:", raw.slice(0, 500));

  // Strip thinking tags (Qwen3, DeepSeek) + markdown fences
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();

  // Find the JSON array — look for [{ to avoid matching [Speaker] transcript lines
  const start = cleaned.indexOf("[{");
  const end = cleaned.lastIndexOf("}]");
  if (start === -1 || end === -1 || end <= start) {
    console.error("[actionItems] No JSON array found. Cleaned:", cleaned.slice(0, 300));
    throw new Error("No JSON array found in response");
  }

  const jsonStr = cleaned.slice(start, end + 2);
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) throw new Error("Response is not an array");

  return parsed
    .map((item: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      text: ((item.text ?? item.action ?? item.description ?? "") as string).trim(),
      assignee_speaker_id: (item.assignee_speaker_id as string) ?? undefined,
      timestamp_ms: (item.timestamp_ms as number) ?? 0,
      completed: false,
    }))
    .filter((item) => item.text.length > 0);
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------
export interface ActionItemsExtractionState {
  isExtracting: boolean;
  error: string | null;
  extract: () => Promise<void>;
  cancel: () => void;
}

export function useActionItemsExtraction(
  meeting: Meeting | null,
  onItemsExtracted: (items: ActionItem[]) => void
): ActionItemsExtractionState {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef("");
  const isOurGeneration = useRef(false);
  const unlistenersRef = useRef<(() => void)[]>([]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unlistenersRef.current.forEach((fn) => fn());
      unlistenersRef.current = [];
    };
  }, []);

  const extract = useCallback(async () => {
    if (!meeting || isExtracting) return;

    setIsExtracting(true);
    setError(null);
    contentRef.current = "";
    isOurGeneration.current = false;

    // Subscribe to stream events before triggering generation
    const cleanups: (() => void)[] = [];

    try {
      const unStart = await onStreamStart((event) => {
        if (event.mode === "ActionItemsExtraction") {
          isOurGeneration.current = true;
        }
      });
      cleanups.push(unStart);

      const unToken = await onStreamToken((event) => {
        if (!isOurGeneration.current) return;
        contentRef.current += event.token;
      });
      cleanups.push(unToken);

      const unEnd = await onStreamEnd(async () => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;

        // Parse accumulated response into ActionItem[]
        if (meeting && contentRef.current) {
          try {
            const items = parseActionItemsJSON(contentRef.current);

            // Persist to DB (DELETE + INSERT atomically)
            await saveMeetingActionItems(
              meeting.id,
              JSON.stringify(items)
            );

            onItemsExtracted(items);

            // Refresh sidebar so counts update
            useMeetingStore.getState().loadRecentMeetings();
          } catch (err) {
            console.error(
              "[actionItemsExtraction] Parse/save failed:",
              err
            );
            setError(
              "Couldn't parse action items from AI response. Try again."
            );
          }
        }

        setIsExtracting(false);
        // Cleanup listeners
        cleanups.forEach((fn) => fn());
        unlistenersRef.current = unlistenersRef.current.filter(
          (fn) => !cleanups.includes(fn)
        );
      });
      cleanups.push(unEnd);

      const unError = await onStreamError((errMsg) => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;
        setError(errMsg);
        setIsExtracting(false);
        cleanups.forEach((fn) => fn());
        unlistenersRef.current = unlistenersRef.current.filter(
          (fn) => !cleanups.includes(fn)
        );
      });
      cleanups.push(unError);

      unlistenersRef.current.push(...cleanups);

      // ----- Build speaker context for the custom question ----- //
      const speakers = meeting.speakers ?? [];
      const speakerList = speakers
        .map((s) => `${s.id}: ${s.display_name}`)
        .join("\n");

      // Pass speaker list + extraction instruction as custom_question so it
      // appears in the user message alongside the transcript the backend builds.
      const customQuestion = speakerList
        ? `Speaker list:\n${speakerList}\n\nExtract all action items. Return ONLY a JSON array.`
        : "Extract all action items. Return ONLY a JSON array.";

      // Merge consecutive same-speaker segments to reduce prompt size
      const finals = meeting.transcript.filter((s) => s.is_final);
      const merged: { text: string; speaker: string; timestamp_ms: number }[] = [];
      for (const seg of finals) {
        const last = merged.length > 0 ? merged[merged.length - 1] : null;
        if (last && last.speaker === seg.speaker) {
          last.text += " " + seg.text;
        } else {
          merged.push({ text: seg.text, speaker: seg.speaker, timestamp_ms: seg.timestamp_ms });
        }
      }
      const segments = merged;

      await invoke("generate_assist", {
        mode: "ActionItemsExtraction",
        customQuestion,
        transcriptSegments: JSON.stringify(segments),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsExtracting(false);
      cleanups.forEach((fn) => fn());
    }
  }, [meeting, isExtracting, onItemsExtracted]);

  const cancel = useCallback(async () => {
    try {
      await invoke("cancel_generation");
    } catch {
      // Non-critical
    }
    isOurGeneration.current = false;
    setIsExtracting(false);
  }, []);

  return {
    isExtracting,
    error,
    extract,
    cancel,
  };
}
