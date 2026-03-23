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
function parseSuggestionsJSON(
  raw: string,
  segments?: { id: string; timestamp_ms: number }[],
): BookmarkSuggestion[] {
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

  // Build segment lookup for timestamp resolution
  const segMap = new Map<string, number>();
  if (segments) {
    for (const s of segments) segMap.set(s.id, s.timestamp_ms);
  }

  return parsed
    .map((item: Record<string, unknown>) => {
      const segId = (item.segment_id as string) || undefined;
      let tsMs = typeof item.timestamp_ms === "number" ? item.timestamp_ms : 0;
      // Resolve timestamp from segment_id when missing or zero
      if ((!tsMs || tsMs === 0) && segId && segMap.has(segId)) {
        tsMs = segMap.get(segId)!;
      }
      const note = ((item.note ?? item.description ?? item.reason ?? "") as string).trim();
      return { timestamp_ms: tsMs, segment_id: segId, note };
    })
    .filter((s) => s.note.length > 0);
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

      // Prepare segments for prompt and later timestamp resolution
      const segments = meeting.transcript
        .filter((s) => s.is_final)
        .map((s) => ({
          id: s.id,
          text: s.text,
          speaker: s.speaker,
          timestamp_ms: s.timestamp_ms,
        }));

      const unEnd = await onStreamEnd(async () => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;

        // Parse accumulated response into BookmarkSuggestion[]
        if (meeting && contentRef.current) {
          try {
            const items = parseSuggestionsJSON(contentRef.current, segments);
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

      // Build detailed prompt that specifies the exact JSON schema
      const customQuestion = `Analyze this meeting transcript and identify 5-8 key moments worth bookmarking.

Return a JSON array where each item has these exact fields:
- "segment_id": the exact "id" value from the transcript segment
- "timestamp_ms": the exact "timestamp_ms" value from that segment
- "note": a concise description (8-15 words) of why this moment matters

Good bookmarks highlight: decisions made, action items assigned, important questions, key insights, topic transitions, or commitments.

Return ONLY the JSON array, no other text.
Example: [{"segment_id":"web_abc_1","timestamp_ms":1711234567890,"note":"Agreed to submit proposal by Friday deadline"}]`;

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
