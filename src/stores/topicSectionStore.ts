import { create } from "zustand";
import type { TopicSection } from "../lib/types";

interface TopicSectionState {
  sections: TopicSection[];

  addSection: (section: TopicSection) => void;
  endCurrentSection: (endMs: number) => void;
  clearSections: () => void;
}

export const useTopicSectionStore = create<TopicSectionState>((set, get) => ({
  sections: [],

  addSection: (section) => {
    set((s) => {
      // End the last open section before adding a new one
      const now = section.start_ms;
      const updated = s.sections.map((sec, idx) => {
        const isLast = idx === s.sections.length - 1;
        if (isLast && sec.end_ms === undefined) {
          return { ...sec, end_ms: now };
        }
        return sec;
      });
      return { sections: [...updated, section] };
    });
  },

  endCurrentSection: (endMs) => {
    set((s) => {
      const sections = [...s.sections];
      if (sections.length === 0) return s;
      const last = sections[sections.length - 1];
      if (last.end_ms !== undefined) return s; // already ended
      sections[sections.length - 1] = { ...last, end_ms: endMs };
      return { sections };
    });
  },

  clearSections: () => {
    set({ sections: [] });
  },
}));
