// Sub-PRD 4: Subscribe to transcript_update + transcript_final events
// Connects the Tauri IPC event stream to the Zustand transcript store.
// Also processes speaker_id through speakerStore for enrichment and stats.

import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onTranscriptUpdate, onTranscriptFinal } from "../lib/events";
import { useTranscriptStore } from "../stores/transcriptStore";
import { useSpeakerStore } from "../stores/speakerStore";
import { useConfigStore } from "../stores/configStore";
import type { TranscriptSegment, TranscriptUpdateEvent } from "../lib/types";

// Cache reference to avoid repeated imports
let _meetingStoreRef: typeof import("../stores/meetingStore") | null = null;

/**
 * Process a transcript segment through the speaker store:
 * - Resolve speaker_id from segment metadata (mode-aware)
 * - In in-person mode, discard mic-only "User" segments (room captures everything)
 * - Auto-create speaker if not already tracked
 * - Update speaker stats on final segments
 * - Return enriched segment with speaker_id set, or null to discard
 */
function processSpeaker(segment: TranscriptSegment): TranscriptSegment | null {
  const speakerStore = useSpeakerStore.getState();

  // Check audio mode
  let isInPerson = false;
  try {
    if (_meetingStoreRef) {
      isInPerson = _meetingStoreRef.useMeetingStore.getState().audioMode === "in_person";
    }
  } catch { /* fallback to online mode */ }

  // In in-person mode, discard "User" segments — the room mic captures everyone,
  // so mic/Web Speech transcription is redundant and confusing.
  if (isInPerson && segment.speaker === "User") {
    return null;
  }

  let speakerId: string;

  if (segment.speaker_id) {
    // Diarized segment from Deepgram — use the speaker_id directly
    speakerId = segment.speaker_id;
  } else if (isInPerson) {
    // In-person mode interim without diarization data
    const diarizationEnabled = useConfigStore.getState().diarizationEnabled;
    if (diarizationEnabled) {
      // Pending: diarization will resolve speaker on the final result
      speakerId = "__pending";
    } else {
      // No diarization: everything is "room"
      speakerId = "room";
    }
  } else {
    speakerId = segment.speaker === "User" ? "you" : "them";
  }

  // Skip registration and stats for pending segments
  if (speakerId !== "__pending") {
    if (!speakerStore.getSpeaker(speakerId)) {
      speakerStore.addSpeaker(speakerId);
    }
    if (segment.is_final) {
      const wordCount = segment.text.split(/\s+/).filter(Boolean).length;
      speakerStore.updateStats(speakerId, wordCount, 0);
    }
  }

  return { ...segment, speaker_id: speakerId };
}

/**
 * Hook that subscribes to transcript IPC events and routes them
 * to the transcript store.
 *
 * - "transcript_update" events (interim results) -> updateInterimSegment
 * - "transcript_final" events (final results) -> appendSegment
 *
 * All segments are processed through the speaker store for enrichment.
 * In in-person mode, "User" segments from mic are discarded.
 */
export function useTranscript() {
  const appendSegment = useTranscriptStore((s) => s.appendSegment);
  const updateInterimSegment = useTranscriptStore(
    (s) => s.updateInterimSegment
  );

  // Lazy-load meetingStore reference for mode-aware speaker processing
  if (!_meetingStoreRef) {
    import("../stores/meetingStore").then((mod) => { _meetingStoreRef = mod; });
  }

  // Use refs to avoid re-subscribing when store actions change reference
  const appendRef = useRef(appendSegment);
  const updateRef = useRef(updateInterimSegment);

  useEffect(() => {
    appendRef.current = appendSegment;
    updateRef.current = updateInterimSegment;
  }, [appendSegment, updateInterimSegment]);

  useEffect(() => {
    let unlistenUpdate: UnlistenFn | null = null;
    let unlistenFinal: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      // Subscribe to interim transcript updates — upsert by id
      const unlisten1 = await onTranscriptUpdate(
        (event: TranscriptUpdateEvent) => {
          if (!mounted) return;
          const enriched = processSpeaker(event.segment);
          if (!enriched) return; // Discarded (e.g., "User" in in-person mode)
          updateRef.current(enriched);
        }
      );

      // Subscribe to final transcript results — replace interim in-place (same id)
      const unlisten2 = await onTranscriptFinal(
        (event: TranscriptUpdateEvent) => {
          if (!mounted) return;
          const enriched = processSpeaker(event.segment);
          if (!enriched) return; // Discarded
          // Use updateInterimSegment so it replaces the interim with same id,
          // or appends if no interim existed (e.g., very short utterance)
          updateRef.current(enriched);
        }
      );

      if (mounted) {
        unlistenUpdate = unlisten1;
        unlistenFinal = unlisten2;
      } else {
        unlisten1();
        unlisten2();
      }
    };

    setup();

    return () => {
      mounted = false;
      if (unlistenUpdate) unlistenUpdate();
      if (unlistenFinal) unlistenFinal();
    };
  }, []);
}
