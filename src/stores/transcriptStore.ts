import { create } from "zustand";
import type { TranscriptSegment } from "../lib/types";

interface TranscriptState {
  segments: TranscriptSegment[];
  searchQuery: string;
  autoScroll: boolean;

  // Actions
  appendSegment: (segment: TranscriptSegment) => void;
  updateInterimSegment: (segment: TranscriptSegment) => void;
  finalizeAllInterim: () => void;
  clearSegments: () => void;
  setSearchQuery: (query: string) => void;
  setAutoScroll: (auto: boolean) => void;
  reassignSpeaker: (fromId: string, toId: string) => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  searchQuery: "",
  autoScroll: true,

  appendSegment: (segment) =>
    set((state) => ({
      segments: [...state.segments, segment],
    })),

  updateInterimSegment: (segment) =>
    set((state) => {
      const existing = state.segments.findIndex(
        (s) => s.id === segment.id
      );
      if (existing >= 0) {
        const updated = [...state.segments];
        updated[existing] = segment;
        return { segments: updated };
      }
      return { segments: [...state.segments, segment] };
    }),

  finalizeAllInterim: () =>
    set((state) => ({
      segments: state.segments.map((s) =>
        s.is_final ? s : { ...s, is_final: true }
      ),
    })),

  clearSegments: () => set({ segments: [] }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setAutoScroll: (auto) => set({ autoScroll: auto }),
  reassignSpeaker: (fromId, toId) =>
    set((state) => ({
      segments: state.segments.map((s) =>
        s.speaker_id === fromId ? { ...s, speaker_id: toId } : s
      ),
    })),
}));
