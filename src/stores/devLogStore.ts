// Global dev log store — collects STT debug/status events at all times
// so the DevLog panel always has history regardless of when it's opened.

import { create } from "zustand";

export interface DevLogEntry {
  id: number;
  level: string; // "info" | "warn" | "error"
  source: string;
  message: string;
  timestamp: Date;
}

const MAX_ENTRIES = 500;
let nextId = 0;

interface DevLogState {
  entries: DevLogEntry[];
  addEntry: (level: string, source: string, message: string) => void;
  clear: () => void;
}

export const useDevLogStore = create<DevLogState>((set) => ({
  entries: [],
  addEntry: (level, source, message) =>
    set((state) => {
      const next = [
        ...state.entries,
        { id: nextId++, level, source, message, timestamp: new Date() },
      ];
      return {
        entries:
          next.length > MAX_ENTRIES
            ? next.slice(next.length - MAX_ENTRIES)
            : next,
      };
    }),
  clear: () => set({ entries: [] }),
}));
