import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  onStreamStart,
  onStreamToken,
  onStreamEnd,
  onStreamError,
} from "../lib/events";
import { addMeetingBookmark } from "../lib/ipc";
import type { Meeting, MeetingBookmark } from "../lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BookmarkSuggestion {
  timestamp_ms: number;
  segment_id?: string;
  note: string;
}

export interface BookmarkSuggestionsState {
  isSuggesting: boolean;
  suggestions: BookmarkSuggestion[];
  suggest: () => Promise<void>;
  cancel: () => void;
  acceptSuggestion: (index: number) => void;
  dismissSuggestion: (index: number) => void;
  acceptAll: () => void;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Defensive JSON parsing — strips markdown fences, finds the array, and
// normalises each item into a proper BookmarkSuggestion.
// ---------------------------------------------------------------------------
function parseSuggestionsJSON(raw: string): BookmarkSuggestion[] {
  // Strip markdown code fences
  let cleaned = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

  // Find the JSON array
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in response");
  }

  const jsonStr = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) throw new Error("Response is not an array");

  return parsed.map((item: Record<string, unknown>) => ({
    timestamp_ms: (item.timestamp_ms as number) ?? 0,
    segment_id: (item.segment_id as string) ?? undefined,
    note: (item.note as string) ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useBookmarkSuggestions(
  meeting: Meeting | null,
  onBookmarkAccepted: (newBookmark: MeetingBookmark) => void,
): BookmarkSuggestionsState {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<BookmarkSuggestion[]>([]);
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

  const acceptSuggestion = useCallback(
    async (index: number) => {
      if (!meeting) return;

      const suggestion = suggestions[index];
      if (!suggestion) return;

      const bookmark: MeetingBookmark = {
        id: crypto.randomUUID(),
        timestamp_ms: suggestion.timestamp_ms,
        segment_id: suggestion.segment_id,
        note: suggestion.note,
        created_at: new Date().toISOString(),
      };

      try {
        await addMeetingBookmark(
          JSON.stringify({
            id: bookmark.id,
            meeting_id: meeting.id,
            timestamp_ms: bookmark.timestamp_ms,
            segment_id: bookmark.segment_id ?? null,
            note: bookmark.note ?? null,
            created_at: bookmark.created_at,
          }),
        );

        // Remove accepted suggestion from the list
        setSuggestions((prev) => prev.filter((_, i) => i !== index));
        onBookmarkAccepted(bookmark);
      } catch (err) {
        console.error("[bookmarkSuggestions] Failed to save bookmark:", err);
      }
    },
    [meeting, suggestions, onBookmarkAccepted],
  );

  const dismissSuggestion = useCallback((index: number) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const acceptAll = useCallback(async () => {
    if (!meeting) return;

    // Process all remaining suggestions
    for (let i = suggestions.length - 1; i >= 0; i--) {
      const suggestion = suggestions[i];
      if (!suggestion) continue;

      const bookmark: MeetingBookmark = {
        id: crypto.randomUUID(),
        timestamp_ms: suggestion.timestamp_ms,
        segment_id: suggestion.segment_id,
        note: suggestion.note,
        created_at: new Date().toISOString(),
      };

      try {
        await addMeetingBookmark(
          JSON.stringify({
            id: bookmark.id,
            meeting_id: meeting.id,
            timestamp_ms: bookmark.timestamp_ms,
            segment_id: bookmark.segment_id ?? null,
            note: bookmark.note ?? null,
            created_at: bookmark.created_at,
          }),
        );
        onBookmarkAccepted(bookmark);
      } catch (err) {
        console.error("[bookmarkSuggestions] Failed to save bookmark:", err);
      }
    }

    setSuggestions([]);
  }, [meeting, suggestions, onBookmarkAccepted]);

  const suggest = useCallback(async () => {
    if (!meeting || isSuggesting) return;

    setIsSuggesting(true);
    setError(null);
    contentRef.current = "";
    isOurGeneration.current = false;

    // Subscribe to stream events before triggering generation
    const cleanups: (() => void)[] = [];

    try {
      const unStart = await onStreamStart((event) => {
        if (event.mode === "BookmarkSuggestions") {
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

        // Parse accumulated response into BookmarkSuggestion[]
        if (meeting && contentRef.current) {
          try {
            const items = parseSuggestionsJSON(contentRef.current);
            setSuggestions(items);
          } catch (err) {
            console.error(
              "[bookmarkSuggestions] Parse failed:",
              err,
            );
            setError(
              "Couldn't parse bookmark suggestions from AI response. Try again.",
            );
          }
        }

        setIsSuggesting(false);
        // Cleanup listeners
        cleanups.forEach((fn) => fn());
        unlistenersRef.current = unlistenersRef.current.filter(
          (fn) => !cleanups.includes(fn),
        );
      });
      cleanups.push(unEnd);

      const unError = await onStreamError((errMsg) => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;
        setError(errMsg);
        setIsSuggesting(false);
        cleanups.forEach((fn) => fn());
        unlistenersRef.current = unlistenersRef.current.filter(
          (fn) => !cleanups.includes(fn),
        );
      });
      cleanups.push(unError);

      unlistenersRef.current.push(...cleanups);

      // Build custom question for the LLM
      const customQuestion =
        "Identify the most important moments in this meeting. Return ONLY a JSON array.";

      // Pass the full transcript (all segments) to the backend.
      const segments = meeting.transcript
        .filter((s) => s.is_final)
        .map((s) => ({
          id: s.id,
          text: s.text,
          speaker: s.speaker,
          timestamp_ms: s.timestamp_ms,
        }));

      await invoke("generate_assist", {
        mode: "BookmarkSuggestions",
        customQuestion,
        transcriptSegments: JSON.stringify(segments),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsSuggesting(false);
      cleanups.forEach((fn) => fn());
    }
  }, [meeting, isSuggesting]);

  const cancel = useCallback(async () => {
    try {
      await invoke("cancel_generation");
    } catch {
      // Non-critical
    }
    isOurGeneration.current = false;
    setIsSuggesting(false);
  }, []);

  return {
    isSuggesting,
    suggestions,
    suggest,
    cancel,
    acceptSuggestion,
    dismissSuggestion,
    acceptAll,
    error,
  };
}
