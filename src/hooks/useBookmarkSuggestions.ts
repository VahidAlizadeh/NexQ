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
  console.log("[bookmarkSuggestions] Raw LLM response:", raw.slice(0, 500));

  // Strip thinking tags (Qwen3, DeepSeek, etc.) — handle both closed and unclosed
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")       // Unclosed thinking tag — strip to end
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();

  // Find JSON array start: [ followed by optional whitespace then {
  const arrayMatch = cleaned.match(/\[\s*\{/);
  if (!arrayMatch || arrayMatch.index === undefined) {
    console.error("[bookmarkSuggestions] No JSON array found. Cleaned:", cleaned.slice(0, 300));
    throw new Error("No JSON array found in response");
  }

  const start = arrayMatch.index;
  let end = cleaned.lastIndexOf("}]");
  let jsonStr: string;

  if (end > start) {
    jsonStr = cleaned.slice(start, end + 2);
  } else {
    // Truncated response — salvage complete objects
    const lastBrace = cleaned.lastIndexOf("}");
    if (lastBrace > start) {
      jsonStr = cleaned.slice(start, lastBrace + 1) + "]";
      jsonStr = jsonStr.replace(/,\s*\]$/, "]");
    } else {
      throw new Error("No JSON array found in response");
    }
  }

  let parsed: Record<string, unknown>[];
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const lastComplete = jsonStr.lastIndexOf("},");
    if (lastComplete > 0) {
      parsed = JSON.parse(jsonStr.slice(0, lastComplete + 1) + "]");
    } else {
      throw new Error("Could not parse JSON array from response");
    }
  }

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

      // Merge consecutive same-speaker segments to reduce prompt size
      // (463 raw segments → ~100 merged blocks for a typical 1hr meeting)
      const finals = meeting.transcript.filter((s) => s.is_final);
      const merged: { id: string; text: string; speaker: string; timestamp_ms: number }[] = [];
      for (const seg of finals) {
        const last = merged.length > 0 ? merged[merged.length - 1] : null;
        if (last && last.speaker === seg.speaker) {
          last.text += " " + seg.text;
        } else {
          merged.push({ id: seg.id, text: seg.text, speaker: seg.speaker, timestamp_ms: seg.timestamp_ms });
        }
      }
      // Send merged segments to LLM (compact), but keep all finals for timestamp lookup
      const segments = merged;
      const allSegments = finals.map((s) => ({ id: s.id, timestamp_ms: s.timestamp_ms }));

      const unEnd = await onStreamEnd(async () => {
        if (!isOurGeneration.current) return;
        isOurGeneration.current = false;

        // Parse accumulated response into BookmarkSuggestion[]
        if (meeting && contentRef.current) {
          try {
            const items = parseSuggestionsJSON(contentRef.current, allSegments);
            if (items.length === 0) {
              setError("info:No notable moments found in this meeting. You can add bookmarks manually from the Transcript tab.");
            } else {
              setSuggestions(items);
            }
          } catch (err) {
            console.error("[bookmarkSuggestions] Parse failed:", err);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("No JSON array found")) {
              // LLM returned prose instead of JSON — meeting too short or nothing to bookmark
              setError("info:This meeting doesn't have enough content to suggest bookmarks. You can add bookmarks manually from the Transcript tab.");
            } else {
              setError("Couldn't parse bookmark suggestions. Try again.");
            }
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

      const customQuestion =
        "Identify the most important moments in this meeting transcript. " +
        "Return the segment_id from each transcript line.";

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
