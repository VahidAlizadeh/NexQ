import { create } from "zustand";
import type { SpeakerIdentity, SpeakerStats, SpeakerSource } from "../lib/types";
import { getSpeakerColor, FIXED_SPEAKER_COLORS } from "../lib/speakerColors";

interface SpeakerState {
  speakers: Record<string, SpeakerIdentity>;
  speakerOrder: string[];
  pendingNaming: string | null;

  // Initialization
  initForOnline: () => void;
  initForInPerson: (hasDiarization: boolean) => void;

  // Mutations
  addSpeaker: (speakerId: string) => void;
  renameSpeaker: (speakerId: string, newName: string) => void;
  dismissNaming: () => void;
  updateStats: (speakerId: string, wordCount: number, durationMs: number) => void;

  // Getters
  getSpeaker: (speakerId: string) => SpeakerIdentity | undefined;
  getSpeakerColor: (speakerId: string) => string;
  getSpeakerDisplayName: (speakerId: string) => string;
  getAllSpeakers: () => SpeakerIdentity[];

  // Reset
  reset: () => void;
}

function makeEmptyStats(): SpeakerStats {
  return {
    segment_count: 0,
    word_count: 0,
    talk_time_ms: 0,
    last_spoke_ms: 0,
  };
}

function makeSpeaker(
  id: string,
  displayName: string,
  source: SpeakerSource,
  color?: string
): SpeakerIdentity {
  return {
    id,
    display_name: displayName,
    source,
    color,
    stats: makeEmptyStats(),
  };
}

export const useSpeakerStore = create<SpeakerState>((set, get) => ({
  speakers: {},
  speakerOrder: [],
  pendingNaming: null,

  initForOnline: () => {
    const you = makeSpeaker("you", "You", "fixed", FIXED_SPEAKER_COLORS.you);
    const them = makeSpeaker("them", "Them", "fixed", FIXED_SPEAKER_COLORS.them);
    set({
      speakers: { you, them },
      speakerOrder: ["you", "them"],
      pendingNaming: null,
    });
  },

  initForInPerson: (hasDiarization) => {
    if (hasDiarization) {
      // Pre-register "you" for mic transcription; diarized speakers added dynamically
      const you = makeSpeaker("you", "You", "fixed", FIXED_SPEAKER_COLORS.you);
      set({ speakers: { you }, speakerOrder: ["you"], pendingNaming: null });
    } else {
      // Single shared "room" source + you for mic
      const you = makeSpeaker("you", "You", "fixed", FIXED_SPEAKER_COLORS.you);
      const room = makeSpeaker("room", "Room", "room", FIXED_SPEAKER_COLORS.room);
      set({ speakers: { you, room }, speakerOrder: ["you", "room"], pendingNaming: null });
    }
  },

  addSpeaker: (speakerId) => {
    const state = get();
    // Don't add duplicates
    if (speakerId in state.speakers) return;

    const orderIndex = state.speakerOrder.length;
    const color = getSpeakerColor(speakerId, orderIndex);

    // Parse numeric part of speaker ID for a friendlier display name
    // Deepgram returns IDs like "0", "1", "2" or "speaker_0", etc.
    const numMatch = speakerId.match(/(\d+)/);
    const speakerNum = numMatch ? parseInt(numMatch[1], 10) + 1 : orderIndex + 1;
    const displayName = `Speaker ${speakerNum}`;

    const speaker = makeSpeaker(speakerId, displayName, "diarization", color);

    set((s) => ({
      speakers: { ...s.speakers, [speakerId]: speaker },
      speakerOrder: [...s.speakerOrder, speakerId],
      pendingNaming: speakerId,
    }));
  },

  renameSpeaker: (speakerId, newName) => {
    set((s) => {
      const existing = s.speakers[speakerId];
      if (!existing) return s;
      return {
        speakers: {
          ...s.speakers,
          [speakerId]: { ...existing, display_name: newName },
        },
        pendingNaming: s.pendingNaming === speakerId ? null : s.pendingNaming,
      };
    });
  },

  dismissNaming: () => {
    set({ pendingNaming: null });
  },

  updateStats: (speakerId, wordCount, durationMs) => {
    set((s) => {
      const existing = s.speakers[speakerId];
      if (!existing) return s;
      const stats: SpeakerStats = {
        segment_count: existing.stats.segment_count + 1,
        word_count: existing.stats.word_count + wordCount,
        talk_time_ms: existing.stats.talk_time_ms + durationMs,
        last_spoke_ms: Date.now(),
      };
      return {
        speakers: {
          ...s.speakers,
          [speakerId]: { ...existing, stats },
        },
      };
    });
  },

  getSpeaker: (speakerId) => {
    return get().speakers[speakerId];
  },

  getSpeakerColor: (speakerId) => {
    const state = get();
    const speaker = state.speakers[speakerId];
    if (speaker?.color) return speaker.color;
    const orderIndex = state.speakerOrder.indexOf(speakerId);
    return getSpeakerColor(speakerId, orderIndex >= 0 ? orderIndex : 0);
  },

  getSpeakerDisplayName: (speakerId) => {
    const speaker = get().speakers[speakerId];
    return speaker?.display_name ?? speakerId;
  },

  getAllSpeakers: () => {
    const { speakers, speakerOrder } = get();
    return speakerOrder
      .filter((id) => id in speakers)
      .map((id) => speakers[id]);
  },

  reset: () => {
    set({ speakers: {}, speakerOrder: [], pendingNaming: null });
  },
}));
